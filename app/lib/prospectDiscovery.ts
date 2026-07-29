import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

// ============================================================================
// Prospect discovery — the top of the outreach funnel.
// ----------------------------------------------------------------------------
// Two sources of prospects, both landing in the `prospects` table where the
// outreach pipeline (research → match → draft → send) takes over:
//   1. sourceProspectsForTender — web-search for real companies that could
//      credibly deliver a given live tender (optional geographic focus, e.g.
//      "Spain" or "United States"), SME-biased, dedup'd against existing
//      prospects and clients.
//   2. importScoutedCompanies — promote the companies Discovery v2 already
//      found (scouted_companies) into the prospect pipeline.
// ============================================================================

const anthropic = new Anthropic({ maxRetries: 4 });
type Supabase = ReturnType<typeof createServerClient>;

interface FoundCompany {
  name: string;
  website: string | null;
  country: string | null;
  rationale: string;
  evidence_url: string | null;
}

const emitTool: Anthropic.Tool = {
  name: 'emit_prospects',
  description: 'Emit the sourced prospect companies.',
  input_schema: {
    type: 'object',
    required: ['companies'],
    properties: {
      companies: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'rationale'],
          properties: {
            name: { type: 'string' },
            website: { type: ['string', 'null'] },
            country: { type: ['string', 'null'], description: 'ISO alpha-2 if known' },
            rationale: { type: 'string', description: 'One or two sentences: why THIS company credibly fits THIS opportunity (cite what they actually do).' },
            evidence_url: { type: ['string', 'null'], description: 'A URL that evidences the fit (their site, a project page, a news item).' },
          },
        },
      },
    },
  },
};

