import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/app/lib/supabase';
import { cooperatrProfileBlock, isNeedsUsExcluded } from '@/app/lib/cooperatrProfile';
import { scoreTenderFit, TENDER_FIT_FLOOR, type TenderFit } from '@/app/lib/tenderFit';
import { expandOpportunity, EXPANSION_SCORE_FLOOR } from '@/app/lib/opportunityExpansion';

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

// maxRetries: 6 — the SDK retries 429s with backoff, honouring the
// retry-after header. On a low Anthropic tier (8k output tokens/min) the
// matcher+discovery burst can hit the per-minute cap; retrying lets the run
// self-throttle and complete instead of erroring out mid-batch.
const client = new Anthropic({ maxRetries: 6 });

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
  // Stage-1 tender-fit (migration 015). Optional so older callers still typecheck.
  tender_fit_score?: number | null;
  tender_fit_verdict?: string | null;
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
  needs_us: number;   // does this SME actually NEED Cooperatr? (Stage-2 recalibration)
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

${cooperatrProfileBlock()}

The single most important question, before sector/capability: DOES THIS SME NEED COOPERATR? Cooperatr's value is opening donor funding to the "forgotten market" — Spanish/EU SMEs and NGOs that can't access it alone. A firm that already wins donor work on its own (a global consultancy like Accenture/Deloitte/McKinsey, an established development prime like Chemonics/DAI/Tetra Tech, or a seasoned federal service contractor) does NOT need an unknown intermediary, no matter how capable it is. High capability on such a firm is a reason to score LOW, not high — pairing them with us is pointless. Spanish SMEs are the first-choice partner; an EU/other SME is acceptable when no Spanish fit exists.

Calibration anchors:
- 85-100  Pursue immediately. An SME that genuinely needs Cooperatr; sector and capability fit; geography works (in-country, founder reach, or strong prior delivery in similar markets); ideally a warm intro or past-win evidence. Spanish SME is the ideal here.
- 65-84   Pursue as a coalition. The SME needs us AND brings something genuinely distinctive — a certification, proprietary capability, sub-domain specialty, EU regulatory standing, or a track record the local market lacks. A named partner archetype closes the remaining gap and would actually want this SME in the consortium.
- 40-64   Uncertain. Some signal exists but the SME's distinctive value-add is weak, OR the partner would do most of the work (they could bid without this SME). Surface for human review.
- 0-39    Skip. Wrong sector, wrong size, legal exclusion, the SME has no edge a competent local alternative couldn't match — OR the firm clearly doesn't need Cooperatr (a global consultancy / established prime / seasoned federal contractor). When needs_us is low, the overall score MUST sit here regardless of capability.

A partner_stack is not a free pass. Ask: why would the local partner want this SME in the consortium? If the answer is "no reason — they could win this alone," score in the 30s. If the SME brings something the local market doesn't have, score 60+. The score reflects coalition viability AND need-for-Cooperatr, not the existence of a theoretical partnership.

Dimensions you must score (each 0.0-1.0):
- sector       overlap between tender sectors[] and company sectors[]
- geography    can this SME plausibly deliver in the buyer/project country? (Spanish & EU SMEs delivering EU-funded development work score well; weigh founder reach.)
- capability   do described capabilities, certifications, and past donor wins map to the tender scope?
- size         is the tender value compatible with the company's size band? Both too-big (won't be selected as lead) and too-small (uneconomic to bid) hurt the score.
- needs_us     does this SME NEED Cooperatr? 1.0 = a Spanish/EU SME or NGO that can't access this funding alone; 0.0 = a global consultancy, established development prime, or seasoned federal contractor that wins this kind of work without help. This dimension gates the overall score: needs_us < 0.3 caps the overall at <40.

Add additional dimensions if the pairing calls for them (e.g. language_fit, regulatory_alignment, coalition_viability) — keep them 0.0-1.0.

Cooperatr's BD model is small cross-border coalitions. Geographic gaps are partnership opportunities only when the SME has distinctive value that justifies consortium overhead.

Personal LinkedIn contacts are bonus signals — they reduce outreach friction and add local intel, but they don't change underlying fit. Two warm-intro vectors exist:

1. Per-candidate warm: a contact AT the candidate SME. Bumps that specific candidate's score by at most ~5 points IF the contact's role is substantive to the tender scope.

