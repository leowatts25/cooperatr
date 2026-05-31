// ============================================================================
// EU Funding & Tenders Portal ingester — NDICI/Global Gateway/IPA/NEAR calls
// ============================================================================
// API: https://api.tech.ec.europa.eu/search-api/prod/rest/search
// Auth: apiKey=SEDIA (public key, no registration required)
// Method: POST with search params as GET query parameters
//
// The EU F&T portal (SEDIA) is the canonical source for:
//   - EC-INTPA procurement contracts (NDICI/Global Europe, DCI, EDF)
//   - EC-NEAR procurement contracts (IPA III, ENI, European Neighbourhood)
//   - Global Gateway initiative TA contracts
//   - NDICI-funded grant calls for CSOs
//
// Key field mappings confirmed empirically:
//   metadata.type[0]
//     '0' = Call for Tenders (procurement contract — CFT)
//     '1' = Call for Proposals (R&D / Horizon grant topic)
//     '2' = Call for Proposals (INTPA/NEAR grant call for CSOs)
//   metadata.sortStatus[0]
//     '1' = OPEN (accepting submissions)
//     '2' = FORTHCOMING (PIN / prior information notice)
//     '3' = CLOSED
//     '4' = UNDER EVALUATION (past deadline, not yet awarded)
//   metadata.callIdentifier[0] = unique reference, e.g. "EC-INTPA/ABV/2026/EA-RP/0003"
//   metadata.title[0] = notice title
//   metadata.description[0] = full description text
//   metadata.startDate[0] = ISO date string — publication date
//   metadata.deadlineDate[0] = ISO date string — submission deadline
//   metadata.cftEstimatedOverallContractAmount[0] = numeric string (EUR)
//   metadata.cftEstimatedOverallContractCurrency[0] = 'EUR'
//   metadata.lots[0] = JSON string — see parseLots() below
//     lots.procurementProjectLots[0].benefittingZones = country array
//     lots.procurementProjectLots[0].programmes[0].ccmCode = programme code
//     lots.procurementProjectLots[0].procurementProject.procurementTypeCode = 'services'|'works'|'goods'
//   metadata.esST_URL[0] = canonical portal URL for the notice
//   metadata.cftId[0] = same as the UUID in the portal URL
//   metadata.mainCpv = string[] of CPV codes
// ============================================================================

import type { SectorRow } from './filter';
import { applyFilter } from './filter';

const SEDIA_SEARCH_URL = 'https://api.tech.ec.europa.eu/search-api/prod/rest/search';
const SEDIA_API_KEY = 'SEDIA';

// ─── Dev-finance relevance: INTPA/NEAR call identifier prefixes ───────────────
// The callIdentifier for EC dev-finance procurement follows these patterns:
//   EC-INTPA/...     → DG INTPA (International Partnerships) — NDICI-Global Europe
//   EC-NEAR/...      → DG NEAR (Neighbourhood & Enlargement) — IPA III, ENI
//   NEAR/...         → Older DG NEAR format
//   EC-DEVCO/...     → Legacy DG DEVCO (now INTPA)
//   EC-FPI/...       → DG FPI (Foreign Policy Instruments) — IcSP, IfS
// ─────────────────────────────────────────────────────────────────────────────
const DEV_FINANCE_CALL_PREFIXES = [
  'EC-INTPA/',
  'EC-NEAR/',
  'NEAR/',
  'EC-DEVCO/',
  'EC-FPI/',
];

// Keywords in title/description that strongly suggest a dev-finance TA tender
const DEV_FINANCE_TEXT_SIGNALS = [
  'ndici',
  'global europe',
  'global gateway',
  'ipa iii', 'ipa ii', ' ipa ',
  'europeaid',
  'dg intpa',
  'dg near',
  'devco',
  'technical assistance',
  'capacity building',
  'eu delegation',
  'eud ',
];