// Normalize for dedup: lowercase name, and bare hostname for websites.
function nameKey(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function hostKey(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function existingKeys(supabase: Supabase): Promise<{ names: Set<string>; hosts: Set<string> }> {
  const names = new Set<string>();
  const hosts = new Set<string>();
  const [{ data: prospects }, { data: clients }] = await Promise.all([
    supabase.from('prospects').select('name, website').limit(1000),
    supabase.from('clients').select('name, website').limit(200),
  ]);
  for (const r of [...(prospects || []), ...(clients || [])]) {
    if (r.name) names.add(nameKey(r.name));
    const h = hostKey(r.website);
    if (h) hosts.add(h);
  }
  return { names, hosts };
}

export interface SourceResult {
  found: number;
  inserted: number;
  skippedDuplicates: number;
  companies: { name: string; website: string | null; rationale: string }[];
}

export async function sourceProspectsForTender(
  supabase: Supabase,
  opts: { tenderId: string; geoFocus?: string | null; count?: number },
): Promise<SourceResult> {
  const count = Math.min(opts.count ?? 5, 10);
  const { data: tender, error } = await supabase
    .from('tenders')
    .select('id, title, description, donor, buyer, country, sectors, value_usd_max, currency, market')
    .eq('id', opts.tenderId).single();
  if (error || !tender) throw new Error(`tender not found: ${error?.message || opts.tenderId}`);

  const { names, hosts } = await existingKeys(supabase);

  const system = `You source B2B prospects for Cooperatr, a business-development platform for cross-border public and development funding.

Given ONE live funding opportunity, USE WEB SEARCH to find REAL companies that could credibly bid for or deliver it. Rules:
- Real, verifiable companies only — find their actual website. Never invent.
- Bias to SMEs and mid-size specialists (they need BD help); avoid the giant primes (Deloitte, Chemonics, DAI, NIRAS, Tetra Tech and similar).
- Each rationale must cite what the company ACTUALLY does (a service line, a project, a geography) — that fit is why they'd open our email.
- Skip any company on the exclude list.
- Prefer companies for whom this opportunity is a plausible stretch-win: right sector, right-ish geography, right size.`;

  const value = tender.value_usd_max ? `${tender.currency === 'EUR' ? '€' : '$'}${Number(tender.value_usd_max).toLocaleString('en-US')}` : 'value n/a';
  const userPrompt = `## The opportunity
Title: ${tender.title}
Funder/buyer: ${tender.donor || tender.buyer || '—'}   Where: ${tender.country || '—'}   Value: ${value}
Sectors: ${(tender.sectors || []).join(', ') || '—'}
Scope: ${(tender.description || '').slice(0, 1200)}

${opts.geoFocus ? `## Geographic focus for the COMPANIES\nPrefer companies based in or strongly active in: ${opts.geoFocus}\n` : ''}
## Exclude (already in our pipeline)
${[...names].slice(0, 60).join(', ') || '(none)'}

Find up to ${count} companies, then call emit_prospects.`;

  const webSearchTool = { type: 'web_search_20250305', name: 'web_search', max_uses: 8 } as unknown as Anthropic.Tool;

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system,
    tools: [webSearchTool, emitTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  let block = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_prospects');
  if (!block || block.type !== 'tool_use') {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system,
      tools: [emitTool],
      tool_choice: { type: 'tool', name: 'emit_prospects' },
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: response.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.TextBlock).text).join('\n') || '(searched)' },
        { role: 'user', content: 'Now emit the companies you found via emit_prospects.' },
      ],
    });
    block = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_prospects');
  }
  if (!block || block.type !== 'tool_use') return { found: 0, inserted: 0, skippedDuplicates: 0, companies: [] };

  const companies = ((block.input as { companies?: FoundCompany[] }).companies || []).filter((c) => c.name?.trim());

  let inserted = 0, skipped = 0;
  const kept: SourceResult['companies'] = [];
  for (const c of companies) {
    const nk = nameKey(c.name);
    const hk = hostKey(c.website);
    if (names.has(nk) || (hk && hosts.has(hk))) { skipped += 1; continue; }
    names.add(nk); if (hk) hosts.add(hk);
    const { error: insErr } = await supabase.from('prospects').insert({
      name: c.name.trim(),
      website: c.website || null,
      country: c.country || null,
      market: tender.market || 'intl_dev',
      source: 'discovery',
      hook_tender_id: tender.id,      // seed the hook; match step re-scores and may replace it
      notes: `Sourced for "${(tender.title || '').slice(0, 90)}" — ${c.rationale}${c.evidence_url ? ` (${c.evidence_url})` : ''}`,
    });
    if (insErr) { skipped += 1; continue; }
    inserted += 1;
    kept.push({ name: c.name, website: c.website, rationale: c.rationale });
  }
  return { found: companies.length, inserted, skippedDuplicates: skipped, companies: kept };
}

export async function importScoutedCompanies(supabase: Supabase, opts?: { limit?: number }): Promise<SourceResult> {
  const limit = Math.min(opts?.limit ?? 25, 100);
  const { data: scouted, error } = await supabase
    .from('scouted_companies')
    .select('name, website, country, description, discovered_for_tender_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`scouted_companies: ${error.message}`);

  const { names, hosts } = await existingKeys(supabase);
  let inserted = 0, skipped = 0;
  const kept: SourceResult['companies'] = [];
  for (const s of scouted || []) {
    if (!s.name) continue;
    const nk = nameKey(s.name);
    const hk = hostKey(s.website);
    if (names.has(nk) || (hk && hosts.has(hk))) { skipped += 1; continue; }
    names.add(nk); if (hk) hosts.add(hk);
    const { error: insErr } = await supabase.from('prospects').insert({
      name: s.name,
      website: s.website || null,
      country: s.country || null,
      market: 'intl_dev',
      source: 'discovery',
      hook_tender_id: s.discovered_for_tender_id || null,
      notes: s.description ? `From discovery pool: ${String(s.description).slice(0, 200)}` : 'From discovery pool',
    });
    if (insErr) { skipped += 1; continue; }
    inserted += 1;
    kept.push({ name: s.name, website: s.website, rationale: 'discovery pool' });
  }
  return { found: (scouted || []).length, inserted, skippedDuplicates: skipped, companies: kept };
}
