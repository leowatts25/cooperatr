// ============================================================================
// Shared ingest runner — used by both the daily cron and the admin "Run now"
// button. Centralizes source orchestration so each source is registered in
// exactly one place.
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';
import { fetchTedNotices, normalizeTedNotice } from './ted';
import { fetchSamGovOpportunities, normalizeSamGovOpportunity } from './samgov';
import type { SectorRow } from './filter';

export interface SourceResult {
  source: string;
  fetched: number;
  normalized: number;
  upserted: number;
  passedFilter: number;
  errors: string[];
  skipped?: boolean;     // true when a source is intentionally skipped (e.g. no API key)
  skipReason?: string;
}

export interface IngestRunResult {
  ok: boolean;
  timestamp: string;
  totals: { fetched: number; normalized: number; upserted: number; passedFilter: number };
  sources: SourceResult[];
}

type Supabase = ReturnType<typeof createServerClient>;

export async function runAllIngesters(supabase: Supabase): Promise<IngestRunResult> {
  const { data: sectorsData, error: sectorsErr } = await supabase
    .from('sectors')
    .select('slug, label, keywords, active')
    .eq('active', true);

  if (sectorsErr) {
    throw new Error(`failed to load sectors: ${sectorsErr.message}`);
  }
  const sectors = (sectorsData || []) as SectorRow[];

  const results: SourceResult[] = [];

  try {
    results.push(await ingestTed(sectors, supabase));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ingest] TED failed:', msg);
    results.push({ source: 'TED', fetched: 0, normalized: 0, upserted: 0, passedFilter: 0, errors: [msg] });
  }

  // SAM.gov requires SAMGOV_API_KEY. If absent we record a 'skipped' result
  // rather than failing the whole run.
  const samKey = process.env.SAMGOV_API_KEY;
  if (samKey) {
    try {
      results.push(await ingestSamGov(sectors, supabase, samKey));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] SAM.gov failed:', msg);
      results.push({ source: 'SAM_GOV', fetched: 0, normalized: 0, upserted: 0, passedFilter: 0, errors: [msg] });
    }
  } else {
    results.push({
      source: 'SAM_GOV', fetched: 0, normalized: 0, upserted: 0, passedFilter: 0, errors: [],
      skipped: true, skipReason: 'SAMGOV_API_KEY not set',
    });
  }

  // ----------------------------------------------------------------------
  // Future sources — implementation notes
  // ----------------------------------------------------------------------
  // UNGM (UN Global Marketplace): no public API. Two paths:
  //   (a) Subscribe via UNGM Subscribe feature → daily CSV/email export →
  //       manual upload to a `/api/admin/tenders/csv-import` endpoint.
  //   (b) Scrape POST /Public/Notice/SearchNotice with anti-forgery cookie.
  //       Fragile and against the spirit of ToS. Skip unless we get
  //       explicit permission or partnership.
  //
  // CORDIS (EU R&D project results): the canonical source for "who won
  // similar EU funding before." Used for SME discovery, not tenders.
  //   - Endpoint: https://cordis.europa.eu/api/projects?...
  //   - Will be queried per-tender in the SME discovery step, not in this
  //     daily ingest job.
  //
  // EU Funding & Tenders portal (NDICI-Global Europe calls): there is an
  // internal JSON API at https://ec.europa.eu/info/funding-tenders/...api/
  // but the endpoint shape shifts. Likely needs the same probe-and-stabilize
  // approach we did for TED.
  //
  // AECID / GIZ / KfW / AFD / FCDO: each has its own portal, mostly without
  // public APIs. Build per-source HTML scrapers on demand, only when the
  // user has a real BD use case for that donor.
  // ----------------------------------------------------------------------

  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      normalized: acc.normalized + r.normalized,
      upserted: acc.upserted + r.upserted,
      passedFilter: acc.passedFilter + r.passedFilter,
    }),
    { fetched: 0, normalized: 0, upserted: 0, passedFilter: 0 },
  );

  return {
    // ok means every non-skipped source completed without errors
    ok: results.every((r) => r.skipped || r.errors.length === 0),
    timestamp: new Date().toISOString(),
    totals,
    sources: results,
  };
}

// ----------------------------------------------------------------------------
// TED
// ----------------------------------------------------------------------------

async function ingestTed(sectors: SectorRow[], supabase: Supabase): Promise<SourceResult> {
  const errors: string[] = [];
  let fetched = 0;
  let normalized = 0;
  let upserted = 0;
  let passedFilter = 0;

  const PAGES = 3;
  const PAGE_SIZE = 100;
  const SINCE_DAYS = 2; // 1-day overlap to catch late publishes

  for (let page = 1; page <= PAGES; page++) {
    let pageResult;
    try {
      pageResult = await fetchTedNotices({ sinceDays: SINCE_DAYS, pageSize: PAGE_SIZE, pageNum: page });
    } catch (err) {
      errors.push(`page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    fetched += pageResult.notices.length;
    if (pageResult.notices.length === 0) break;

    const batch = [];
    for (const raw of pageResult.notices) {
      try {
        const n = normalizeTedNotice(raw, sectors);
        if (n) batch.push(n);
      } catch (err) {
        errors.push(`normalize: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    normalized += batch.length;
    passedFilter += batch.filter((n) => n.passes_filter).length;

    if (batch.length > 0) {
      const { error: upsertErr, count } = await supabase
        .from('tenders')
        .upsert(batch, { onConflict: 'source,source_ref', count: 'exact' });
      if (upsertErr) {
        errors.push(`upsert page ${page}: ${upsertErr.message}`);
      } else {
        upserted += count ?? batch.length;
      }
    }
    if (pageResult.notices.length < PAGE_SIZE) break;
  }

  return { source: 'TED', fetched, normalized, upserted, passedFilter, errors };
}

// ----------------------------------------------------------------------------
// SAM.gov
// ----------------------------------------------------------------------------

async function ingestSamGov(sectors: SectorRow[], supabase: Supabase, apiKey: string): Promise<SourceResult> {
  const errors: string[] = [];
  let fetched = 0;
  let normalized = 0;
  let upserted = 0;
  let passedFilter = 0;

  const PAGES = 3;
  const LIMIT = 100;
  const SINCE_DAYS = 2;

  for (let page = 0; page < PAGES; page++) {
    let pageResult;
    try {
      pageResult = await fetchSamGovOpportunities({
        sinceDays: SINCE_DAYS,
        limit: LIMIT,
        offset: page * LIMIT,
        apiKey,
      });
    } catch (err) {
      errors.push(`page ${page}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    fetched += pageResult.opportunities.length;
    if (pageResult.opportunities.length === 0) break;

    const batch = [];
    for (const raw of pageResult.opportunities) {
      try {
        const n = normalizeSamGovOpportunity(raw, sectors);
        if (n) batch.push(n);
      } catch (err) {
        errors.push(`normalize: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    normalized += batch.length;
    passedFilter += batch.filter((n) => n.passes_filter).length;

    if (batch.length > 0) {
      const { error: upsertErr, count } = await supabase
        .from('tenders')
        .upsert(batch, { onConflict: 'source,source_ref', count: 'exact' });
      if (upsertErr) {
        errors.push(`upsert page ${page}: ${upsertErr.message}`);
      } else {
        upserted += count ?? batch.length;
      }
    }

    if (pageResult.opportunities.length < LIMIT) break;
  }

  return { source: 'SAM_GOV', fetched, normalized, upserted, passedFilter, errors };
}
