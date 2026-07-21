import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';
import { cooperatrProfileBlock } from '@/app/lib/cooperatrProfile';

// ============================================================================
// Client-side matching — score (client × tender) FROM the client's side.
// Unlike the SME matcher (which asks "does this firm need Cooperatr?"), a client
// is already ours: we score how well THIS client fits the tender (sector,
// geography, capability, deal band) + the CEO's relevant background/network.
// ============================================================================

const client = new Anthropic({ maxRetries: 5 });
type Supabase = ReturnType<typeof createServerClient>;

export interface ClientRow {
  id: string;
  name: string;
  description: string | null;
  sectors: string[] | null;
  geographies: string[] | null;
  size_band: string | null;
  capabilities: string | null;
  past_wins: string[] | null;
  certifications: string[] | null;
  ceo_name: string | null;
  ceo_background: string | null;
  market: string | null;   // 'intl_dev' | 'us_domestic' — which tender universe to match against
}

interface TenderRow {
  id: string;
  source: string;
  source_ref: string;
  title: string | null;
  description: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  sectors: string[] | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
}

export interface ClientMatchScore {
  score: number;
  rationale: string;
  fit_dimensions: { sector: number; geography: number; capability: number; deal_band: number; ceo_reach: number; [k: string]: number };
  partner_stack?: string[];
  risks?: string[];
}

const scoreTool: Anthropic.Tool = {
  name: 'emit_client_match',
  description: 'Emit the (client × tender) fit assessment.',
  input_schema: {
    type: 'object',
    required: ['score', 'rationale', 'fit_dimensions'],
    properties: {
      score: { type: 'number', minimum: 0, maximum: 100, description: 'Overall 0-100 fit of THIS client to THIS tender. 85+ pursue now; 65-84 strong; <40 skip.' },
      rationale: { type: 'string', description: 'One tight paragraph citing concrete evidence — sector, geography, a capability, a past win, or the CEO’s relevant background.' },
      fit_dimensions: {
        type: 'object',
        required: ['sector', 'geography', 'capability', 'deal_band', 'ceo_reach'],
        properties: {
          sector: { type: 'number', minimum: 0, maximum: 1 },
          geography: { type: 'number', minimum: 0, maximum: 1 },
          capability: { type: 'number', minimum: 0, maximum: 1 },
          deal_band: { type: 'number', minimum: 0, maximum: 1 },
          ceo_reach: { type: 'number', minimum: 0, maximum: 1, description: "How much the CEO's background/network/geographic reach helps win this specific tender." },
        },
      },
      partner_stack: { type: 'array', items: { type: 'string' }, description: 'Optional: named partner archetypes the client would need to win this.' },
      risks: { type: 'array', items: { type: 'string' } },
    },
  },
};

function systemPrompt(): string {
  return `You are Cooperatr's client-BD strategist. Cooperatr represents SME clients and finds donor-funded tenders that fit them.

${cooperatrProfileBlock()}

You are given ONE of Cooperatr's clients and ONE tender. Score how well THIS client fits THIS tender — this client is already ours, so do NOT judge "need for Cooperatr". Judge tender-fit:
- sector      overlap between the tender scope and the client's real capabilities/service lines
- geography   can the client plausibly deliver where the work is? (weigh the CEO's geographic reach)
- capability  do the client's concrete capabilities + past wins + certifications map to the tender scope?
- deal_band   is the tender value compatible with the client's size? too-big (can't lead) and too-small (uneconomic) both hurt
- ceo_reach   does the CEO's background, sector network or donor relationships materially help win THIS tender? (e.g. a former USAID leader on a US-funded tender)

Calibration: 85-100 pursue now (sharp fit + a real edge); 65-84 strong with a named partner to close a gap; 40-64 uncertain; 0-39 skip (wrong sector/size/geography). Be calibrated, not generous. Cite concrete evidence. Call out risks and any partners the client would need.

Output exactly one call to emit_client_match. No preamble.`;
}