// ─── Programme code → donor label mapping ────────────────────────────────────
const PROGRAMME_TO_DONOR: Record<string, string> = {
  // INTPA / NDICI-Global Europe geographic programmes
  SSA:  'NDICI',   // Sub-Saharan Africa
  LAC:  'NDICI',   // Latin America & Caribbean
  CSP:  'NDICI',   // Central & South Asia / Pacific
  MAS:  'NDICI',   // Middle East & Asia
  ENI:  'ENI',     // European Neighbourhood Instrument (legacy)
  // NEAR / IPA
  IPA:  'IPA',     // Instrument for Pre-Accession
  CFSP: 'EU-CFSP', // Common Foreign & Security Policy
  // Generic / fallback
  EDF:  'EDF',     // European Development Fund
  DCI:  'DCI',     // Development Cooperation Instrument (legacy)
};

// ─── CPV → sector supplementary mapping (same logic as TED) ─────────────────
// Only CPV codes that appear in genuine dev-finance TA contracts
const CPV_TO_SECTOR: Array<{ prefix: string; sector: string }> = [
  { prefix: '03', sector: 'agri_food' },
  { prefix: '77', sector: 'agri_food' },
  { prefix: '15', sector: 'agri_food' },
  { prefix: '45251', sector: 'renewable_energy' },
  { prefix: '45261', sector: 'renewable_energy' },
  { prefix: '41', sector: 'water_tech' },
  { prefix: '45232', sector: 'water_tech' },
  { prefix: '45247', sector: 'water_tech' },
  { prefix: '90510', sector: 'circular_esg' },
  { prefix: '90711', sector: 'circular_esg' },
  { prefix: '90720', sector: 'circular_esg' },
  { prefix: '14', sector: 'critical_minerals' },
  { prefix: '75100', sector: 'human_rights' },
  { prefix: '75200', sector: 'human_rights' },
  // CPV 79411 (general mgmt consulting) and 73000 (R&D services) removed:
  // too generic, they over-tagged consulting/research tenders as human_rights.
];

// ─── Exported interfaces ──────────────────────────────────────────────────────

export interface RawEftNotice {
  reference: string;
  url: string | null;
  summary: string | null;
  metadata: Record<string, unknown[]>;
  [key: string]: unknown;
}

export interface NormalizedEftTender {
  source: 'EU_FT';
  source_ref: string;
  url: string | null;
  title: string | null;
  description: string | null;
  donor: string;
  buyer: string | null;
  country: string | null;
  region: string | null;
  sectors: string[];
  type: string | null;
  value_usd_min: number | null;
  value_usd_max: number | null;
  currency: string | null;
  raw_value_text: string | null;
  published_at: string | null;
  deadline_at: string | null;
  raw: RawEftNotice;
  passes_filter: boolean;
  filter_reasons: string[];
}

interface FetchOpts {
  sinceDays: number;
  pageSize: number;
  pageNum: number;
  searchText: string;
}

interface FetchResult {
  notices: RawEftNotice[];   // post client-side filter (biddable only)
  totalResults: number;
  rawCount: number;          // results returned by the API before filtering —
                             // used to decide whether more pages exist
}

// ─── API call ─────────────────────────────────────────────────────────────────