2. Tender-level warm (provided in the "Network warm context" block when present): contacts in the tender's COUNTRY or SECTOR. These are admin's wider network, not at this specific SME. Use them to:
   - Bump any candidate's score by ~3-5 points when the candidate's geography or sector aligns with where the admin has network depth (the admin can validate the opportunity locally or get introductions)
   - Cite specific contacts by name in the rationale as suggested first outreach ("X at Y could validate this opportunity in-country")
   - Never use these to rescue a fundamentally weak fit

A cold candidate with strong sector + geography + capability fit beats a warm candidate with weak fit, every time. Bonus signals nudge — they don't carry.

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
        description: 'Per-dimension 0.0-1.0 scores. Required keys: sector, geography, capability, size, needs_us. Add other dimensions (e.g. language_fit) if useful.',
        properties: {
          sector: { type: 'number', minimum: 0, maximum: 1 },
          geography: { type: 'number', minimum: 0, maximum: 1 },
          capability: { type: 'number', minimum: 0, maximum: 1 },
          size: { type: 'number', minimum: 0, maximum: 1 },
          needs_us: { type: 'number', minimum: 0, maximum: 1, description: 'Does this SME NEED Cooperatr? 1.0 = forgotten-market SME/NGO; 0.0 = global consultancy / established prime / seasoned federal contractor.' },
        },
        required: ['sector', 'geography', 'capability', 'size', 'needs_us'],
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

export interface NetworkWarmContext {
  contactsInCountry: Array<{ name: string; position: string | null; company: string | null }>;
  contactsInSector: Array<{ name: string; position: string | null; company: string | null; sectors: string[] }>;
}

