import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// GET /api/admin/funding-sources  — list the funding-source registry
//   ?status=active|paused|closed|all  (default active)
//   ?type=...                         (optional filter)
// PATCH /api/admin/funding-sources   — update a source { id, status?, last_reviewed_at? }
// ============================================================================
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const status = req.nextUrl.searchParams.get('status') || 'active';
  const type = req.nextUrl.searchParams.get('type');

  const supabase = createServerClient();
  let q = supabase
    .from('funding_sources')
    .select('id, name, type, funder, themes, geographies, instrument, access_mode, status, cadence, eligibility_notes, url, source_provenance, last_reviewed_at, created_at')
    .order('name', { ascending: true })
    .limit(500);
  if (status && status !== 'all') q = q.eq('status', status);
  if (type) q = q.eq('type', type);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byStatus: Record<string, number> = {};
  const { data: counts } = await supabase.from('funding_sources').select('status');
  for (const r of (counts || []) as Array<{ status: string }>) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  return NextResponse.json({ sources: data || [], totals: { byStatus, returned: data?.length || 0 } });
}

export async function PATCH(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { id?: string; status?: string; markReviewed?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!['active', 'paused', 'closed'].includes(body.status)) {
      return NextResponse.json({ error: `invalid status: ${body.status}` }, { status: 400 });
    }
    updates.status = body.status;
  }
  if (body.markReviewed) updates.last_reviewed_at = new Date().toISOString();

  const supabase = createServerClient();
  const { data, error } = await supabase.from('funding_sources').update(updates).eq('id', body.id).select('id, status, last_reviewed_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: data });
}
