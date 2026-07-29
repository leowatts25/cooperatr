import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { sourceProspectsForTender, importScoutedCompanies } from '@/app/lib/prospectDiscovery';

export const maxDuration = 300;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/prospects/source — fill the top of the outreach funnel.
//   body: { mode: 'tender', tenderId?: string, geoFocus?: string, count?: number }
//     Web-searches for real companies that fit a live tender. When tenderId is
//     omitted, uses the highest-fit live tender in the given market.
//   body: { mode: 'scouted', limit?: number }
//     Imports Discovery v2's scouted_companies pool into prospects (dedup'd).
// ============================================================================
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { mode?: string; tenderId?: string; geoFocus?: string; count?: number; market?: string; limit?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createServerClient();
  try {
    if (body.mode === 'scouted') {
      const result = await importScoutedCompanies(supabase, { limit: body.limit });
      return NextResponse.json(result);
    }
    // mode 'tender'
    let tenderId = body.tenderId;
    if (!tenderId) {
      const market = body.market === 'us_domestic' ? 'us_domestic' : 'intl_dev';
      let q = supabase.from('tenders').select('id').eq('passes_filter', true).eq('market', market);
      if (market === 'intl_dev') q = q.neq('tender_fit_verdict', 'skip');
      const { data: top } = await q.order('tender_fit_score', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
      if (!top?.id) return NextResponse.json({ error: `no live tenders in market '${market}'` }, { status: 404 });
      tenderId = top.id as string;
    }
    if (!tenderId) return NextResponse.json({ error: 'tenderId unresolved' }, { status: 400 });
    const result = await sourceProspectsForTender(supabase, { tenderId, geoFocus: body.geoFocus || null, count: body.count });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[prospects/source]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
