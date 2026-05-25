import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';

// ============================================================================
// BD Matcher — scores (tender × scouted_company) pairings with Claude Sonnet 4.6
// ============================================================================
//
// Pipeline per tender:
//   1. Retrieve N candidate scouted_companies (warm-intro contacts first,
//      then sector + geography filter)
//   2. One structured Sonnet call per (tender, candidate) pair returning
//      { score, rationale, fit_dimensions, partner_stack?, risks? }
//   3. Idempotent upsert into tender_matches on (tender_id, scouted_company_id)
//
// Prompt caching: the system block (matcher persona + tender profile) is
// identical across the N candidate calls for one tender, so it's cached
// ephemerally — candidates 2..N read from cache.
//
// Cost shape: 300 tenders/week × 5 candidates ≈ 1,500 Sonnet calls/week.
// At current pricing roughly $5–15/week with cache hits. See BD-SCANNER.md.
// ============================================================================

const client = new Anthropic();

// EU-27 + Dominican Republic + USA (per filter spec). The tender's own buyer
// country is also added at retrieval time. Empty-country candidates are not
// excluded — the matcher can ask the LLM to weigh in.
const IN_SCOPE_COUNTRIES = new Set<string>([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES',
  'SE',
  'DO', 'US', 'USA',
]);

// ----------------------------------------------------------------------------
// Row types — mirror migration 010 columns we read here
// ----------------------------------------------------------------------------

export interface TenderRow {
  id: string;
  source: string;
  source_ref: string;
  url: string | null;
  title: string | null;
  description: string | null;
  donor: string | null;
  buyer: string | null;
  country: string | null;
  region: string | null;
  sectors: string[] | null;
  type: string | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
  currency: string | null;
  published_at: string | null;
  deadline_at: string | null;
  passes_filter: boolean;
}

export interface ScoutedCompanyRow {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  linkedin_url: string | null;
  description: string | null;
  sectors: string[] | null;
  size_band: string | null;
  certifications: string[] | null;
  past_donor_wins: string[] | null;
  discovered_via: string | null;
  evidence_notes: string | null;
}

export interface LinkedinContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  position: string | null;
  company_name: string | null;
  scouted_company_id: string | null;
  connected_on: string | null;
}

// ----------------------------------------------------------------------------
// LLM types — what the structured tool returns
// ----------------------------------------------------------------------------

export interface FitDimensions {
  sector: number;
  geography: number;
  capability: number;
  size: number;
  [key: string]: number;
}

export interface MatchScore {
  score: number;
  rationale: string;
  fit_dimensions: FitDimensions;
  partner_stack?: string[];
  risks?: string[];
}

export interface ScoredCandidate extends MatchScore {
  scouted_company_id: string;
  warm_intro_via_contact_id: string | null;
}

// ----------------------------------------------------------------------------
// Prompt + tool definition
// ----------------------------------------------------------------------------

const MATCHER_SYSTEM_PROMPT = `You are Cooperatr's BD Matcher — a senior development-finance strategist scoring (tender × SME) pairings for an internal pipeline. The pipeline is push-mode: tenders are ingested from donor feeds and matched against SMEs the team has scouted (some are warm-intro contacts from the admin's LinkedIn network, others discovered via web search or CORDIS).

Calibration anchors:
- 85-100  Pursue immediately. Sector and capability fit; geography works (in-country, or company has strong prior delivery in similar markets); warm intro or strong past-win evidence.
- 65-84   Pursue as a coalition. Sector fits AND the company brings something genuinely distinctive — a specific certification, proprietary capability, sub-domain specialty, EU regulatory standing, or a track record the local market doesn't have. A named partner archetype closes the remaining gap and would actually want this SME in the consortium.
- 40-64   Uncertain coalition. Some signal exists but the SME's distinctive value-add is weak, OR the partner would do most of the work (meaning they could just bid without this SME). Surface for human review.
- 0-39    Skip. Wrong sector, wrong size, legal exclusion, OR the SME has no edge a competent local alternative couldn't match.

A partner_stack is not a free pass. Ask: why would the local partner want this SME in the consortium? If the answer is "no reason — they could win this alone," score in the 30s. If the SME brings something the local market doesn't have, score 60+. The score reflects coalition viability, not the existence of a theoretical partnership.

Dimensions you must score (each 0.0-1.0):
- sector       overlap between tender sectors[] and company sectors[]
- geography    can this SME plausibly deliver in the buyer country / project country?
- capability   do described capabilities, certifications, and past donor wins map to the tender scope?
- size         is the tender value compatible with the company's size band? Both too-big (won't be selected as lead) and too-small (uneconomic to bid) hurt the score.

Add additional dimensions if the pairing calls for them (e.g. language_fit, regulatory_alignment, coalition_viability) — keep them 0.0-1.0.

Cooperatr's BD model is small cross-border coalitions. Geographic gaps are partnership opportunities only when the SME has distinctive value that justifies consortium overhead. When a personal LinkedIn contact is named (warm-intro signal), weight the overall score up — but only if the underlying coalition logic actually works. A warm intro doesn't fix a fundamentally weak fit.

Be calibrated, not generous. A sharp 45 with a clear risk note is more useful than an inflated 70. Cite concrete evidence (named donor, sector token, country, certification, past-win). Call out concrete risks in the risks[] array.

Output exactly ONE call to emit_match. Do not write any preamble before the tool call.`;