function tenderProfile(t: TenderRow, warm?: NetworkWarmContext): string {
  const value =
    t.value_usd_min == null && t.value_usd_max == null
      ? 'unknown'
      : `${t.value_usd_min ?? '?'} – ${t.value_usd_max ?? '?'} USD${t.currency ? ` (original ${t.currency})` : ''}`;

  let warmBlock = '';
  if (warm && (warm.contactsInCountry.length > 0 || warm.contactsInSector.length > 0)) {
    const country = warm.contactsInCountry.length > 0
      ? warm.contactsInCountry.slice(0, 8).map((c) => `- ${c.name}${c.position ? ` — ${c.position}` : ''}${c.company ? ` @ ${c.company}` : ''}`).join('\n')
      : '  (none)';
    const sector = warm.contactsInSector.length > 0
      ? warm.contactsInSector.slice(0, 8).map((c) => `- ${c.name}${c.position ? ` — ${c.position}` : ''}${c.company ? ` @ ${c.company}` : ''}${c.sectors.length > 0 ? ` [${c.sectors.join(', ')}]` : ''}`).join('\n')
      : '  (none)';
    warmBlock = `\n\n## Network warm context for this tender
(Admin's wider LinkedIn network — bonus signals, not bidders for this deal.)

Contacts in tender country (${t.country || '—'}):
${country}

Contacts in tender sectors (${(t.sectors || []).join(', ') || '—'}):
${sector}`;
  }

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
${(t.description || '').slice(0, 1800)}${warmBlock}`;
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
  networkWarmContext?: NetworkWarmContext;
  recentFeedback?: string;
}

export async function scoreMatch(input: ScoreInput): Promise<MatchScore> {
  const { tender, candidate, warmIntroContact, networkWarmContext, recentFeedback } = input;

  // System block: persona + tender profile (incl. tender-level warm context).
  // Stable across N candidates for the same tender, so cache it ephemerally —
  // candidates 2..N read from cache.
  const systemText = recentFeedback
    ? `${MATCHER_SYSTEM_PROMPT}\n\n## Recent operator feedback (recalibration signal)\nThe operator reviewed past matches and gave this feedback. Weight your scoring to reflect it:\n${recentFeedback}`
    : MATCHER_SYSTEM_PROMPT;
  const system: Array<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
  }> = [
    {
      type: 'text',
      text: systemText,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: tenderProfile(tender, networkWarmContext),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const userPrompt = `${candidateProfile(candidate, warmIntroContact)}\n\nScore this pairing now via emit_match. Do not write any preamble.`;

  const t0 = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
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
  // Bidder candidate pool excludes LinkedIn-auto-promoted rows. Those
  // organizations (Winrock, World Bank, USAID, FAO, IDB, big consultancies,
  // individuals, etc.) are network contact pools, NOT bidding candidates —
  // they don't bid commercially on EU procurement, and treating them as
  // bidders fills the BD report with "you can't pitch Winrock on this deal"
  // noise. They remain in scouted_companies for warm-intro lookups (the
  // tender-level network warm context still surfaces "you have contacts
  // at Winrock in agri_food"), but they are not scored as bidders.
  //
  // Real bidder candidates come from:
  //   - claude_discovery (per-tender market scouting)
  //   - manual (admin-added)
  //   - cordis / ted_archive (past donor-program winners — future work)
  //   - web_search (future, layered into discovery v2)
  const BIDDER_DISCOVERY_VIA = ['claude_discovery', 'manual', 'cordis', 'ted_archive', 'web_search'];

  // Paginate scouted_companies — Supabase REST default max-rows is 1000, so a
  // single SELECT silently caps and we'd miss tail-of-alphabet candidates.
  const PAGE = 1000;
  const companies: ScoutedCompanyRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('scouted_companies')
      .select(
        'id, name, country, website, linkedin_url, description, sectors, size_band, certifications, past_donor_wins, discovered_via, evidence_notes',
      )
      .in('discovered_via', BIDDER_DISCOVERY_VIA)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`scouted_companies query page ${offset}: ${error.message}`);
    const page = (data || []) as ScoutedCompanyRow[];
    companies.push(...page);
    if (page.length < PAGE) break;
  }

  // Stage-2 hard exclusion: drop firms that clearly don't NEED Cooperatr
  // (global consultancies, established development primes, seasoned federal
  // contractors). The "Accenture bug" — these were scoring high on capability
  // and surfacing as matches. They will never need an unknown intermediary, so
  // they don't belong in the candidate pool at all.
  const excludedCompanies = companies.filter((c) => isNeedsUsExcluded(c.name));
  const eligibleCompanies = companies.filter((c) => !isNeedsUsExcluded(c.name));
  if (excludedCompanies.length > 0) {
    console.log(`[matcher] needs-us exclusion dropped ${excludedCompanies.length} firm(s): ${excludedCompanies.slice(0, 5).map((c) => c.name).join(', ')}${excludedCompanies.length > 5 ? '…' : ''}`);
  }

  // Paginate linkedin_contacts the same way.
  const contacts: LinkedinContactRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('linkedin_contacts')
      .select('id, first_name, last_name, email, linkedin_url, position, company_name, scouted_company_id, connected_on')
      .not('scouted_company_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`linkedin_contacts query page ${offset}: ${error.message}`);
    const page = (data || []) as LinkedinContactRow[];
    contacts.push(...page);
    if (page.length < PAGE) break;
  }

  // Per scouted_company: keep the most-recently-connected contact AND the
  // total contact count. The count is a real signal — companies with many
  // contacts in the admin's network are stronger relationships than one-offs.
  const warmByCompany = new Map<string, LinkedinContactRow>();
  const contactCountByCompany = new Map<string, number>();
  // Pre-compute per-company keyword-relevance from concatenated position text
  // when scouted_company sectors[] is empty but contact positions hint at fit.
  const positionsBlobByCompany = new Map<string, string>();
  for (const row of contacts) {
    if (!row.scouted_company_id) continue;
    const prev = warmByCompany.get(row.scouted_company_id);
    if (!prev || (row.connected_on || '') > (prev.connected_on || '')) {
      warmByCompany.set(row.scouted_company_id, row);
    }
    contactCountByCompany.set(
      row.scouted_company_id,
      (contactCountByCompany.get(row.scouted_company_id) || 0) + 1,
    );
    if (row.position && row.position.trim()) {
      const cur = positionsBlobByCompany.get(row.scouted_company_id) || '';
      positionsBlobByCompany.set(row.scouted_company_id, `${cur} ${row.position.trim()}`);
    }
  }

  const tenderSectors = new Set((tender.sectors || []).map((s) => s.toLowerCase()));
  const tenderCountry = (tender.country || '').toUpperCase();

  type Ranked = {
    company: ScoutedCompanyRow;
    warm: LinkedinContactRow | null;
    sectorOverlap: number;
    positionHint: number;          // count of tender-sector tokens in concatenated contact positions
    contactCount: number;
    mostRecent: string;            // ISO date string of most-recent contact, '' if unknown
    inTenderCountry: boolean;      // company HQ is in the tender's specific country
    inBroadScope: boolean;         // company HQ is anywhere in our broad EU/US/DR allow-list
    isSpanish: boolean;            // company HQ is in Spain — Cooperatr's first-choice partner
  };

  // Build tender-token set: tender sector slugs + tender title words. Used to
  // probe contact-position relevance when scouted_company sectors[] is empty.
  const titleTokens = (tender.title || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 4);
  const tenderTokens = new Set<string>([
    ...Array.from(tenderSectors).map((s) => s.replace(/_/g, ' ')),
    ...titleTokens,
  ]);

  const ranked: Ranked[] = eligibleCompanies.map((c) => {
    const sectors = (c.sectors || []).map((s) => s.toLowerCase());
    const sectorOverlap = sectors.filter((s) => tenderSectors.has(s)).length;
    const country = (c.country || '').toUpperCase();
    const inTenderCountry = !!country && !!tenderCountry && country === tenderCountry;
    const inBroadScope = country ? IN_SCOPE_COUNTRIES.has(country) : true; // unknown country = include
    const isSpanish = country === 'ES' || country === 'ESP';
    const warm = warmByCompany.get(c.id) || null;
    const blob = (positionsBlobByCompany.get(c.id) || '').toLowerCase();
    let positionHint = 0;
    for (const tok of tenderTokens) {
      if (tok.length > 4 && blob.includes(tok)) positionHint += 1;
    }
    return {
      company: c,
      warm,
      sectorOverlap,
      positionHint,
      contactCount: contactCountByCompany.get(c.id) || 0,
      mostRecent: warm?.connected_on || '',
      inTenderCountry,
      inBroadScope,
      isSpanish,
    };
  });

  // Ranking precedence (Stage-2 recalibration):
  //   1. isSpanish desc            — Spanish SMEs are the first-choice partner
  //   2. sectorOverlap desc        — explicit sector match
  //   3. positionHint desc         — contact positions reference tender domain
  //   4. inTenderCountry desc      — company HQ literally in the tender country
  //   5. warm > non-warm           — bonus when other dimensions tie
  //   6. inBroadScope desc         — HQ anywhere in EU/US/DR (weak signal)
  //   7. contactCount desc         — relationship strength
  //   8. mostRecent desc           — recency
  //   9. name asc                  — deterministic last-resort tiebreaker
  const sortRanked = (a: Ranked, b: Ranked): number => {
    if (a.isSpanish !== b.isSpanish) return b.isSpanish ? 1 : -1;
    if (a.sectorOverlap !== b.sectorOverlap) return b.sectorOverlap - a.sectorOverlap;
    if (a.positionHint !== b.positionHint) return b.positionHint - a.positionHint;
    if (a.inTenderCountry !== b.inTenderCountry) return b.inTenderCountry ? 1 : -1;
    const warmDelta = (b.warm ? 1 : 0) - (a.warm ? 1 : 0);
    if (warmDelta !== 0) return warmDelta;
    if (a.inBroadScope !== b.inBroadScope) return b.inBroadScope ? 1 : -1;
    if (a.contactCount !== b.contactCount) return b.contactCount - a.contactCount;
    if (a.mostRecent !== b.mostRecent) return a.mostRecent < b.mostRecent ? 1 : -1;
    return a.company.name.localeCompare(b.company.name);
  };

  // Hard sector gate WITH fallback. Per the recalibration spec: a real sector
  // match is required, and Spanish SMEs come first. So we build the candidate
  // list in priority tiers and fill up to `limit`:
  //   Tier 1: Spanish SMEs with a sector match   (the ideal)
  //   Tier 2: any-country SMEs with a sector match (no good Spanish fit → move on)
  //   Tier 3: fallback — no sector match at all. Only used to backfill if the
  //           sector-matched tiers can't fill `limit`. A no-sector candidate
  //           still gets scored (the LLM will rate it low), so the tender isn't
  //           dropped silently — but it never displaces a sector match.
  const spanishSector = ranked.filter((r) => r.isSpanish && r.sectorOverlap > 0).sort(sortRanked);
  const otherSector = ranked.filter((r) => !r.isSpanish && r.sectorOverlap > 0).sort(sortRanked);
  const noSector = ranked.filter((r) => r.sectorOverlap === 0).sort(sortRanked);

  const ordered: Ranked[] = [...spanishSector, ...otherSector];
  if (ordered.length < limit) {
    ordered.push(...noSector.slice(0, limit - ordered.length));
  }

  return ordered.slice(0, limit).map((r) => ({
    company: r.company,
    warmIntroContact: r.warm,
    sectorOverlap: r.sectorOverlap,
  }));
}

