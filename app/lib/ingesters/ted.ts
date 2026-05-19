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

const TED_API_URL = 'https://api.ted.europa.eu/v3/notices/search';

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
  const sinceDate = isoDate(daysAgo(opts.sinceDays));
  // TED v3 expert-search query: publication-date filter only. We deliberately
  // omit `fields` and `scope` — TED's field-allowlist uses eForms 2015 codes
  // (BT-* / lot-scoped names) and the default response set already includes
  // what we need. We store the full raw record so missing fields can be
  // re-extracted later without re-fetching.
  const body = {
    query: `publication-date>=${sinceDate}`,
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
  const buyer = pickMultilingual(raw, ['buyer-name', 'buyerName', 'AA']);
  const country = pickString(raw, ['country', 'place-performance', 'CY']);
  const noticeType = pickString(raw, ['notice-type', 'noticeType', 'TD', 'AC']);
  const publishedAt = pickString(raw, ['publication-date', 'publicationDate', 'PD']);
  const deadlineAt = pickString(raw, ['deadline-receipt-tender-date-lot', 'deadline', 'DD', 'DT']);

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
