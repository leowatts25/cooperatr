// ============================================================================
// TED (Tenders Electronic Daily) ingester
// ============================================================================
// Pulls EU above-threshold notices from the official TED public Search API.
// Endpoint: https://api.ted.europa.eu/v3/notices/search (POST, JSON body)
// Docs:     https://docs.ted.europa.eu/api/
//
// This is intentionally defensive: TED returns ~80 different notice forms
// (eForms F01..F23, regulation-2015 forms, etc.) and field availability
// varies. We store the entire raw record in `tenders.raw` and extract a
// best-effort set of normalized fields. When a field is missing we leave
// it null rather than guessing.
//
// The cron route reads sector configs from the DB, calls fetchTedNotices(),
// runs each through applyFilter() and upserts into the tenders table.
// ============================================================================

import type { SectorRow } from './filter';
import { applyFilter } from './filter';

// We use the older TED endpoint (ted.europa.eu/api/v3.0/...) which accepts
// legacy 2-letter field codes (ND/TI/PD/...) and TED expert-search query
// syntax. The newer host (api.ted.europa.eu/v3/...) requires eForms 2015
// BT codes whose allowlist isn't publicly documented and shifts often.
const TED_API_URL = 'https://ted.europa.eu/api/v3.0/notices/search';

export interface RawTedNotice {
  // Loose shape — TED v3 returns a complex object per notice. We index
  // into it defensively below.
  [key: string]: unknown;
}

export interface NormalizedTender {
  source: 'TED';
  source_ref: string;
  url: string | null;
  title: string | null;
  description: string | null;
  donor: string;                  // 'EU' by default for TED notices
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
  rawResponse: unknown;  // Stored when debugging
}

// ----------------------------------------------------------------------------
// TED API call
// ----------------------------------------------------------------------------

