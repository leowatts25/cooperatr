// ============================================================================
// TED (Tenders Electronic Daily) ingester — eForms 2015 / TED v3 API
// ============================================================================
// Endpoint: https://api.ted.europa.eu/v3/notices/search (POST, JSON body)
//
// TED v3 uses eForms 2015 field codes. The validated set we use:
//   - publication-number          : unique notice ID, e.g. "334575-2026"
//   - title-proc                  : procedure title (the canonical tender title)
//   - title-glo                   : occasional global title
//   - title-lot                   : occasional lot title
//   - publication-date            : ISO date with TZ
//   - deadline-receipt-tender-date-lot : array of lot deadlines
//   - description-proc            : procedure description
//   - buyer-name                  : multilingual buyer object
//   - organisation-country-buyer  : array of ISO 3166-1 alpha-3 country codes
//   - classification-cpv          : array of CPV codes (8-digit)
//   - framework-maximum-value-lot : array of values per lot
//
// Multilingual fields come back as { "<lang3>": "value" } or
// { "<lang3>": ["v1", "v2"] }. Language codes are ISO 639-2 alpha-3
// (e.g. "eng", "pol", "spa", "fra", "deu").
//
// Query uses TED expert-search syntax. Date values must be YYYYMMDD or
// today(±N). Range syntax is `field=[YYYYMMDD TO YYYYMMDD]`.
// ============================================================================

import type { SectorRow } from './filter';
import { applyFilter } from './filter';

const TED_API_URL = 'https://api.ted.europa.eu/v3/notices/search';

// ─── Dev-finance relevance gate for TED ──────────────────────────────────────
// TED publishes ~800 notices/day — mostly EU member-state domestic commercial
// procurement (Polish electricity supply, Czech construction, Italian water
// utilities, etc.). None of that is relevant to cooperatr.
//
// We only want TED notices that have a credible dev-finance angle:
//   (a) Buyer is outside the EU-27 (pre-accession, neighbourhood, developing
//       country — these are typically EuropeAid/IPA/NDICI funded), OR
//   (b) Title or description contains an explicit dev-finance signal word.
//
// This gate runs AFTER the sector keyword filter, so both must pass.
// ─────────────────────────────────────────────────────────────────────────────

const EU27_ALPHA3 = new Set([
  'AUT', 'BEL', 'BGR', 'CYP', 'CZE', 'DEU', 'DNK', 'EST', 'ESP', 'FIN', 'FRA',
  'GRC', 'HRV', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL',
  'PRT', 'ROU', 'SVK', 'SVN', 'SWE',
]);

// EU Commission / EEAS / agencies buying for domestic EU admin are still EU-27
// buyers — not dev-finance. These buyer keywords flag genuine TA contracts:
const DEV_FINANCE_SIGNALS = [
  'technical assistance',
  'capacity building', 'capacity-building',
  'twinning',
  'ndici',
  'global gateway',
  'ipa iii', 'ipa ii', ' ipa ',
  'eu delegation',
  'europeaid',
  'dg intpa',
  'devco',
  'developing countr',
  'development cooperation',
  'international development',
  'sub-saharan',
  'west africa', 'east africa', 'southern africa', 'central africa',
  'horn of africa',
  'latin america', 'caribbean',
  'central asia',
  'south asia',
  'eastern partnership',
  'western balkans',
  'neighbourhood policy',
  'sigma ',
  'official development assistance',
  ' oda ',
  'pre-accession',
  'accession process',
  'institutional reform',
  'sector reform',
  'policy reform',
  'advisory services',
];

function isDevFinanceRelevant(
  country: string | null,
  title: string | null,
  description: string | null,
): boolean {
  // Buyer outside EU-27 → likely dev-finance (IPA candidate countries, neighbours, etc.)
  if (country && country.trim() && !EU27_ALPHA3.has(country.trim().toUpperCase())) {
    return true;
  }
  // Text signal scan
  const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  return DEV_FINANCE_SIGNALS.some((sig) => text.includes(sig));
}

const TED_FIELDS = [
  'publication-number',
  'title-proc',
  'title-glo',
  'title-lot',
  'publication-date',
  'deadline-receipt-tender-date-lot',
  'description-proc',
  'buyer-name',
  'organisation-country-buyer',
  'classification-cpv',
  'framework-maximum-value-lot',
];

export interface RawTedNotice {
  [key: string]: unknown;
}

export interface NormalizedTender {
  source: 'TED';
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
  raw: RawTedNotice;
  passes_filter: boolean;
  filter_reasons: string[];
}

