// ============================================================================
// grants.gov ingester — US federal grants (Search2 API)
// ============================================================================
// The US-domestic universe: EDA economic development, HUD community/CDBG, USDA
// rural development, Treasury CDFI, EPA, DOL workforce, etc. Tagged
// market='us_domestic' so only US-domestic clients (e.g. Forward Planning)
// match against them — never the EU/international clients.
//
// API: POST https://api.grants.gov/v1/api/search2  (public, no key)
// Detail: POST https://api.grants.gov/v1/api/fetchOpportunity { opportunityId }
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';

type Supabase = ReturnType<typeof createServerClient>;

const SEARCH_URL = 'https://api.grants.gov/v1/api/search2';

interface Opp {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  cfdaList?: string[];
}

// Development-relevant queries — economic / community / regional development,
// workforce, rural, infrastructure. Multi-query + dedup (like the SEDIA feed).
const QUERIES = [
  'economic development',
  'community development',
  'regional development',
  'workforce development',
  'rural development',
  'small business',
  'infrastructure planning',
];

async function search(keyword: string, rows: number): Promise<Opp[]> {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ rows, keyword, oppStatuses: 'posted|forecasted' }),
  });
  if (!res.ok) throw new Error(`grants.gov ${res.status}`);
  const json = (await res.json()) as { data?: { oppHits?: Opp[] } };
  return json.data?.oppHits || [];
}

function isoDate(s: string | undefined): string | null {
  // grants.gov dates are MM/DD/YYYY
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export interface GrantsGovResult {
  fetched: number;
  upserted: number;
  errors: string[];
}

export async function ingestGrantsGov(supabase: Supabase, opts?: { rowsPerQuery?: number }): Promise<GrantsGovResult> {
  const rowsPerQuery = opts?.rowsPerQuery ?? 40;
  const errors: string[] = [];
  const byId = new Map<string, Opp>();

  for (const q of QUERIES) {
    try {
      const hits = await search(q, rowsPerQuery);
      for (const h of hits) if (h.id) byId.set(h.id, h);
    } catch (err) {
      errors.push(`query "${q}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const opps = [...byId.values()];
  if (opps.length === 0) return { fetched: 0, upserted: 0, errors };

  const rows = opps.map((o) => ({
    source: 'GRANTS_GOV',
    source_ref: o.id,
    url: `https://www.grants.gov/search-results-detail/${o.id}`,
    title: o.title,
    description: `US federal grant opportunity. Agency: ${o.agency} (${o.agencyCode}). Opportunity number: ${o.number}. CFDA: ${(o.cfdaList || []).join(', ') || '—'}. Status: ${o.oppStatus}.`,
    donor: o.agency || 'US Federal',
    buyer: o.agency || null,
    country: 'United States',
    region: null,
    sectors: [] as string[],
    type: 'grant',
    market: 'us_domestic',
    value_usd_min: null,
    value_usd_max: null,
    currency: 'USD',
    published_at: isoDate(o.openDate),
    deadline_at: isoDate(o.closeDate),
    passes_filter: true,
    filter_reasons: ['grants_gov:posted', `agency:${o.agencyCode}`],
    updated_at: new Date().toISOString(),
  }));

  const { error, count } = await supabase
    .from('tenders')
    .upsert(rows, { onConflict: 'source,source_ref', count: 'exact' });
  if (error) { errors.push(`upsert: ${error.message}`); return { fetched: opps.length, upserted: 0, errors }; }

  return { fetched: opps.length, upserted: count ?? rows.length, errors };
}