// ----------------------------------------------------------------------------
// getNetworkWarmContext — tender-level warm-intro aggregates
// ----------------------------------------------------------------------------
// For a given tender, compute two bonus signals from the admin's wider
// LinkedIn network (not specific to any candidate SME):
//   - contactsInCountry: contacts whose scouted_company is HQ'd in the tender's
//     country, or whose position text mentions the tender's country name
//   - contactsInSector: contacts whose scouted_company has overlapping sectors
//     with the tender
// These flow into the matcher as bonus context so it can suggest local intel
// routes ("X at Y could validate this opportunity in-country") without
// inflating the candidate's score on warm-alone.
export async function getNetworkWarmContext(
  supabase: Supabase,
  tender: TenderRow,
): Promise<NetworkWarmContext> {
  const tenderCountry = (tender.country || '').toUpperCase();
  const tenderSectors = new Set((tender.sectors || []).map((s) => s.toLowerCase()));

  // Paginate contacts (REST max-rows is 1000, we have 1266+)
  const PAGE = 1000;
  const contacts: Array<LinkedinContactRow & { scouted_company_id: string }> = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('linkedin_contacts')
      .select('id, first_name, last_name, email, linkedin_url, position, company_name, scouted_company_id, connected_on')
      .not('scouted_company_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`network warm contacts page ${offset}: ${error.message}`);
    const page = (data || []) as Array<LinkedinContactRow & { scouted_company_id: string }>;
    contacts.push(...page);
    if (page.length < PAGE) break;
  }

  // Pull only the scouted_company rows we need (those referenced by the contacts).
  // Chunk into batches small enough for Supabase REST URL limits (~8KB max);
  // each UUID is 36 chars + 1 separator so ~100 fits comfortably.
  const companyIds = Array.from(new Set(contacts.map((c) => c.scouted_company_id))).filter(Boolean);
  const companyMeta = new Map<string, { country: string | null; sectors: string[] }>();
  const ID_CHUNK = 100;
  for (let i = 0; i < companyIds.length; i += ID_CHUNK) {
    const slice = companyIds.slice(i, i + ID_CHUNK);
    const { data, error } = await supabase
      .from('scouted_companies')
      .select('id, country, sectors')
      .in('id', slice);
    if (error) throw new Error(`network warm scouted chunk ${i}: ${error.message}`);
    for (const row of (data || []) as Array<{ id: string; country: string | null; sectors: string[] | null }>) {
      companyMeta.set(row.id, { country: row.country, sectors: row.sectors || [] });
    }
  }

  // Resolve country aliases — TED stores ISO-3 (e.g. BGR), companies may store
  // ISO-2 (BG). Build a small lookup so the comparison works either way.
  const ISO3_TO_ISO2: Record<string, string> = {
    BGR: 'BG', ROU: 'RO', HRV: 'HR', CYP: 'CY', CZE: 'CZ', DNK: 'DK', EST: 'EE',
    FIN: 'FI', FRA: 'FR', DEU: 'DE', GRC: 'GR', HUN: 'HU', IRL: 'IE', ITA: 'IT',
    LVA: 'LV', LTU: 'LT', LUX: 'LU', MLT: 'MT', NLD: 'NL', POL: 'PL', PRT: 'PT',
    SVK: 'SK', SVN: 'SI', ESP: 'ES', SWE: 'SE', AUT: 'AT', BEL: 'BE', GBR: 'GB',
    USA: 'US', MEX: 'MX', BRA: 'BR', ARG: 'AR', COL: 'CO', PER: 'PE', CHL: 'CL',
    DOM: 'DO', CAN: 'CA', SEN: 'SN', NGA: 'NG', KEN: 'KE', TZA: 'TZ', UGA: 'UG',
    ETH: 'ET', GHA: 'GH', CIV: 'CI', RWA: 'RW', ZMB: 'ZM', MOZ: 'MZ', MAR: 'MA',
    EGY: 'EG', TUN: 'TN', JOR: 'JO', LBN: 'LB', IRQ: 'IQ', YEM: 'YE',
  };
  const tenderCountryIso2 = ISO3_TO_ISO2[tenderCountry] || tenderCountry;

  // Country-name forms for free-text position matches
  const ISO_TO_NAMES: Record<string, string[]> = {
    BG: ['bulgaria', 'bulgarian'],
    ES: ['spain', 'spanish', 'españa'],
    DE: ['germany', 'german', 'deutschland'],
    FR: ['france', 'french'],
    IT: ['italy', 'italian'],
    NL: ['netherlands', 'dutch', 'holland'],
    PT: ['portugal', 'portuguese'],
    SN: ['senegal', 'senegalese'],
    KE: ['kenya', 'kenyan'],
    NG: ['nigeria', 'nigerian'],
    MZ: ['mozambique', 'mozambican'],
    EG: ['egypt', 'egyptian'],
    MA: ['morocco', 'moroccan'],
    DO: ['dominican'],
    MX: ['mexico', 'mexican'],
    PE: ['peru', 'peruvian'],
    CO: ['colombia', 'colombian'],
    US: ['united states', 'u.s.', 'usa', 'american'],
    GB: ['united kingdom', 'uk', 'britain', 'british', 'england', 'scotland'],
  };
  const countryNames = ISO_TO_NAMES[tenderCountryIso2] || [];

  const contactsInCountry: NetworkWarmContext['contactsInCountry'] = [];
  const contactsInSector: NetworkWarmContext['contactsInSector'] = [];

  for (const c of contacts) {
    const meta = companyMeta.get(c.scouted_company_id);
    if (!meta) continue;
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || '(unnamed)';
    const positionLower = (c.position || '').toLowerCase();

    // Country match: company HQ matches tender country (either casing) OR
    // position text mentions the country name
    const companyCountryNorm = (meta.country || '').toUpperCase();
    const countryHit =
      (companyCountryNorm && (companyCountryNorm === tenderCountryIso2 || companyCountryNorm === tenderCountry))
      || countryNames.some((n) => positionLower.includes(n));
    if (countryHit && contactsInCountry.length < 30) {
      contactsInCountry.push({
        name,
        position: c.position,
        company: c.company_name || null,
      });
    }

    // Sector match: company sectors overlap tender sectors
    const overlap = meta.sectors.filter((s) => tenderSectors.has(s.toLowerCase()));
    if (overlap.length > 0 && contactsInSector.length < 30) {
      contactsInSector.push({
        name,
        position: c.position,
        company: c.company_name || null,
        sectors: overlap,
      });
    }
  }

  return { contactsInCountry, contactsInSector };
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
  tenderFit?: TenderFit;
  skipped?: boolean;          // true when Stage-1 gate hard-skipped company matching
}

