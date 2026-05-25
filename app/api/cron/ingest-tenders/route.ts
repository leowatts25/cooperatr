import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { runAllIngesters } from '@/app/lib/ingesters/run';
import { matchRecentTenders } from '@/app/lib/matcher';

export const maxDuration = 300; // ingest + match can be slow; allow 5 min

// ============================================================================
// Daily tender-ingest + match cron.
//
// Two phases in one cron because Vercel Hobby caps us at 2 cron jobs total
// (keep-warm + this). Phases:
//   1. Ingest — pull fresh tenders from donor feeds, normalize, cheap filter,
//      upsert into `tenders`.
//   2. Match  — score every tender from the past 7 days with passes_filter=true
//      against scouted_companies (warm-intro first, then sector + geo),
//      writing into `tender_matches`. Single Sonnet 4.6 call per (tender ×
//      company) pair with prompt caching on the system block.
//
// Sources (v1): TED only.
// Sources (planned): UNGM, SAM.gov, devbusiness.un.org, AECID, GIZ, AFD, FCDO.
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

    // Phase 2 — match. We score every passing tender from the past 7 days, so
    // late-publishing tenders that came in after their original ingest day
    // still get scored once we have candidates for them. The matcher upserts
    // on (tender_id, scouted_company_id) so re-scoring an already-scored pair
    // overwrites rather than duplicates.
    const match = await matchRecentTenders(supabase, { sinceDays: 7, candidateLimit: 5 });
    console.log(
      `[cron/ingest-tenders] match complete — considered=${match.tendersConsidered} with_candidates=${match.tendersWithCandidates} written=${match.matchesWritten} errors=${match.errors.length}`,
    );

    const ok = ingest.ok && match.ok;
    return NextResponse.json(
      { ingest, match },
      { status: ok ? 200 : 500 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/ingest-tenders] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
