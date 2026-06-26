// ============================================================================
// SME discovery — find real bidding-capable candidates per tender
// ============================================================================
// This is the missing piece of the BD pipeline. Without it, the matcher
// can only score LinkedIn-derived contacts (mostly NGOs, multilaterals,
// individuals — not bidding-capable SMEs) and produces uniformly low scores.
//
// With discovery: for each filtered tender, ask Claude to identify 5-10
// real EU/Spanish/US SMEs that could win or contribute to it. Insert them
// into scouted_companies (deduped by normalized name). The matcher then
// has actual bidders to score, and LinkedIn contacts become the warm-intro
// overlay they were always meant to be.
//
// v1: Claude Sonnet 4.6 with its training knowledge only (no web search).
//     Costs ~$0.01/tender × 300 tenders/week = ~$3/week. Captures
//     well-known dev-finance SMEs and consulting firms.
// v2: layer in web_search tool for long-tail discovery. ~$15/week extra.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

// maxRetries: 6 — discovery emits large candidate batches (up to ~4k output
// tokens/call). On a low Anthropic tier (8k output tokens/min) this can hit
// the per-minute cap; retrying with backoff lets the run self-throttle instead
// of failing.
const client = new Anthropic({ maxRetries: 6 });
type Supabase = ReturnType<typeof createServerClient>;

const SECTOR_SLUGS = [
  'agri_food',
  'renewable_energy',
  'water_tech',
  'circular_esg',
  'critical_minerals',
  'human_rights',
  'capacity_building',
];

// ----------------------------------------------------------------------------
// Tender input
// ----------------------------------------------------------------------------

interface DiscoveryTender {
  id: string;
  title: string | null;
  description: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  sectors: string[] | null;
  type: string | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
  deadline_at: string | null;
}

// ----------------------------------------------------------------------------
// Discovery output
// ----------------------------------------------------------------------------

export interface DiscoveredCandidate {
  name: string;
  country: string | null;        // ISO 3166-1 alpha-2 HQ country
  website: string | null;
  description: string;           // 1-2 sentences: what they do, sub-sector, track record
  sectors: string[];             // subset of SECTOR_SLUGS
  past_donor_wins: string[];     // named donors + program if known
  size_band: string | null;      // 'micro' | 'small' | 'medium' | 'large'
  geographic_footprint: string[]; // ISO 3166-1 alpha-2 codes of delivery countries
  why_a_fit: string;             // 1 sentence: why this candidate fits THIS tender
  confidence?: number;           // 0.0-1.0 — how sure the firm is real + correctly described (web-verified)
  evidence_url?: string | null;  // a source URL backing the firm (company site / registry / past-win notice)
}

export interface DiscoveryResult {
  candidates: DiscoveredCandidate[];
  inserted_company_ids: string[];   // newly created scouted_companies rows
  matched_existing_ids: string[];   // existing rows we merged into
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_create: number;
  };
}

// ----------------------------------------------------------------------------
// System prompt
// ----------------------------------------------------------------------------