const matcherTool: Anthropic.Tool = {
  name: 'emit_match',
  description: 'Emit the structured (tender × scouted_company) match assessment.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'number',
        description: 'Overall fit on 0-100. Calibrated, not inflated. 85+ = pursue immediately; 65-84 = interesting; under 40 = skip.',
        minimum: 0,
        maximum: 100,
      },
      rationale: {
        type: 'string',
        description: 'One tight paragraph (~400-600 characters). Why this pairing makes sense (or does not). Cite concrete evidence: named sector, donor, country, certification, or past win.',
      },
      fit_dimensions: {
        type: 'object',
        description: 'Per-dimension 0.0-1.0 scores. Required keys: sector, geography, capability, size. Add other dimensions (e.g. language_fit) if useful.',
        properties: {
          sector: { type: 'number', minimum: 0, maximum: 1 },
          geography: { type: 'number', minimum: 0, maximum: 1 },
          capability: { type: 'number', minimum: 0, maximum: 1 },
          size: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['sector', 'geography', 'capability', 'size'],
      },
      partner_stack: {
        type: 'array',
        description: 'Optional. Named complementary partners the SME would need to win this — keep to 2-4 entries naming the role + a concrete archetype (e.g. "local M&E firm in Senegal", "EU-based prime with NDICI track record").',
        items: { type: 'string' },
      },
      risks: {
        type: 'array',
        description: 'Optional. Concrete risks for this pairing (e.g. "no local presence in buyer country", "donor preference for primes over SMEs", "tender value above company typical project size").',
        items: { type: 'string' },
      },
    },
    required: ['score', 'rationale', 'fit_dimensions'],
  },
};

// ----------------------------------------------------------------------------
// Prompt builders
// ----------------------------------------------------------------------------

function tenderProfile(t: TenderRow): string {
  const value =
    t.value_usd_min == null && t.value_usd_max == null
      ? 'unknown'
      : `${t.value_usd_min ?? '?'} – ${t.value_usd_max ?? '?'} USD${t.currency ? ` (original ${t.currency})` : ''}`;
  return `## Tender
Source: ${t.source} (${t.source_ref})
Title: ${t.title || '—'}
Donor: ${t.donor || '—'}
Buyer: ${t.buyer || '—'}
Country: ${t.country || '—'}  (region: ${t.region || '—'})
Sectors: ${(t.sectors || []).join(', ') || '—'}
Type: ${t.type || '—'}
Value: ${value}
Published: ${t.published_at || '—'}  Deadline: ${t.deadline_at || '—'}

Description:
${(t.description || '').slice(0, 1800)}`;
}

function candidateProfile(c: ScoutedCompanyRow, warm: LinkedinContactRow | null): string {
  const warmBlock = warm
    ? `\n\n## Warm-intro signal
LinkedIn contact: ${[warm.first_name, warm.last_name].filter(Boolean).join(' ') || '(name redacted)'}
Position: ${warm.position || '—'}
Company on contact card: ${warm.company_name || c.name}
Connected on: ${warm.connected_on || '—'}`
    : '';
  return `## Candidate SME
Name: ${c.name}
Country: ${c.country || '—'}
Sectors: ${(c.sectors || []).join(', ') || '—'}
Size band: ${c.size_band || '—'}
Certifications: ${(c.certifications || []).join(', ') || '—'}
Past donor wins: ${(c.past_donor_wins || []).join(', ') || '—'}
Discovered via: ${c.discovered_via || '—'}
Website: ${c.website || '—'}

Description:
${(c.description || '').slice(0, 800)}

Evidence notes:
${(c.evidence_notes || '').slice(0, 600)}${warmBlock}`;
}

// ----------------------------------------------------------------------------
// scoreMatch — one Sonnet call per (tender, candidate)
// ----------------------------------------------------------------------------

export interface ScoreInput {
  tender: TenderRow;
  candidate: ScoutedCompanyRow;
  warmIntroContact: LinkedinContactRow | null;
}

