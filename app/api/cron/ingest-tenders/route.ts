import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { runAllIngesters } from '@/app/lib/ingesters/run';

export const maxDuration = 300; // ingest can be slow; allow 5 min

// ============================================================================
// Daily tender-ingest cron.
//
// Pulls fresh tenders from official donor feeds, normalizes them, runs a
// cheap filter (sector keywords + value range), and upserts into the
// `tenders` table. The matcher/scorer runs separately (weekly).
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
    const result = await runAllIngesters(supabase);
    console.log('[cron/ingest-tenders] complete', result.totals);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/ingest-tenders] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