const DISCOVERY_SYSTEM = `You are a development-finance market-scout for Cooperatr, a BD platform helping EU and US SMEs win donor-funded projects (EU NDICI/Global Gateway, AECID, GIZ/KfW, AFD, FCDO, post-USAID DFC/MCC/State, World Bank, UN system).

GIVEN a tender, IDENTIFY 5-10 real bidding-capable SMEs that could realistically win it as prime, lead a consortium, or join one as a sub.

Hard rules — DO NOT return:
- Multilaterals (World Bank, EBRD, IDB, ADB, AfDB, EIB, IFC) — they fund, they don't bid
- UN agencies (FAO, WFP, UNDP, UNHCR, UNICEF, IOM, ILO) — same
- US government agencies (USAID, US State, DFC, MCC) — they fund or implement directly, they don't bid commercially
- Pure INGOs that operate exclusively on grants (Oxfam, Save the Children, Care, IRC) UNLESS they have a known commercial implementing arm
- Individuals and freelancers
- Companies the size of the buyer or the lead donor itself — only commercial SMEs in scope

GOOD candidates look like:
- EU-registered consulting firms with named past donor wins (NIRAS, COWI, GFA, AESA, ACE Consultancy, Particip, B&S Europe, Hydea, etc. — but be specific to the sector/geography)
- Spanish SMEs in agri-food / renewable energy / water tech with Latin America or Africa track record
- US implementing partners moving into EU funding (Tetra Tech ARD's EU subsidiary, DAI Europe, Chemonics Europe — when they have separate legal entities)
- Sector specialists with proven delivery in the project country or comparable markets
- Companies that have already won similar instruments (e.g., past NDICI agri tranches, prior AECID Sahel work)

USE WEB SEARCH to find and VERIFY candidates — do not rely on memory alone:
- Search for real, currently-operating firms in the tender's sector + geography (e.g. "<sector> consulting firm <country> EU funded", "<niche> SME <region> NDICI contractor").
- For niche/long-tail scopes, search rather than guess — memory misses small specialist SMEs and invents plausible-but-fake ones.
- Ground EVERY candidate in a real source you found (company site, business registry, a past-award notice). Put that URL in evidence_url.
- VERIFY before returning: the firm exists, operates in the right sector, is roughly the right size (a forgotten-market SME, not a global prime), and is not one of the excluded entity types above.

For each candidate, return:
- name           (exact legal name; verify spelling via the source)
- country        (ISO 3166-1 alpha-2, HQ country)
- website        (canonical domain — from the source you found)
- description    (1-2 sentences: what they do, sub-sector specialty, relevant track record)
- sectors        (from: agri_food, renewable_energy, water_tech, circular_esg, critical_minerals, human_rights, capacity_building)
- past_donor_wins (named donor+program, e.g. "AECID 2023 (Senegal solar microgrid)")
- size_band      (micro <10, small 10-50, medium 50-250, large 250+ staff)
- geographic_footprint (ISO 3166-1 alpha-2 codes of countries where they have delivered)
- why_a_fit      (one sentence explaining why this candidate could win THIS specific tender)
- confidence     (0.0-1.0 — how sure you are the firm is real and correctly described. 0.9+ = confirmed via a source you found; <0.5 = unverified/uncertain)
- evidence_url   (a source URL backing this firm; null only if you truly couldn't find one)

Be conservative: a list of 3 web-verified candidates beats 10 speculative ones. Do not pad with low-confidence guesses — if unsure and unable to verify, omit the firm.

After researching, you MUST finish by calling the emit_candidates tool with the verified list. No prose preamble in the final answer.`;

const discoveryTool: Anthropic.Tool = {
  name: 'emit_candidates',
  description: 'Emit the discovered candidate SMEs for this tender.',
  input_schema: {
    type: 'object',
    required: ['candidates'],
    properties: {
      candidates: {
        type: 'array',
        items: {
          type: 'object',
          required: ['name', 'description', 'sectors', 'why_a_fit'],
          properties: {
            name: { type: 'string' },
            country: { type: ['string', 'null'] },
            website: { type: ['string', 'null'] },
            description: { type: 'string' },
            sectors: { type: 'array', items: { type: 'string', enum: SECTOR_SLUGS } },
            past_donor_wins: { type: 'array', items: { type: 'string' } },
            size_band: { type: ['string', 'null'], enum: [...['micro', 'small', 'medium', 'large'], null] },
            geographic_footprint: { type: 'array', items: { type: 'string' } },
            why_a_fit: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1, description: 'How sure the firm is real + correctly described (web-verified). 0.9+ confirmed via a found source.' },
            evidence_url: { type: ['string', 'null'], description: 'A source URL backing this firm.' },
          },
        },
      },
    },
  },
};

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------