interface FetchOpts {
  sinceDays: number;
  pageSize: number;
  pageNum: number;
}

interface FetchResult {
  notices: RawTedNotice[];
  totalNotices: number;
}

// ----------------------------------------------------------------------------
// API call
// ----------------------------------------------------------------------------

export async function fetchTedNotices(opts: FetchOpts): Promise<FetchResult> {
  // TED expert-search: `publication-date>YYYYMMDD` returns notices published
  // strictly after the given date. Use a relative form so we don't have to
  // worry about timezone alignment.
  const body = {
    query: `publication-date>=today(${-opts.sinceDays})`,
    fields: TED_FIELDS,
    page: opts.pageNum,
    limit: opts.pageSize,
  };

  const res = await fetch(TED_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'cooperatr-bd-scanner/0.1 (+https://cooperatr.com)',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`TED API ${res.status}: ${txt.slice(0, 400)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const notices = Array.isArray(json.notices) ? (json.notices as RawTedNotice[]) : [];
  const total = (json.totalNoticeCount as number) ?? notices.length;
  return { notices, totalNotices: total };
}

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

export function normalizeTedNotice(raw: RawTedNotice, sectors: SectorRow[]): NormalizedTender | null {
  const sourceRef = pickString(raw, ['publication-number']);
  if (!sourceRef) return null;

  // Title can live in title-proc (most common), title-glo, or title-lot.
  const title = pickMultilingual(raw, ['title-proc', 'title-glo', 'title-lot']);
  const description = pickMultilingual(raw, ['description-proc', 'description-glo', 'description-lot']);
  const buyer = pickMultilingual(raw, ['buyer-name']);
  const country = readArrayFirstString(raw['organisation-country-buyer']);
  const publishedAt = isoFromTedDate(pickString(raw, ['publication-date']));
  const deadlineAt = isoFromTedDate(readArrayFirstString(raw['deadline-receipt-tender-date-lot']));
  const cpvCodes = readStringArray(raw['classification-cpv']);

  // Build the URL from the links block when available, else fall back to
  // the canonical /detail/ URL.
  const url = readEnglishLink(raw) || `https://ted.europa.eu/en/notice/-/detail/${sourceRef}`;

  const { min, max, currency, rawText } = readValue(raw);

  // Combine keyword match (title+description) with CPV-based sector tags
  const keywordFilter = applyFilter({ title, description, value_usd_min: min, value_usd_max: max }, sectors);
  const cpvSectors = sectorsFromCpv(cpvCodes);
  const mergedSectors = Array.from(new Set([...keywordFilter.matchedSectors, ...cpvSectors]));
  const reasons = [
    ...keywordFilter.reasons,
    ...cpvSectors.map((s) => `cpv:${s}`),
  ];

  return {
    source: 'TED',
    source_ref: sourceRef,
    url,
    title,
    description: description?.slice(0, 4000) ?? null,
    donor: 'EU',
    buyer,
    country,
    region: null,
    sectors: mergedSectors,
    type: 'unknown',  // TED v3 doesn't expose a simple type code; future: derive from CPV
    value_usd_min: min,
    value_usd_max: max,
    currency,
    raw_value_text: rawText,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    raw,
    // Two-gate filter:
    //   1. Sector keyword match (from applyFilter — already requires matched.length > 0)
    //   2. Dev-finance relevance gate — blocks domestic EU-27 procurement even when
    //      a sector keyword accidentally matches (e.g. "energy" in an electricity
    //      supply contract for a Polish municipality).
    passes_filter: keywordFilter.passes && isDevFinanceRelevant(country, title, description),
    filter_reasons: [
      ...reasons,
      isDevFinanceRelevant(country, title, description) ? 'dev_finance:yes' : 'dev_finance:no',
    ],
  };
}

// ----------------------------------------------------------------------------
// Field helpers
// ----------------------------------------------------------------------------

function pickString(obj: RawTedNotice, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function pickMultilingual(obj: RawTedNotice, keys: string[]): string | null {
  // TED returns multilingual fields like { "eng": "...", "pol": "..." } or
  // { "pol": ["..."] }. Prefer English, then Spanish, then any string value.
  const langPriority = ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'nld', 'pol'];
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') {
      return (v as string[])[0];
    }
    if (v && typeof v === 'object') {
      const m = v as Record<string, unknown>;
      // Try priority languages
      for (const lang of langPriority) {
        const val = m[lang] ?? m[lang.toUpperCase()];
        if (typeof val === 'string' && val.trim()) return val.trim();
        if (Array.isArray(val) && val.length && typeof val[0] === 'string') return (val as string[])[0];
      }
      // Fallback: any string value
      for (const key of Object.keys(m)) {
        const val = m[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
        if (Array.isArray(val) && val.length && typeof val[0] === 'string') return (val as string[])[0];
      }
    }
  }
  return null;
}

