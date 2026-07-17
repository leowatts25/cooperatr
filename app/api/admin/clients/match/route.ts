import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { matchClientAgainstTenders } from '@/app/lib/clientMatching';

export const maxDuration = 300; // scores the client against the tender pool

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// POST /api/admin/clients/match  — run (client × tender) matching for one client.
//   body: { clientId: string }
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { clientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const supabase = createServerClient();
  try {
    const res = await matchClientAgainstTenders(supabase, body.clientId);
    return NextResponse.json(res);
  } catch (err) {
    console.error('[clients/match] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