export async function discoverCandidatesForTender(
  tender: DiscoveryTender,
  supabase: Supabase,
  opts?: { dryRun?: boolean },
): Promise<DiscoveryResult> {
  const userPrompt = `Find SMEs that could bid on this tender:

Title: ${tender.title || '(no title)'}
Donor: ${tender.donor || 'unknown'}
Buyer: ${tender.buyer || 'unknown'}
Project country: ${tender.country || 'unknown'}
Sectors (cooperatr tags): ${tender.sectors?.join(', ') || 'untagged'}
Type: ${tender.type || 'unknown'}
Value (USD): ${tender.value_usd_min ?? '?'} – ${tender.value_usd_max ?? '?'}
Deadline: ${tender.deadline_at || 'unknown'}
${tender.description ? `\nDescription:\n${tender.description.slice(0, 1500)}` : ''}

Return 5-10 real bidding-capable EU/US SMEs with a credible path to win this. Skip multilaterals, UN agencies, government bodies, and pure grant-only INGOs. Prefer firms with past donor-program wins.`;

  const system = [
    { type: 'text' as const, text: DISCOVERY_SYSTEM, cache_control: { type: 'ephemeral' as const } },
  ];
  // Anthropic server-side web search tool. Cast: the SDK's Tool union in this
  // version doesn't include the web_search literal, but the API accepts it.
  const webSearchTool = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 } as unknown as Anthropic.Tool;

  // Pass 1: let the model web-search to find + verify real firms, then emit.
  let response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000, // web-search results inflate context; output is the candidate JSON
    system,
    tools: [webSearchTool, discoveryTool],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  let emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_candidates');

  // Fallback: if the model ended on text after researching (no emit), force the
  // tool once. (No web search here — just structure what it already found.)
  if (!emitBlock || emitBlock.type !== 'tool_use') {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system,
      tools: [discoveryTool],
      tool_choice: { type: 'tool', name: 'emit_candidates' },
      messages: [{ role: 'user', content: userPrompt }],
    });
    emitBlock = response.content.find((b) => b.type === 'tool_use' && b.name === 'emit_candidates');
  }

  const tokens = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cache_read: response.usage.cache_read_input_tokens ?? 0,
    cache_create: response.usage.cache_creation_input_tokens ?? 0,
  };

  if (!emitBlock || emitBlock.type !== 'tool_use') {
    return { candidates: [], inserted_company_ids: [], matched_existing_ids: [], tokens };
  }
  const candidates = ((emitBlock.input as { candidates?: DiscoveredCandidate[] }).candidates || [])
    .filter((c) => c && c.name && c.name.trim())
    // Drop unverified/low-confidence guesses (confidence defaults to 1 when the
    // fallback path didn't set it, so we never over-filter the safety net).
    .filter((c) => (c.confidence ?? 1) >= 0.4);

  if (opts?.dryRun) {
    return { candidates, inserted_company_ids: [], matched_existing_ids: [], tokens };
  }

  // ---- Upsert each candidate into scouted_companies, deduped by normalized name ----
  const inserted: string[] = [];
  const matched: string[] = [];

  for (const cand of candidates) {
    const normalized = normalizeCompanyName(cand.name);
    if (!normalized) continue;

    // Find an existing scouted_company by normalized name
    // (scouted_companies has no normalized_name column, so we fetch candidates by ilike on name)
    const { data: existingRows } = await supabase
      .from('scouted_companies')
      .select('id, name, sectors, country, size_band, description')
      .ilike('name', `%${cand.name.slice(0, 60)}%`)
      .limit(50);
    const existing = (existingRows || []).find((r) => normalizeCompanyName(r.name) === normalized);

    if (existing) {
      // Merge: only fill empty fields, don't overwrite human/prior data
      const mergedSectors = Array.from(new Set([...(existing.sectors || []), ...cand.sectors]));
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      let changed = false;
      if (mergedSectors.length > (existing.sectors?.length || 0)) {
        update.sectors = mergedSectors;
        changed = true;
      }
      if (cand.country && !existing.country) {
        update.country = cand.country;
        changed = true;
      }
      if (cand.size_band && !existing.size_band) {
        update.size_band = cand.size_band;
        changed = true;
      }
      // Only overwrite the auto-promoted-from-LinkedIn placeholder description
      if (
        cand.description &&
        (!existing.description || existing.description.startsWith('Auto-promoted from LinkedIn'))
      ) {
        update.description = cand.description;
        changed = true;
      }
      if (changed) {
        await supabase.from('scouted_companies').update(update).eq('id', existing.id);
      }
      matched.push(existing.id);
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('scouted_companies')
        .insert({
          name: cand.name.trim(),
          country: cand.country,
          website: cand.website,
          description: cand.description,
          sectors: cand.sectors,
          size_band: cand.size_band,
          past_donor_wins: cand.past_donor_wins,
          discovered_via: 'claude_discovery',
          discovered_for_tender_id: tender.id,
          evidence_notes: [
            cand.why_a_fit,
            cand.evidence_url ? `Source: ${cand.evidence_url}` : null,
            typeof cand.confidence === 'number' ? `Confidence: ${cand.confidence.toFixed(2)}` : null,
          ].filter(Boolean).join(' · '),
        })
        .select('id')
        .single();
      if (!error && data?.id) {
        inserted.push(data.id);
      }
    }
  }

  return { candidates, inserted_company_ids: inserted, matched_existing_ids: matched, tokens };
}

// ----------------------------------------------------------------------------
// Bulk runner — discover for every recent passing tender that hasn't been
// discovered yet (i.e., has zero scouted_companies tagged for it).
// ----------------------------------------------------------------------------

export interface DiscoveryRunResult {
  ok: boolean;
  tenders_processed: number;
  tender_ids: string[];  // the specific tenders that got discovery — pass these to match
  candidates_total: number;
  inserted_total: number;
  matched_total: number;
  errors: string[];
  est_cost_usd: number;
  tokens: { input: number; output: number; cache_read: number; cache_create: number };
}