export async function fetchEftNotices(opts: FetchOpts): Promise<FetchResult> {
  const params = new URLSearchParams({
    apiKey: SEDIA_API_KEY,
    text: opts.searchText,
    pageSize: String(opts.pageSize),
    pageNumber: String(opts.pageNum),
    sortBy: 'startDate',
    sortOrder: 'DESC',
  });

  const res = await fetch(`${SEDIA_SEARCH_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'cooperatr-bd-scanner/0.1 (+https://cooperatr.com)',
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`EU F&T (SEDIA) API ${res.status}: ${txt.slice(0, 400)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;

  if (json.type === 'businessError') {
    throw new Error(`EU F&T (SEDIA) business error: ${json.message}`);
  }

  const rawResults = Array.isArray(json.results) ? (json.results as RawEftNotice[]) : [];
  const totalResults = typeof json.totalResults === 'number' ? json.totalResults : rawResults.length;

  // Client-side filter: only procurement (type=0) and grant calls (type=2)
  // that are actionable — i.e. a consultant can still bid. Skip R&D Horizon/FP7
  // topics (type=1).
  //
  // IMPORTANT: dev-finance calls open for weeks-to-months, so we do NOT filter
  // on publication date (startDate). The relevant question is "can Leo still
  // submit?" — which means status OPEN/FORTHCOMING and a deadline in the future.
  // (An earlier version filtered startDate within `sinceDays`; that rejected
  // 100% of results because the newest INTPA tenders publish months before
  // their deadlines.)
  const now = new Date();

  const notices = rawResults.filter((r) => {
    const meta = r.metadata ?? {};
    const typeVal = pickMeta(meta, 'type');
    const sortStatus = pickMeta(meta, 'sortStatus');
    const deadlineStr = pickMeta(meta, 'deadlineDate');

    // Only process procurement contracts and grant call-for-proposals
    if (typeVal !== '0' && typeVal !== '2') return false;

    // Accept: OPEN (1) and FORTHCOMING (2) only — these are biddable.
    // Skip: CLOSED (3) and UNDER EVALUATION (4) — submission window has passed.
    if (sortStatus !== '1' && sortStatus !== '2') return false;

    // If there's a deadline, it must still be in the future. FORTHCOMING calls
    // (and any with a missing/unparseable deadline) are kept — they haven't
    // opened yet or the deadline isn't published.
    if (deadlineStr) {
      const deadline = new Date(deadlineStr);
      if (!isNaN(deadline.getTime()) && deadline < now) return false;
    }

    return true;
  });

  return { notices, totalResults, rawCount: rawResults.length };
}

// ─── Normalization ────────────────────────────────────────────────────────────

export function normalizeEftNotice(raw: RawEftNotice, sectors: SectorRow[]): NormalizedEftTender | null {
  const meta = raw.metadata ?? {};

  // source_ref: prefer callIdentifier (human-readable + unique), fall back to cftId/reference
  const callId = pickMeta(meta, 'callIdentifier');
  const cftId = pickMeta(meta, 'cftId');
  const sourceRef = callId || cftId || raw.reference;
  if (!sourceRef) return null;

  // Title: metadata.title[0] is the canonical title for CFT notices.
  // For some multilingual notices the same CFT is indexed multiple times (one per language).
  // We deduplicate via source_ref (callIdentifier) in the upsert.
  const title = pickMeta(meta, 'title');
  const description = pickMetaLong(meta, 'description');

  // URL: esST_URL is the stable portal deep-link URL
  const portalUrl = pickMeta(meta, 'esST_URL')
    || pickMeta(meta, 'url')
    || raw.url
    || (cftId ? `https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/tender-details/${cftId}` : null);

  // Dates
  const publishedAt = isoDate(pickMeta(meta, 'startDate'));
  const deadlineAt = isoDate(pickMeta(meta, 'deadlineDate'));

  // Value
  const { min, max, currency, rawText } = readValue(meta);

  // Country and programme from lots JSON
  const { countries, programmeCode, contractType } = parseLots(meta);
  const country = countries.length > 0 ? countries.join(', ') : null;

  // Derive donor from callIdentifier prefix or programme code
  const donor = deriveDonor(callId ?? '', programmeCode);

  // Buyer: for INTPA/NEAR the contracting authority is the EU Delegation
  // caName is confusingly named — it's actually the title for CFTs, not the buyer.
  // The real buyer is embedded in the callIdentifier (e.g. ABV = Abidjan delegation).
  const buyer = deriveContractingAuthority(callId ?? '');

  // Type: procurement type from lots data ('services', 'works', 'goods')
  const type = contractType || classifyTypeFromTitle(title);

  // CPV-based sector tags
  const cpvCodes = (meta['mainCpv'] as string[] | undefined) ?? [];
  const cpvSectors = sectorsFromCpv(cpvCodes);

  // Keyword filter on title + description
  const filterInput = {
    title,
    description,
    value_usd_min: min,
    value_usd_max: max,
  };
  const keywordFilter = applyFilter(filterInput, sectors);
  const mergedSectors = Array.from(new Set([...keywordFilter.matchedSectors, ...cpvSectors]));
  const reasons = [
    ...keywordFilter.reasons,
    ...cpvSectors.map((s) => `cpv:${s}`),
  ];

  // EU F&T portal tenders are already dev-finance by definition (INTPA/NEAR programmes).
  // We still require the sector keyword match but skip the additional dev-finance gate
  // that TED needs (TED ingests all EU domestic procurement too).
  const passes = keywordFilter.passes;

  return {
    source: 'EU_FT',
    source_ref: sourceRef,
    url: portalUrl,
    title,
    description: description?.slice(0, 4000) ?? null,
    donor,
    buyer,
    country,
    region: programmeCode || null,
    sectors: mergedSectors,
    type,
    value_usd_min: min,
    value_usd_max: max,
    currency,
    raw_value_text: rawText,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    raw,
    passes_filter: passes,
    filter_reasons: reasons,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/** Pick the first non-empty string value from a metadata array field. */
function pickMeta(meta: Record<string, unknown[]>, key: string): string | null {
  const arr = meta[key];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  for (const v of arr) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

/** Same as pickMeta but concatenates all non-empty values for description fields. */
function pickMetaLong(meta: Record<string, unknown[]>, key: string): string | null {
  const arr = meta[key];
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const parts = arr.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()));
  return parts.length > 0 ? parts.join('\n\n') : null;
}

/** Parse an ISO date string (with optional TZ offset) to a plain YYYY-MM-DD string. */
function isoDate(s: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // ISO with time or TZ — e.g. "2026-01-23T00:00:00.000+0000"
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Extract value from cftEstimatedOverallContractAmount. Values are in EUR, converted to USD. */
function readValue(meta: Record<string, unknown[]>): {
  min: number | null;
  max: number | null;
  currency: string | null;
  rawText: string | null;
} {
  const amtStr = pickMeta(meta, 'cftEstimatedOverallContractAmount');
  const currStr = pickMeta(meta, 'cftEstimatedOverallContractCurrency') ?? 'EUR';
  if (!amtStr) return { min: null, max: null, currency: null, rawText: null };

  const amt = Number(amtStr.replace(/[^0-9.]/g, ''));
  if (isNaN(amt) || amt <= 0) return { min: null, max: null, currency: null, rawText: amtStr };

  // Convert EUR → USD (rough static FX: 1 EUR ≈ 1.08 USD)
  const usdAmt = Math.round(amt * 1.08);
  return {
    min: usdAmt,
    max: usdAmt,
    currency: currStr,
    rawText: `${amtStr} ${currStr}`,
  };
}

interface LotsData {
  countries: string[];
  programmeCode: string | null;
  contractType: string | null;
}

/**
 * Parse the lots JSON string from SEDIA metadata.
 *
 * The lots field encodes the full eForms procurement project data as a JSON
 * string. Key sub-fields:
 *   procurementProjectLots[0].benefittingZones — array of geographic zones
 *   procurementProjectLots[0].programmes[0].ccmCode — programme code
 *   procurementProjectLots[0].procurementProject.procurementTypeCode — services/works/goods
 */
function parseLots(meta: Record<string, unknown[]>): LotsData {
  const lotsArr = meta['lots'];
  if (!Array.isArray(lotsArr) || lotsArr.length === 0) {
    return { countries: [], programmeCode: null, contractType: null };
  }

  try {
    const lotsStr = lotsArr[0];
    if (typeof lotsStr !== 'string') return { countries: [], programmeCode: null, contractType: null };

    const lotsJson = JSON.parse(lotsStr) as Record<string, unknown>;
    const lots = lotsJson['procurementProjectLots'];
    if (!Array.isArray(lots) || lots.length === 0) {
      return { countries: [], programmeCode: null, contractType: null };
    }

    const lot = lots[0] as Record<string, unknown>;

    // Benefitting zones: extract Country-type zones only (skip region zones)
    const zones = (lot['benefittingZones'] as Array<Record<string, unknown>> | undefined) ?? [];
    const countries = zones
      .filter((z) => z['ccmType'] === 'Country')
      .map((z) => String(z['description'] ?? z['ccmCode'] ?? ''))
      .filter(Boolean);

    // Programme code (first programme's ccmCode)
    const programmes = (lot['programmes'] as Array<Record<string, unknown>> | undefined) ?? [];
    const programmeCode = programmes.length > 0
      ? String(programmes[0]['ccmCode'] ?? '')
      : null;

    // Contract type from procurement project
    const pp = (lot['procurementProject'] as Record<string, unknown> | undefined) ?? {};
    const contractType = String(pp['procurementTypeCode'] ?? '') || null;

    return { countries, programmeCode: programmeCode || null, contractType: contractType || null };
  } catch {
    return { countries: [], programmeCode: null, contractType: null };
  }
}

/**
 * Derive the donor label from the callIdentifier prefix and programme code.
 *
 * The callIdentifier follows the pattern: EC-<OFFICE>/<DELEGATION>/<YEAR>/...
 * where OFFICE is INTPA, NEAR, FPI, DEVCO, or DIGIT.
 */
function deriveDonor(callId: string, programmeCode: string | null): string {
  const id = callId.toLowerCase();
  if (id.startsWith('ec-intpa/') || id.startsWith('ec-devco/')) return 'NDICI';
  if (id.startsWith('ec-near/') || id.startsWith('near/')) return 'IPA';
  if (id.startsWith('ec-fpi/')) return 'EU-FPI';

  // Fall back to programme code
  if (programmeCode && PROGRAMME_TO_DONOR[programmeCode]) {
    return PROGRAMME_TO_DONOR[programmeCode];
  }

  return 'EU-GRANT';
}

/**
 * Derive the contracting authority from the callIdentifier.
 *
 * EC delegations are identified by a 3-letter city/country code in the
 * callIdentifier. E.g. EC-INTPA/ABV/... → "EU Delegation in Abidjan"
 */
function deriveContractingAuthority(callId: string): string | null {
  if (!callId) return null;
  // Pattern: EC-INTPA/ABV/... or EC-NEAR/SJJ/...
  const match = callId.match(/^EC-[A-Z]+\/([A-Z]{3})\//);
  if (match) return `EU Delegation (${match[1]})`;
  return 'European Commission';
}

/** Classify contract type from title keywords when lots data is unavailable. */
function classifyTypeFromTitle(title: string | null): string {
  if (!title) return 'services';
  const t = title.toLowerCase();
  if (t.includes('supply') || t.includes('goods') || t.includes('equipment')) return 'goods';
  if (t.includes('work') || t.includes('construction') || t.includes('infrastructure')) return 'works';
  return 'services'; // Default for TA and consulting
}

/** Map CPV codes to sector slugs (same mapping table as TED ingester). */
function sectorsFromCpv(codes: string[]): string[] {
  const hits = new Set<string>();
  for (const c of codes) {
    if (typeof c !== 'string') continue;
    const code = c.trim();
    for (const { prefix, sector } of CPV_TO_SECTOR) {
      if (code.startsWith(prefix)) {
        hits.add(sector);
        break;
      }
    }
  }
  return Array.from(hits);
}

// isDevFinanceCallId and isDevFinanceText are exported for testing
export function isDevFinanceCallId(callId: string): boolean {
  const id = callId.toLowerCase();
  return DEV_FINANCE_CALL_PREFIXES.some((p) => id.startsWith(p.toLowerCase()));
}

export function isDevFinanceText(title: string | null, description: string | null): boolean {
  const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  return DEV_FINANCE_TEXT_SIGNALS.some((sig) => text.includes(sig));
}
