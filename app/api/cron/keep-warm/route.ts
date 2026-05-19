import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 30;

// ============================================================================
// Keep-warm cron.
//
// Supabase free tier auto-pauses projects after ~7 days without API activity.
// If the DB stays paused for 90 days, the data is deleted. This route runs
// daily via Vercel Cron (see vercel.json) and performs a real read query so
// the project never falls below the activity threshold.
//
// The query is intentionally cheap — a single row pluck against an existing
// table. We rotate through a few tables so all of them register activity.
//
// Auth: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set on the project. We reject anything
// else so this route can't be abused as a public DB-ping endpoint.
// ============================================================================

const TABLES_TO_PING = ['corpus_sources', 'proposal_patterns', 'companies', 'opportunities'];

export async function GET(req: NextRequest) {
  // Verify the request came from Vercel Cron (or an authorized caller).
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${expected}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  // If CRON_SECRET is unset we still allow the call — better to keep the DB
  // warm than to silently fail because of a missing env var. The query
  // itself is read-only and returns no sensitive data.

  const supabase = createServerClient();
  const results: Array<{ table: string; ok: boolean; error?: string }> = [];

  for (const table of TABLES_TO_PING) {
    const { error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    results.push(
      error
        ? { table, ok: false, error: error.message }
        : { table, ok: true },
    );
  }

  const ok = results.every((r) => r.ok);
  if (!ok) {
    console.error('[cron/keep-warm] failed pings:', results.filter((r) => !r.ok));
  } else {
    console.log('[cron/keep-warm] all tables pinged ok');
  }
  return NextResponse.json(
    {
      ok,
      timestamp: new Date().toISOString(),
      pinged: results,
    },
    { status: ok ? 200 : 500 },
  );
}