export async function fetchTedNotices(opts: FetchOpts): Promise<FetchResult> {
  // TED expert-search syntax uses date format YYYYMMDD with range operator.
  // 2-letter field codes are stable: ND=notice ID, TI=title, PD=publication
  // date, DD=deadline, CY=country code, CPV=Common Procurement Vocabulary,
  // VAL=estimated value, TY=type of contract, AA=authority type, OJ=Official
  // Journal reference, RP=buyer profile URL, AUTH_NAME=contracting authority.
  const fromDate = compactDate(daysAgo(opts.sinceDays));
  const toDate = compactDate(new Date());
  const body = {
    query: `PD=[${fromDate} TO ${toDate}]`,
    fields: ['ND', 'TI', 'PD', 'DD', 'CY', 'CPV', 'VAL', 'TY', 'AA', 'OJ', 'AUTH_NAME', 'AUTH_NAME_ENG', 'RP', 'NC', 'PR', 'IA'],
    pageSize: opts.pageSize,
    pageNum: opts.pageNum,
    scope: 'ACTIVE',
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
    throw new Error(`TED API ${res.status}: ${txt.slice(0, 500)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const notices = readAsArray(json.notices) ?? readAsArray(json.results) ?? [];
  const total = (json.total as number) ?? (json.totalNoticeCount as number) ?? notices.length;

  return { notices, totalNotices: total, rawResponse: json };
}

// ----------------------------------------------------------------------------
// Normalization — defensive field plucking
// ----------------------------------------------------------------------------

export function normalizeTedNotice(raw: RawTedNotice, sectors: SectorRow[]): NormalizedTender | null {
  // publication-number e.g. "12345-2025" — the only reliable unique key.
  const sourceRef = pickString(raw, [
    'publication-number',
    'publicationNumber',
    'ND',
    'noticeId',
  ]);
  if (!sourceRef) return null;

  const title = pickMultilingual(raw, ['notice-title', 'title', 'TI', 'OT']);
  const description = pickMultilingual(raw, ['description-procurement', 'description', 'DS', 'SR']);
  const buyer = pickMultilingual(raw, ['AUTH_NAME_ENG', 'AUTH_NAME', 'buyer-name', 'buyerName', 'AA']);
  const country = pickString(raw, ['CY', 'country', 'place-performance']);
  const noticeType = pickString(raw, ['TY', 'NC', 'notice-type', 'noticeType', 'TD', 'AC']);
  const publishedAt = parseDate(pickString(raw, ['PD', 'publication-date', 'publicationDate']));
  const deadlineAt = parseDate(pickString(raw, ['DD', 'DT', 'deadline-receipt-tender-date-lot', 'deadline']));

  const { min: valueMin, max: valueMax, currency, rawText } = readValue(raw);
  const url = readUrl(raw, sourceRef);

  // Run the lightweight filter
  const filterCandidate = {
    title,
    description,
    value_usd_min: valueMin,
    value_usd_max: valueMax,
  };
  const filter = applyFilter(filterCandidate, sectors);

  return {
    source: 'TED',
    source_ref: sourceRef,
    url,
    title,
    description: description?.slice(0, 4000) ?? null,  // cap to avoid 100KB rows
    donor: 'EU',
    buyer,
    country,
    region: null,         // populated later by region classifier
    sectors: filter.matchedSectors,
    type: classifyType(noticeType),
    value_usd_min: valueMin,
    value_usd_max: valueMax,
    currency,
    raw_value_text: rawText,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    raw,
    passes_filter: filter.passes,
    filter_reasons: filter.reasons,
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
  // TED returns multilingual fields like `{ "en": "...", "fr": "..." }`.
  // We prefer en, fall back to es, then any value.
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === 'string') {
      return (v as string[]).join(' ').slice(0, 8000);
    }
    if (v && typeof v === 'object') {
      const m = v as Record<string, unknown>;
      const eng = m.en ?? m.EN;
      if (typeof eng === 'string' && eng.trim()) return eng.trim();
      const esp = m.es ?? m.ES;
      if (typeof esp === 'string' && esp.trim()) return esp.trim();
      // any other lang
      for (const key of Object.keys(m)) {
        const val = m[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
    }
  }
  return null;
}

function readValue(raw: RawTedNotice): {
  min: number | null;
  max: number | null;
  currency: string | null;
  rawText: string | null;
} {
  // TED stores value across several fields depending on form version.
  const direct = raw['estimated-value'] ?? raw.estimatedValue ?? raw.VAL ?? null;
  const cur = pickString(raw, ['estimated-value-cur', 'estimatedValueCur', 'currency']);
  let amount: number | null = null;
  let rawText: string | null = null;

  if (typeof direct === 'number') {
    amount = direct;
    rawText = String(direct);
  } else if (typeof direct === 'string') {
    rawText = direct;
    const m = direct.replace(/[,\s]/g, '').match(/-?\d+(\.\d+)?/);
    if (m) amount = Number(m[0]);
  }

  // Currency conversion: TED values are typically EUR; convert to USD with a
  // static rate (close enough for filter decisions). We can swap this for a
  // real FX feed later.
  const usd = amount == null ? null : toUsd(amount, cur);

  return {
    min: usd,
    max: usd,
    currency: cur,
    rawText,
  };
}

const FX_TO_USD: Record<string, number> = {
  EUR: 1.08, USD: 1.0, GBP: 1.26, CHF: 1.14, SEK: 0.095, DKK: 0.145, NOK: 0.094, PLN: 0.25,
};
function toUsd(amount: number, currency: string | null): number {
  const c = (currency || 'EUR').toUpperCase();
  const rate = FX_TO_USD[c] ?? 1;
  return Math.round(amount * rate);
}

function readUrl(raw: RawTedNotice, sourceRef: string): string {
  const links = raw.links;
  if (links && typeof links === 'object') {
    const l = (links as Record<string, unknown>).html ?? (links as Record<string, unknown>).self;
    if (typeof l === 'string') return l;
  }
  // Fallback: build a canonical TED viewer URL from publication-number "N-YYYY".
  const [n, year] = sourceRef.split('-');
  if (n && year) return `https://ted.europa.eu/en/notice/-/detail/${n}-${year}`;
  return `https://ted.europa.eu/`;
}

function classifyType(notice: string | null): string {
  if (!notice) return 'unknown';
  const n = notice.toLowerCase();
  if (n.includes('service')) return 'services';
  if (n.includes('work')) return 'works';
  if (n.includes('good') || n.includes('supply')) return 'goods';
  return 'unknown';
}

function readAsArray(v: unknown): RawTedNotice[] | null {
  return Array.isArray(v) ? (v as RawTedNotice[]) : null;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function compactDate(d: Date): string {
  // TED expert-search wants YYYYMMDD without separators.
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function parseDate(s: string | null): string | null {
  // TED legacy date format is YYYYMMDD; modern is ISO. Return ISO-8601.
  if (!s) return null;
  const t = s.trim();
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