export async function scoreMatch(input: ScoreInput): Promise<MatchScore> {
  const { tender, candidate, warmIntroContact } = input;

  // System block: persona + tender profile. Stable across N candidates for the
  // same tender, so cache it ephemerally — candidates 2..N read from cache.
  const system: Array<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
  }> = [
    {
      type: 'text',
      text: MATCHER_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: tenderProfile(tender),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const userPrompt = `${candidateProfile(candidate, warmIntroContact)}\n\nScore this pairing now via emit_match. Do not write any preamble.`;

  const t0 = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: system as Anthropic.Messages.MessageCreateParams['system'],
    tools: [matcherTool],
    tool_choice: { type: 'tool', name: 'emit_match' },
    messages: [{ role: 'user', content: userPrompt }],
  });
  const ms = Date.now() - t0;

  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') {
    throw new Error(`matcher returned no tool use (stop=${response.stop_reason})`);
  }
  const out = toolBlock.input as MatchScore;

  const usage = response.usage as
    | (typeof response.usage & {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      })
    | undefined;
  console.log(
    `[matcher] ${ms}ms tender=${tender.source_ref} score=${out.score} in=${usage?.input_tokens} cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} out=${usage?.output_tokens}`,
  );
  return out;
}

// ----------------------------------------------------------------------------
// Candidate retrieval — warm-intro first, then sector + geography
// ----------------------------------------------------------------------------

type Supabase = ReturnType<typeof createServerClient>;

export interface CandidateWithWarm {
  company: ScoutedCompanyRow;
  warmIntroContact: LinkedinContactRow | null;
  sectorOverlap: number;
}

export async function getCandidatesForTender(
  supabase: Supabase,
  tender: TenderRow,
  limit = 5,
): Promise<CandidateWithWarm[]> {
  // scouted_companies is small (admin-curated + scanner-discovered, hundreds
  // of rows worst case), so we pull and rank in memory. Avoids fighting
  // Postgres array operator semantics across two columns.
  const { data: companies, error: cErr } = await supabase
    .from('scouted_companies')
    .select(
      'id, name, country, website, linkedin_url, description, sectors, size_band, certifications, past_donor_wins, discovered_via, evidence_notes',
    )
    .limit(500);
  if (cErr) throw new Error(`scouted_companies query: ${cErr.message}`);

  const { data: contacts, error: lErr } = await supabase
    .from('linkedin_contacts')
    .select('id, first_name, last_name, email, linkedin_url, position, company_name, scouted_company_id, connected_on')
    .not('scouted_company_id', 'is', null);
  if (lErr) throw new Error(`linkedin_contacts query: ${lErr.message}`);

  // Pick the most-recently-connected contact per scouted_company_id
  const warmByCompany = new Map<string, LinkedinContactRow>();
  for (const row of (contacts || []) as LinkedinContactRow[]) {
    if (!row.scouted_company_id) continue;
    const prev = warmByCompany.get(row.scouted_company_id);
    if (!prev || (row.connected_on || '') > (prev.connected_on || '')) {
      warmByCompany.set(row.scouted_company_id, row);
    }
  }

  const tenderSectors = new Set((tender.sectors || []).map((s) => s.toLowerCase()));
  const tenderCountry = (tender.country || '').toUpperCase();
  const geoAllow = new Set<string>(IN_SCOPE_COUNTRIES);
  if (tenderCountry) geoAllow.add(tenderCountry);

  type Ranked = {
    company: ScoutedCompanyRow;
    warm: LinkedinContactRow | null;
    sectorOverlap: number;
    geoOk: boolean;
  };

  const ranked: Ranked[] = ((companies || []) as ScoutedCompanyRow[]).map((c) => {
    const sectors = (c.sectors || []).map((s) => s.toLowerCase());
    const sectorOverlap = sectors.filter((s) => tenderSectors.has(s)).length;
    const country = (c.country || '').toUpperCase();
    const geoOk = country ? geoAllow.has(country) : true; // unknown country: include
    return { company: c, warm: warmByCompany.get(c.id) || null, sectorOverlap, geoOk };
  });

  // Sort: warm intro first, then sector overlap desc, then geo match
  ranked.sort((a, b) => {
    const warmDelta = (b.warm ? 1 : 0) - (a.warm ? 1 : 0);
    if (warmDelta !== 0) return warmDelta;
    if (a.sectorOverlap !== b.sectorOverlap) return b.sectorOverlap - a.sectorOverlap;
    if (a.geoOk !== b.geoOk) return b.geoOk ? 1 : -1;
    return a.company.name.localeCompare(b.company.name);
  });

  // Eligibility:
  //   - warm-intro candidates always pull through (that's the point)
  //   - otherwise require sector overlap (when tender has sectors) AND geo
  //   - if tender has no sectors[] (rare but happens), fall back to geo-only
  const eligible = ranked.filter((r) => {
    if (r.warm) return true;
    if (tenderSectors.size === 0) return r.geoOk;
    return r.sectorOverlap > 0 && r.geoOk;
  });

  return eligible.slice(0, limit).map((r) => ({
    company: r.company,
    warmIntroContact: r.warm,
    sectorOverlap: r.sectorOverlap,
  }));
}