function readArrayFirstString(v: unknown): string | null {
  if (Array.isArray(v) && v.length) {
    const first = v[0];
    if (typeof first === 'string') return first;
  }
  if (typeof v === 'string') return v;
  return null;
}

function readStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}

function readEnglishLink(raw: RawTedNotice): string | null {
  const links = raw.links;
  if (!links || typeof links !== 'object') return null;
  const l = links as Record<string, unknown>;
  for (const kind of ['html', 'htmlDirect']) {
    const block = l[kind];
    if (block && typeof block === 'object') {
      const b = block as Record<string, unknown>;
      const eng = b.ENG ?? b.eng;
      if (typeof eng === 'string') return eng;
      // Fallback to any language
      for (const k of Object.keys(b)) {
        const val = b[k];
        if (typeof val === 'string') return val;
      }
    }
  }
  return null;
}

function isoFromTedDate(s: string | null): string | null {
  // TED dates: "2026-05-18+02:00" (with TZ offset) or "20260518" (compact).
  if (!s) return null;
  const t = s.trim();
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function readValue(raw: RawTedNotice): {
  min: number | null;
  max: number | null;
  currency: string | null;
  rawText: string | null;
} {
  // framework-maximum-value-lot comes as an array of values per lot.
  const v = raw['framework-maximum-value-lot'];
  if (Array.isArray(v) && v.length) {
    const nums = v
      .map((x) => (typeof x === 'number' ? x : typeof x === 'string' ? Number((x as string).replace(/[^0-9.]/g, '')) : NaN))
      .filter((n) => !isNaN(n) && n > 0);
    if (nums.length) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      // TED values are in EUR by default. Convert to USD (rough static FX).
      return {
        min: Math.round(min * 1.08),
        max: Math.round(max * 1.08),
        currency: 'EUR',
        rawText: nums.join(' | '),
      };
    }
  }
  return { min: null, max: null, currency: null, rawText: null };
}

// ----------------------------------------------------------------------------
// CPV → sector mapping
// ----------------------------------------------------------------------------
// Common Procurement Vocabulary codes are 8-digit numbers. The first 2 digits
// identify the broad sector. Only map CPV codes that genuinely appear in
// development-finance TA contracts — NOT commodity supply or domestic utility
// procurement (those generated false positives: CPV 09 = electricity supply
// for Polish municipalities, CPV 65 = domestic water distribution, etc.).
//
// Note: CPV matching is a *supplementary* signal — it adds sector tags that
// text keywords may miss. The dev-finance gate still applies on top.
const CPV_TO_SECTOR: Array<{ prefix: string; sector: string }> = [
  // Agri-food: products, agricultural/forestry services, food processing
  { prefix: '03', sector: 'agri_food' },          // agricultural products & live animals
  { prefix: '77', sector: 'agri_food' },          // agricultural, forestry, fishing services
  { prefix: '15', sector: 'agri_food' },          // food and beverages
  // Renewable energy: construction/installation projects only (not commodity supply)
  { prefix: '45251', sector: 'renewable_energy' },// power plant construction
  { prefix: '45261', sector: 'renewable_energy' },// roofwork including solar
  // Water: supply infrastructure & treatment services (not domestic distribution)
  { prefix: '41', sector: 'water_tech' },          // collected/purified water
  { prefix: '45232', sector: 'water_tech' },       // pipelines and associated works
  { prefix: '45247', sector: 'water_tech' },       // dams, canals, irrigation
  // Circular/ESG: environmental consulting & waste management services
  { prefix: '90510', sector: 'circular_esg' },     // refuse collection & disposal
  { prefix: '90711', sector: 'circular_esg' },     // environmental impact assessment
  { prefix: '90720', sector: 'circular_esg' },     // environmental protection
  // Critical minerals: mining sector only (not metals trading)
  { prefix: '14', sector: 'critical_minerals' },   // mining, metals, minerals, quarrying
  // Human rights / governance: consulting & public admin services
  { prefix: '75100', sector: 'human_rights' },     // public administration services
  { prefix: '75200', sector: 'human_rights' },     // welfare & related services
  { prefix: '79411', sector: 'human_rights' },     // general management consulting
  { prefix: '73000', sector: 'human_rights' },     // research & development services
];

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