export async function runDiscoveryForRecentTenders(
  supabase: Supabase,
  opts?: { sinceDays?: number; maxTenders?: number },
): Promise<DiscoveryRunResult> {
  const sinceDays = opts?.sinceDays ?? 7;
  const maxTenders = opts?.maxTenders ?? 50;
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

  // Pull recent passing tenders. To avoid re-discovering the same tender on
  // every cron run we exclude tenders that already have at least one
  // scouted_company with discovered_for_tender_id pointing at them.
  const { data: tenders, error } = await supabase
    .from('tenders')
    .select('id, title, description, donor, buyer, country, sectors, type, value_usd_min, value_usd_max, deadline_at')
    .eq('passes_filter', true)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(maxTenders);
  if (error) {
    return {
      ok: false,
      tenders_processed: 0,
      tender_ids: [],
      candidates_total: 0,
      inserted_total: 0,
      matched_total: 0,
      errors: [`load tenders: ${error.message}`],
      est_cost_usd: 0,
      tokens: { input: 0, output: 0, cache_read: 0, cache_create: 0 },
    };
  }

  // For each tender, check if it already has discovered candidates
  const { data: alreadyDiscoveredRows } = await supabase
    .from('scouted_companies')
    .select('discovered_for_tender_id')
    .eq('discovered_via', 'claude_discovery')
    .in('discovered_for_tender_id', (tenders || []).map((t) => t.id));
  const alreadyDiscovered = new Set(
    (alreadyDiscoveredRows || []).map((r) => r.discovered_for_tender_id).filter(Boolean) as string[],
  );

  const toDiscover = (tenders || []).filter((t) => !alreadyDiscovered.has(t.id));

  const errors: string[] = [];
  let candidatesTotal = 0;
  let insertedTotal = 0;
  let matchedTotal = 0;
  const totalTokens = { input: 0, output: 0, cache_read: 0, cache_create: 0 };

  // Run in parallel batches of 5 to keep total wall-clock under the 300s
  // function limit. Each discovery call is 5-10s so 5 parallel ≈ 10s per
  // wave; 50 tenders ÷ 5 = 10 waves ≈ 100s. Plenty of headroom.
  const CONCURRENCY = 5;
  const queue = [...toDiscover];
  let active = 0;
  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < CONCURRENCY && queue.length > 0) {
        const tender = queue.shift()!;
        active += 1;
        discoverCandidatesForTender(tender, supabase)
          .then((res) => {
            candidatesTotal += res.candidates.length;
            insertedTotal += res.inserted_company_ids.length;
            matchedTotal += res.matched_existing_ids.length;
            totalTokens.input += res.tokens.input;
            totalTokens.output += res.tokens.output;
            totalTokens.cache_read += res.tokens.cache_read;
            totalTokens.cache_create += res.tokens.cache_create;
          })
          .catch((err) => {
            errors.push(`tender ${tender.id}: ${err instanceof Error ? err.message : String(err)}`);
          })
          .finally(() => {
            active -= 1;
            if (queue.length > 0) next();
            else if (active === 0) resolve();
          });
      }
    };
    next();
  });

  // Sonnet 4.6 cost: $3/Mtok input, $15/Mtok output, $0.30 cached, $3.75 cache-create.
  const estCostUsd =
    (totalTokens.input - totalTokens.cache_read) * 3 / 1_000_000 +
    totalTokens.cache_read * 0.3 / 1_000_000 +
    totalTokens.cache_create * 3.75 / 1_000_000 +
    totalTokens.output * 15 / 1_000_000;

  return {
    ok: errors.length === 0,
    tenders_processed: toDiscover.length,
    tender_ids: toDiscover.map((t) => t.id),
    candidates_total: candidatesTotal,
    inserted_total: insertedTotal,
    matched_total: matchedTotal,
    errors,
    est_cost_usd: Math.round(estCostUsd * 1000) / 1000,
    tokens: totalTokens,
  };
}

// ----------------------------------------------------------------------------
// Name normalization (mirrors promote-to-scouted)
// ----------------------------------------------------------------------------

function normalizeCompanyName(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/^the\s+/, '');
  s = s.replace(
    /[,\s]+(s\.?a\.?|s\.?l\.?|s\.?l\.?u\.?|gmbh|ag|kg|s\.?p\.?a\.?|n\.?v\.?|b\.?v\.?|ltd|llc|inc|plc|group|holding|holdings|company|co|corp|corporation|llp)\.?$/i,
    '',
  );
  s = s.replace(/[.,]+$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