// ----------------------------------------------------------------------------
// matchTender — score one tender against its candidates and persist
// ----------------------------------------------------------------------------

export interface TenderMatchOutcome {
  tenderId: string;
  candidates: number;
  scored: number;
  written: number;
  matches: ScoredCandidate[];
  errors: string[];
}

export async function matchTender(
  supabase: Supabase,
  tenderId: string,
  opts: { dryRun?: boolean; candidateLimit?: number } = {},
): Promise<TenderMatchOutcome> {
  const { dryRun = false, candidateLimit = 5 } = opts;
  const errors: string[] = [];

  const { data: tender, error: tErr } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single();
  if (tErr || !tender) {
    throw new Error(`tender ${tenderId} not found: ${tErr?.message || 'no row'}`);
  }

  const candidates = await getCandidatesForTender(supabase, tender as TenderRow, candidateLimit);
  const matches: ScoredCandidate[] = [];

  for (const { company, warmIntroContact } of candidates) {
    try {
      const score = await scoreMatch({
        tender: tender as TenderRow,
        candidate: company,
        warmIntroContact,
      });
      matches.push({
        scouted_company_id: company.id,
        warm_intro_via_contact_id: warmIntroContact?.id || null,
        ...score,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${company.name} (${company.id}): ${msg}`);
    }
  }

  let written = 0;
  if (!dryRun && matches.length > 0) {
    const rows = matches.map((m) => ({
      tender_id: tenderId,
      scouted_company_id: m.scouted_company_id,
      score: m.score,
      rationale: m.rationale,
      fit_dimensions: m.fit_dimensions,
      partner_stack: m.partner_stack ?? null,
      risks: m.risks ?? null,
      warm_intro_via_contact_id: m.warm_intro_via_contact_id,
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const { error: upErr, count } = await supabase
      .from('tender_matches')
      .upsert(rows, { onConflict: 'tender_id,scouted_company_id', count: 'exact' });
    if (upErr) {
      errors.push(`upsert: ${upErr.message}`);
    } else {
      written = count ?? rows.length;
    }

    // Stamp last_scored_at on the companies we just scored.
    if (matches.length > 0) {
      await supabase
        .from('scouted_companies')
        .update({ last_scored_at: new Date().toISOString() })
        .in(
          'id',
          matches.map((m) => m.scouted_company_id),
        );
    }
  }

  return {
    tenderId,
    candidates: candidates.length,
    scored: matches.length,
    written,
    matches,
    errors,
  };
}

// ----------------------------------------------------------------------------
// matchRecentTenders — batch: score every passing tender from the past week
// ----------------------------------------------------------------------------

export interface BatchMatchResult {
  ok: boolean;
  tendersConsidered: number;
  tendersWithCandidates: number;
  matchesWritten: number;
  errors: string[];
}

export async function matchRecentTenders(
  supabase: Supabase,
  opts: { sinceDays?: number; candidateLimit?: number; maxTenders?: number } = {},
): Promise<BatchMatchResult> {
  const { sinceDays = 7, candidateLimit = 5, maxTenders = 1000 } = opts;
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('tenders')
    .select('id')
    .eq('passes_filter', true)
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(maxTenders);
  if (error) {
    return {
      ok: false,
      tendersConsidered: 0,
      tendersWithCandidates: 0,
      matchesWritten: 0,
      errors: [`select tenders: ${error.message}`],
    };
  }

  const tenders = (data || []) as Array<{ id: string }>;
  let tendersWithCandidates = 0;
  let matchesWritten = 0;
  const errors: string[] = [];

  for (const t of tenders) {
    try {
      const out = await matchTender(supabase, t.id, { candidateLimit });
      if (out.candidates > 0) tendersWithCandidates += 1;
      matchesWritten += out.written;
      errors.push(...out.errors.map((e) => `${t.id}: ${e}`));
    } catch (err) {
      errors.push(`${t.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: errors.length === 0,
    tendersConsidered: tenders.length,
    tendersWithCandidates,
    matchesWritten,
    errors,
  };
}
