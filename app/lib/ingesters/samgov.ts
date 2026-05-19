// ============================================================================
// SAM.gov ingester
// ============================================================================
// US federal opportunities (post-USAID rebuild, DFC, MCC, State bilaterals).
// API:   https://api.sam.gov/opportunities/v2/search
// Docs:  https://open.gsa.gov/api/get-opportunities-public-api/
// Auth:  api_key query parameter (free key, 1000 req/day).
//
// Without SAMGOV_API_KEY set, this source is skipped silently so cron
// runs don't fail.
// ============================================================================

import type { SectorRow } from './filter';
import { applyFilter } from './filter';

const SAMGOV_API_URL = 'https://api.sam.gov/opportunities/v2/search';

export interface RawSamGovOpportunity {
  [key: string]: unknown;
}

export interface NormalizedSamGovTender {
  source: 'SAM_GOV';
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
  raw: RawSamGovOpportunity;
  passes_filter: boolean;
  filter_reasons: string[];
}

interface FetchOpts {
  sinceDays: number;
  limit: number;
  offset: number;
  apiKey: string;
}

interface FetchResult {
  opportunities: RawSamGovOpportunity[];
  totalRecords: number;
}

// ----------------------------------------------------------------------------
// API call
// ----------------------------------------------------------------------------

export async function fetchSamGovOpportunities(opts: FetchOpts): Promise<FetchResult> {
  const postedFrom = mmddyyyy(daysAgo(opts.sinceDays));
  const postedTo = mmddyyyy(new Date());
  const params = new URLSearchParams({
    api_key: opts.apiKey,
    postedFrom,
    postedTo,
    limit: String(opts.limit),
    offset: String(opts.offset),
    // ptype: filter by procurement type — leaving blank pulls all types.
  });

  const res = await fetch(`${SAMGOV_API_URL}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'cooperatr-bd-scanner/0.1 (+https://cooperatr.com)',
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`SAM.gov API ${res.status}: ${txt.slice(0, 400)}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const opps = Array.isArray(json.opportunitiesData) ? (json.opportunitiesData as RawSamGovOpportunity[]) : [];
  const total = (json.totalRecords as number) ?? opps.length;
  return { opportunities: opps, totalRecords: total };
}

// ----------------------------------------------------------------------------
// Normalization
// ----------------------------------------------------------------------------

export function normalizeSamGovOpportunity(raw: RawSamGovOpportunity, sectors: SectorRow[]): NormalizedSamGovTender | null {
  const sourceRef = pick(raw, ['noticeId', 'solicitationNumber']);
  if (!sourceRef) return null;

  const title = pick(raw, ['title']);
  const description = pick(raw, ['description']);
  const buyer = readBuyer(raw);
  const country = readCountry(raw);
  const noticeType = pick(raw, ['noticeType', 'type']);
  const publishedAt = pick(raw, ['postedDate', 'publishedDate']);
  const deadlineAt = pick(raw, ['responseDeadLine', 'responseDeadline']);
  const url = pick(raw, ['uiLink', 'descriptionUrl']) || `https://sam.gov/opp/${sourceRef}/view`;

  const { min, max, currency, rawText } = readValue(raw);

  const filter = applyFilter({ title, description, value_usd_min: min, value_usd_max: max }, sectors);

  return {
    source: 'SAM_GOV',
    source_ref: sourceRef,
    url,
    title,
    description: description?.slice(0, 4000) ?? null,
    donor: readDonor(buyer),
    buyer,
    country,
    region: null,
    sectors: filter.matchedSectors,
    type: classifyType(noticeType),
    value_usd_min: min,
    value_usd_max: max,
    currency: currency ?? 'USD',
    raw_value_text: rawText,
    published_at: publishedAt,
    deadline_at: deadlineAt,
    raw,
    passes_filter: filter.passes,
    filter_reasons: filter.reasons,
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function pick(obj: RawSamGovOpportunity, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function readBuyer(raw: RawSamGovOpportunity): string | null {
  // SAM.gov nests buyer info under `fullParentPathName` or `organizationName`.
  const direct = pick(raw, ['fullParentPathName', 'organizationName', 'departmentName']);
  if (direct) return direct;
  const office = raw['officeAddress'];
  if (office && typeof office === 'object') {
    const o = office as Record<string, unknown>;
    if (typeof o.name === 'string') return o.name;
  }
  return null;
}

function readCountry(raw: RawSamGovOpportunity): string | null {
  const place = raw['placeOfPerformance'];
  if (place && typeof place === 'object') {
    const p = place as Record<string, unknown>;
    const country = p.country;
    if (country && typeof country === 'object') {
      const c = country as Record<string, unknown>;
      if (typeof c.name === 'string') return c.name;
      if (typeof c.code === 'string') return c.code;
    }
    if (typeof p.country === 'string') return p.country;
  }
  return null;
}

function readDonor(buyer: string | null): string {
  if (!buyer) return 'US-Federal';
  const b = buyer.toLowerCase();
  if (b.includes('state department') || b.includes('department of state')) return 'US-State';
  if (b.includes('dfc') || b.includes('development finance')) return 'DFC';
  if (b.includes('millennium challenge') || b.includes('mcc')) return 'MCC';
  if (b.includes('usaid')) return 'USAID-legacy';
  if (b.includes('mcc')) return 'MCC';
  return 'US-Federal';
}

function readValue(raw: RawSamGovOpportunity): {
  min: number | null;
  max: number | null;
  currency: string | null;
  rawText: string | null;
} {
  const award = raw['award'];
  if (award && typeof award === 'object') {
    const a = award as Record<string, unknown>;
    const amt = typeof a.amount === 'number' ? a.amount
      : typeof a.amount === 'string' ? Number((a.amount as string).replace(/[^0-9.]/g, '')) : null;
    if (amt && !isNaN(amt)) {
      return { min: Math.round(amt), max: Math.round(amt), currency: 'USD', rawText: String(a.amount) };
    }
  }
  return { min: null, max: null, currency: 'USD', rawText: null };
}

function classifyType(notice: string | null): string {
  if (!notice) return 'unknown';
  const n = notice.toLowerCase();
  if (n.includes('combined synopsis') || n.includes('solicitation')) return 'services';
  if (n.includes('sources sought') || n.includes('presolicitation')) return 'services';
  if (n.includes('award')) return 'unknown';
  if (n.includes('sale')) return 'goods';
  return 'unknown';
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function mmddyyyy(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const y = d.getUTCFullYear();
  return `${m}/${day}/${y}`;
}