export async function scoreClientTender(clientRow: ClientRow, tender: TenderRow): Promise<ClientMatchScore> {
  const clientBlock = `## Client (Cooperatr represents them)
Name: ${clientRow.name}
Sectors: ${(clientRow.sectors || []).join(', ') || '—'}
Delivery geographies: ${(clientRow.geographies || []).join(', ') || '—'}
Size: ${clientRow.size_band || '—'}
Capabilities: ${clientRow.capabilities || '—'}
Past wins: ${(clientRow.past_wins || []).join(' · ') || '—'}
Certifications: ${(clientRow.certifications || []).join(', ') || '—'}
CEO: ${clientRow.ceo_name || '—'}${clientRow.ceo_background ? ` — ${clientRow.ceo_background}` : ''}

Description:
${clientRow.description || '—'}`;

  const tenderBlock = `## Tender
Source: ${tender.source} (${tender.source_ref})
Title: ${tender.title || '—'}
Donor: ${tender.donor || '—'}  Buyer: ${tender.buyer || '—'}  Country: ${tender.country || '—'}
Sectors: ${(tender.sectors || []).join(', ') || '—'}
Value (USD): ${tender.value_usd_min ?? '?'} – ${tender.value_usd_max ?? '?'}

Description:
${(tender.description || '').slice(0, 1600)}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 900,
    system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }] as Anthropic.Messages.MessageCreateParams['system'],
    tools: [scoreTool],
    tool_choice: { type: 'tool', name: 'emit_client_match' },
    messages: [{ role: 'user', content: `${clientBlock}\n\n${tenderBlock}\n\nScore this pairing now via emit_client_match.` }],
  });

  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('client match: no tool use');
  return block.input as ClientMatchScore;
}

// Match a client against the relevant tender pool (passing + fit-worthy), persist.
export async function matchClientAgainstTenders(
  supabase: Supabase,
  clientId: string,
  opts: { maxTenders?: number } = {},
): Promise<{ scored: number; written: number; errors: string[] }> {
  const { maxTenders = 30 } = opts;
  const errors: string[] = [];

  const { data: c, error: cErr } = await supabase.from('clients').select('*').eq('id', clientId).single();
  if (cErr || !c) throw new Error(`client not found: ${cErr?.message || 'no row'}`);
  const clientRow = c as ClientRow;

  // Pool = the client's OWN market universe. A US-domestic client matches
  // grants.gov (market='us_domestic'); an international client matches the EU/
  // intl-dev tenders. Never cross the streams.
  const market = clientRow.market || 'intl_dev';
  let q = supabase
    .from('tenders')
    .select('id, source, source_ref, title, description, donor, buyer, country, sectors, value_usd_min, value_usd_max')
    .eq('passes_filter', true)
    .eq('market', market);
  // The intl-dev tender-fit gate doesn't apply to us_domestic grants (they're
  // pre-relevant), so only skip-filter the intl universe.
  if (market === 'intl_dev') q = q.neq('tender_fit_verdict', 'skip');
  const { data: tenders, error: tErr } = await q
    .order('tender_fit_score', { ascending: false, nullsFirst: false })
    .limit(maxTenders);
  if (tErr) throw new Error(`tenders: ${tErr.message}`);

  const pool = (tenders || []) as TenderRow[];
  const poolIds = new Set(pool.map((t) => t.id));

  // Clear stale matches from the OTHER market (e.g. after the client's market
  // changed) so a portal never shows opportunities from the wrong universe.
  const { data: existing } = await supabase.from('client_tender_matches').select('id, tender_id').eq('client_id', clientId);
  const stale = (existing || []).filter((m) => !poolIds.has((m as { tender_id: string }).tender_id));
  // Only prune ones whose tender is in a different market (keep same-market history).
  if (stale.length) {
    const staleTenderIds = stale.map((m) => (m as { tender_id: string }).tender_id);
    const { data: staleTenders } = await supabase.from('tenders').select('id, market').in('id', staleTenderIds);
    const otherMarketIds = (staleTenders || []).filter((t) => (t as { market: string }).market !== market).map((t) => (t as { id: string }).id);
    if (otherMarketIds.length) {
      await supabase.from('client_tender_matches').delete().eq('client_id', clientId).in('tender_id', otherMarketIds);
    }
  }

  // Score with light concurrency to stay under the function time budget.
  let scored = 0, written = 0;
  const CONCURRENCY = 4;
  const queue = [...pool];
  async function worker() {
    while (queue.length) {
      const t = queue.shift()!;
      try {
        const s = await scoreClientTender(clientRow, t);
        scored += 1;
        const { error: upErr } = await supabase.from('client_tender_matches').upsert({
          client_id: clientId, tender_id: t.id, score: s.score, rationale: s.rationale,
          fit_dimensions: s.fit_dimensions, partner_stack: s.partner_stack ?? null, risks: s.risks ?? null,
          matched_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }, { onConflict: 'client_id,tender_id' });
        if (upErr) errors.push(`${t.source_ref}: ${upErr.message}`); else written += 1;
      } catch (err) {
        errors.push(`${t.source_ref}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { scored, written, errors };
}
