import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { runAllIngesters } from '@/app/lib/ingesters/run';
import { matchSpecificTenders } from '@/app/lib/matcher';
import { runDiscoveryForRecentTenders } from '@/app/lib/discovery';
import { runTranslationForRecentTenders } from '@/app/lib/translation';

export const maxDuration = 300; // ingest + discovery + match — allow 5 min

// ============================================================================
// Daily tender pipeline: ingest → discovery → match.
//
// One cron because Vercel Hobby caps us at 2 cron jobs total (keep-warm +
// this).
//
// Phases:
//   1. Ingest    — pull fresh tenders from donor feeds (TED, future: SAM.gov,
//                  UNGM, AECID, EU F&T portal). Normalize, cheap filter,
//                  upsert into `tenders`.
//
//   2. Discovery — for each recent passing tender that hasn't been scouted
//                  yet, ask Claude to identify 5-10 real bidding-capable SMEs
//                  for it (EU/Spanish/US firms with sector + geographic +
//                  donor-eligibility fit). Insert them into scouted_companies
//                  with discovered_via='claude_discovery'. Capped at 50
//                  tenders/run for cost + wall-clock safety. Tenders accumulate
//                  candidates across runs.
//
//   3. Match     — score (tender × scouted_company) pairs for every passing
//                  tender from the past 7 days. Discovery candidates AND
//                  LinkedIn-promoted companies both compete; warm-intro is a
//                  bonus signal (not a gate). Single Sonnet call per pair
//                  with prompt caching on the system block. Idempotent upsert
//                  on (tender_id, scouted_company_id).
//
// Auth: `Authorization: Bearer <CRON_SECRET>` (same pattern as keep-warm).
// Triggered by Vercel Cron (see vercel.json).
// ============================================================================

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  try {
    // Phase 1 — ingest
    const ingest = await runAllIngesters(supabase);
    console.log('[cron/ingest-tenders] ingest complete', ingest.totals);

    // Phase 1.5 — translation (free, MyMemory; English-only for now). Runs
    // before discovery+match so subsequent phases see English text and the
    // dashboard renders in English from the moment matches land.
    const translation = await runTranslationForRecentTenders(supabase, {
      sinceDays: 14,
      maxTenders: 25,  // Keeps total cron under 300s. Prioritises tenders that
                       // already have matches so visible BD rows go English first.
    });
    console.log(
      `[cron/ingest-tenders] translation — translated=${translation.translated} skipped_done=${translation.skippedAlreadyComplete} skipped_nosrc=${translation.skippedNoSource} chars=${translation.charsUsed} langs=${translation.languagesProcessed.join(',')} errors=${translation.errors.length}`,
    );

    // Phase 2 — discovery (scouts the open market for real SME bidders per
    // tender). Cap per-run to stay under the 300s function limit. Returns
    // the specific tender IDs it processed so phase 3 can match THOSE same
    // tenders (not a different random set).
    const discovery = await runDiscoveryForRecentTenders(supabase, {
      sinceDays: 7,
      maxTenders: 15,
    });
    console.log(
      `[cron/ingest-tenders] discovery complete — tenders=${discovery.tenders_processed} candidates=${discovery.candidates_total} inserted=${discovery.inserted_total} matched=${discovery.matched_total} cost=$${discovery.est_cost_usd}`,
    );

    // Phase 3 — match the SAME tenders discovery just covered. Discovered
    // candidates only exist for those specific tenders, so scoring others is
    // a waste (they'd fall back to LinkedIn warm-intros and produce noise).
    // Parallelizes at concurrency=5 with each tender's 5 candidates sequential
    // (so the cached system+tender block benefits subsequent candidates).
    const match = await matchSpecificTenders(supabase, discovery.tender_ids, {
      candidateLimit: 5,
      concurrency: 5,
    });
    console.log(
      `[cron/ingest-tenders] match complete — considered=${match.tendersConsidered} with_candidates=${match.tendersWithCandidates} written=${match.matchesWritten} errors=${match.errors.length}`,
    );

    const ok = ingest.ok && discovery.ok && match.ok;
    return NextResponse.json(
      { ingest, translation, discovery, match },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/ingest-tenders] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