// ----------------------------------------------------------------------------
// getRecentFeedback — recalibration signal for Stage 1 + Stage 2 prompts
// ----------------------------------------------------------------------------
// Pull the most recent operator feedback (thumbs-down or free-text) on past
// matches and format it into a compact block. Both the tender-fit screener and
// the matcher read this so the operator's corrections steer future scoring.
export async function getRecentFeedback(supabase: Supabase, limit = 12): Promise<string | undefined> {
  const { data, error } = await supabase
    .from('tender_matches')
    .select('feedback, feedback_signal, score, tender:tenders(title), company:scouted_companies(name)')
    .not('feedback', 'is', null)
    .order('feedback_at', { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) return undefined;

  const lines: string[] = [];
  for (const row of data as unknown as Array<{
    feedback: string | null;
    feedback_signal: string | null;
    score: number | null;
    tender: { title: string | null } | null;
    company: { name: string | null } | null;
  }>) {
    if (!row.feedback) continue;
    const signal = row.feedback_signal === 'down' ? '👎' : row.feedback_signal === 'up' ? '👍' : '·';
    const t = (row.tender?.title || 'tender').slice(0, 70);
    const c = row.company?.name || 'company';
    lines.push(`${signal} [${c} × "${t}", scored ${Math.round(row.score ?? 0)}]: ${row.feedback.slice(0, 240)}`);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

export async function matchTender(
  supabase: Supabase,
  tenderId: string,
  opts: { dryRun?: boolean; candidateLimit?: number; recentFeedback?: string; skipExpansion?: boolean } = {},
): Promise<TenderMatchOutcome> {
  const { dryRun = false, candidateLimit = 5, skipExpansion = false } = opts;
  const errors: string[] = [];

  const { data: tender, error: tErr } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single();
  if (tErr || !tender) {
    throw new Error(`tender ${tenderId} not found: ${tErr?.message || 'no row'}`);
  }

  const tenderRow = tender as TenderRow;

  // Recalibration signal — recent operator feedback. Fetched once per tender if
  // not supplied by the batch caller (batch passes it once to avoid N queries).
  const recentFeedback = opts.recentFeedback ?? (await getRecentFeedback(supabase));

  // ── Stage 1 — tender-fit gate ──────────────────────────────────────────────
  // Decide whether this tender fits Cooperatr BEFORE spending Sonnet calls on
  // company matching. Below the floor → hard-skip + record (no company match).
  let tenderFit: TenderFit | undefined;
  try {
    tenderFit = await scoreTenderFit(tenderRow, recentFeedback);
    if (!dryRun) {
      const { error: fErr } = await supabase
        .from('tenders')
        .update({
          tender_fit_score: tenderFit.fit_score,
          tender_fit_reasons: {
            sector_fit: tenderFit.sector_fit,
            geography_fit: tenderFit.geography_fit,
            deal_band_fit: tenderFit.deal_band_fit,
            reasons: tenderFit.reasons,
          },
          tender_fit_verdict: tenderFit.verdict,
          tender_fit_at: new Date().toISOString(),
        })
        .eq('id', tenderId);
      if (fErr) errors.push(`tender_fit persist: ${fErr.message}`);
    }
  } catch (err) {
    // Don't let a tender-fit failure block matching — log and proceed.
    errors.push(`tender_fit: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (tenderFit && tenderFit.fit_score < TENDER_FIT_FLOOR) {
    // Hard skip + record. The score is persisted above; no company matching.
    return {
      tenderId,
      candidates: 0,
      scored: 0,
      written: 0,
      matches: [],
      errors,
      tenderFit,
      skipped: true,
    };
  }

  const candidates = await getCandidatesForTender(supabase, tenderRow, candidateLimit);

  // Compute tender-level warm context ONCE per tender — same for all candidates.
  // This is the "wider network" bonus signal: contacts in the tender's country
  // and/or sector, regardless of which company they work at.
  const networkWarmContext = await getNetworkWarmContext(supabase, tenderRow);

  const matches: ScoredCandidate[] = [];

  for (const { company, warmIntroContact } of candidates) {
    try {
      const score = await scoreMatch({
        tender: tenderRow,
        candidate: company,
        warmIntroContact,
        networkWarmContext,
        recentFeedback,
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

  // ── Stage 3 — opportunity-engine expansion for strong matches ───────────────
  // For matches worth pursuing, expand the single bid into a structured deal
  // (consortium partners / impact investors / blended finance). Capped to the
  // top matches above the floor so we don't pay for it on weak pairings.
  const expansions = new Map<string, Awaited<ReturnType<typeof expandOpportunity>>>();
  if (!skipExpansion) {
    const companyById = new Map(candidates.map((c) => [c.company.id, c.company]));
    const strong = matches
      .filter((m) => (m.score ?? 0) >= EXPANSION_SCORE_FLOOR)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 2); // at most the top 2 strong matches per tender
    for (const m of strong) {
      const company = companyById.get(m.scouted_company_id);
      if (!company) continue;
      try {
        const exp = await expandOpportunity(tenderRow, company, m.rationale);
        expansions.set(m.scouted_company_id, exp);
      } catch (err) {
        errors.push(`expansion ${company.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
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
      opportunity_expansion: expansions.get(m.scouted_company_id) ?? null,
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
    tenderFit,
  };
}

// ----------------------------------------------------------------------------
// matchRecentTenders — batch: score every passing tender from the past week
// ----------------------------------------------------------------------------

// Match a specific set of tender IDs (e.g. the ones discovery just covered).
// Used by the cron to keep discovery and match aligned on the same tender set.
export async function matchSpecificTenders(
  supabase: Supabase,
  tenderIds: string[],
  opts: { candidateLimit?: number; concurrency?: number } = {},
): Promise<BatchMatchResult> {
  const { candidateLimit = 5, concurrency = 2 } = opts;
  let tendersWithCandidates = 0;
  let matchesWritten = 0;
  const errors: string[] = [];

  // Fetch the recalibration feedback once for the whole batch.
  const recentFeedback = await getRecentFeedback(supabase);

  const queue = [...tenderIds];
  let active = 0;
  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < concurrency && queue.length > 0) {
        const id = queue.shift()!;
        active += 1;
        matchTender(supabase, id, { candidateLimit, recentFeedback })
          .then((out) => {
            if (out.candidates > 0) tendersWithCandidates += 1;
            matchesWritten += out.written;
            errors.push(...out.errors.map((e) => `${id}: ${e}`));
          })
          .catch((err) => {
            errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
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

  return {
    ok: errors.length === 0,
    tendersConsidered: tenderIds.length,
    tendersWithCandidates,
    matchesWritten,
    errors,
  };
}

export interface BatchMatchResult {
  ok: boolean;
  tendersConsidered: number;
  tendersWithCandidates: number;
  matchesWritten: number;
  errors: string[];
}

export async function matchRecentTenders(
  supabase: Supabase,
  opts: { sinceDays?: number; candidateLimit?: number; maxTenders?: number; skipScored?: boolean } = {},
): Promise<BatchMatchResult> {
  const { sinceDays = 7, candidateLimit = 5, maxTenders = 1000, skipScored = false } = opts;
  const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  // Pull all passing tenders from the past N days. We'll then filter out
  // already-scored ones if requested.
  const { data, error } = await supabase
    .from('tenders')
    .select('id')
    .eq('passes_filter', true)
    .gte('published_at', sinceIso)
    .order('published_at', { ascending: false })
    .limit(Math.max(maxTenders * 3, 200));  // overscan, we'll trim after skip-filter
  if (error) {
    return {
      ok: false,
      tendersConsidered: 0,
      tendersWithCandidates: 0,
      matchesWritten: 0,
      errors: [`select tenders: ${error.message}`],
    };
  }

  let tenders = (data || []) as Array<{ id: string }>;

  // If skipScored: drop tenders that already have at least one match. Keeps
  // a fixed per-run budget from rescoring the same tenders every night.
  if (skipScored && tenders.length > 0) {
    // Chunk to avoid URL length limits on .in()
    const ID_CHUNK = 100;
    const scoredTenderIds = new Set<string>();
    for (let i = 0; i < tenders.length; i += ID_CHUNK) {
      const slice = tenders.slice(i, i + ID_CHUNK).map((t) => t.id);
      const { data: scored } = await supabase
        .from('tender_matches')
        .select('tender_id')
        .in('tender_id', slice);
      for (const row of (scored || []) as Array<{ tender_id: string }>) {
        scoredTenderIds.add(row.tender_id);
      }
    }
    tenders = tenders.filter((t) => !scoredTenderIds.has(t.id));
  }

  tenders = tenders.slice(0, maxTenders);

  let tendersWithCandidates = 0;
  let matchesWritten = 0;
  const errors: string[] = [];

  // Fetch the recalibration feedback once for the whole batch.
  const recentFeedback = await getRecentFeedback(supabase);

  // Parallelize tenders. Each tender's internal 5 scoreMatch calls stay
  // sequential to benefit from the cached system+tender block. Concurrency=5
  // means ~5 tenders × ~50s sequential = ~50s wall-clock per wave; 20 tenders
  // ÷ 5 = 4 waves ≈ 200s. Fits under the 300s function cap.
  const CONCURRENCY = 2;
  const queue = [...tenders];
  let active = 0;
  await new Promise<void>((resolve) => {
    const next = () => {
      while (active < CONCURRENCY && queue.length > 0) {
        const t = queue.shift()!;
        active += 1;
        matchTender(supabase, t.id, { candidateLimit, recentFeedback })
          .then((out) => {
            if (out.candidates > 0) tendersWithCandidates += 1;
            matchesWritten += out.written;
            errors.push(...out.errors.map((e) => `${t.id}: ${e}`));
          })
          .catch((err) => {
            errors.push(`${t.id}: ${err instanceof Error ? err.message : String(err)}`);
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

  return {
    ok: errors.length === 0,
    tendersConsidered: tenders.length,
    tendersWithCandidates,
    matchesWritten,
    errors,
  };
}
