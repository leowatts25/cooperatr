import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { runAllIngesters } from '@/app/lib/ingesters/run';

export const maxDuration = 300;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/tenders/trigger
// Admin-only "Run now" button — same code path as the daily cron, but
// invoked manually from /admin/tenders.
// ============================================================================
export async function POST(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const supabase = createServerClient();
  try {
    const result = await runAllIngesters(supabase);
    console.log('[admin/tenders/trigger] complete', result.totals);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/tenders/trigger] failed:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
