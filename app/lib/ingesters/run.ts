// ============================================================================
// Shared ingest runner — used by both the daily cron and the admin "Run now"
// button. Centralizes source orchestration so each source is registered in
// exactly one place.
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';
import { fetchTedNotices, normalizeTedNotice } from './ted';
import { fetchSamGovOpportunities, normalizeSamGovOpportunity } from './samgov';
import { fetchEftNotices, normalizeEftNotice } from './eftportal';
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

  // EU Funding & Tenders Portal (NDICI/Global Gateway/IPA/NEAR procurement and grant calls).
  // No API key required — uses the public SEDIA apiKey. Can be disabled by setting
  // EU_FT_PORTAL_ENABLED=false in the environment.
  const eftEnabled = process.env.EU_FT_PORTAL_ENABLED !== 'false';
  if (eftEnabled) {
    try {
      results.push(await ingestEftPortal(sectors, supabase));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[ingest] EU F&T Portal failed:', msg);
      results.push({ source: 'EU_FT', fetched: 0, normalized: 0, upserted: 0, passedFilter: 0, errors: [msg] });
    }
  } else {
    results.push({
      source: 'EU_FT', fetched: 0, normalized: 0, upserted: 0, passedFilter: 0, errors: [],
      skipped: true, skipReason: 'EU_FT_PORTAL_ENABLED=false',
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
  // EU Funding & Tenders portal (NDICI-Global Europe calls): IMPLEMENTED.
  // Uses the public SEDIA search API (apiKey=SEDIA, no registration needed).
  // See app/lib/ingesters/eftportal.ts for implementation details.
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

// ----------------------------------------------------------------------------
// EU Funding & Tenders Portal (NDICI / Global Gateway / IPA / NEAR)
// ----------------------------------------------------------------------------
// The SEDIA API returns results sorted by startDate DESC. We run two separate
// searches — one for INTPA/DEVCO procurement, one for NEAR/IPA — to maximise
// recall while keeping page counts bounded. Results are deduplicated by
// source_ref (callIdentifier) before upsert.
// ----------------------------------------------------------------------------

async function ingestEftPortal(sectors: SectorRow[], supabase: Supabase): Promise<SourceResult> {
  const errors: string[] = [];
  let fetched = 0;
  let normalized = 0;
  let upserted = 0;
  let passedFilter = 0;

  const PAGES = 3;
  const PAGE_SIZE = 50;
  const SINCE_DAYS = 7; // Larger window: dev-finance calls open for weeks, not days

  // Plain-text topical queries, NOT callIdentifier-prefix queries. The prefix
  // form ('EC-INTPA OR EC-DEVCO …') matches SEDIA's entire historical corpus
  // for those offices — thousands of CLOSED tenders — and sorting by startDate
  // buries the few OPEN/FORTHCOMING calls far beyond the pages we fetch, so the
  // biddable filter returned 0 every run (EU_FT was empty all-time). Topical
  // text queries rank live, relevant dev-finance calls near the top: each of
  // these surfaces ~20-25 OPEN/FORTHCOMING biddable notices in the first 3 pages.
  const searchQueries = [
    'INTPA development cooperation',
    'NEAR IPA neighbourhood',
    'humanitarian assistance',
  ];

  // Track refs we've already processed to deduplicate across queries
  const seenRefs = new Set<string>();

  for (const searchText of searchQueries) {
    for (let page = 1; page <= PAGES; page++) {
      let pageResult;
      try {
        pageResult = await fetchEftNotices({ sinceDays: SINCE_DAYS, pageSize: PAGE_SIZE, pageNum: page, searchText });
      } catch (err) {
        errors.push(`query "${searchText.slice(0, 30)}…" page ${page}: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }

      fetched += pageResult.notices.length;
      // Break only when the API itself has no more results. Do NOT break just
      // because this page's *filtered* (biddable) count is low — open/forthcoming
      // tenders are sparsely scattered among mostly-closed results, so they
      // often sit on later pages. (This was the bug that made EU_FT return 0.)
      if (pageResult.rawCount === 0) break;

      const batch = [];
      for (const raw of pageResult.notices) {
        // Skip already-seen refs from the other query
        if (seenRefs.has(raw.reference)) continue;
        seenRefs.add(raw.reference);

        try {
          const n = normalizeEftNotice(raw, sectors);
          if (n) {
            // Also skip duplicate source_refs (callIdentifiers) — SEDIA indexes
            // the same CFT once per language; we only need one record.
            if (seenRefs.has(`ref:${n.source_ref}`)) continue;
            seenRefs.add(`ref:${n.source_ref}`);
            batch.push(n);
          }
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

      // Last page reached when the API returns fewer RAW results than a full page.
      if (pageResult.rawCount < PAGE_SIZE) break;
    }
  }

  return { source: 'EU_FT', fetched, normalized, upserted, passedFilter, errors };
}
