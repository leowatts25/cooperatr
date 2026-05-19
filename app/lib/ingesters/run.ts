// ============================================================================
// Shared ingest runner — used by both the daily cron and the admin "Run now"
// button. Centralizes source orchestration so each source is registered in
// exactly one place.
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';
import { fetchTedNotices, normalizeTedNotice } from './ted';
import type { SectorRow } from './filter';

export interface SourceResult {
  source: string;
  fetched: number;
  normalized: number;
  upserted: number;
  passedFilter: number;
  errors: string[];
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

  // Future sources go here: ingestUngm, ingestSamGov, ingestDevbusiness, ...

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
    ok: results.every((r) => r.errors.length === 0),
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
