import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export const maxDuration = 30;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// GET /api/admin/tenders
// Lists tenders for the BD scanner dashboard. Filterable by:
//   - source       e.g. 'TED'
//   - sector       a slug from `sectors`
//   - passes_only  if 'true', only rows where passes_filter = true
//   - limit        defaults to 100, max 500
// ============================================================================
export async function GET(req: NextRequest) {
  const adminEmail = req.nextUrl.searchParams.get('adminEmail');
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const source = req.nextUrl.searchParams.get('source');
  const sector = req.nextUrl.searchParams.get('sector');
  const passesOnly = req.nextUrl.searchParams.get('passes_only') === 'true';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '100', 10) || 100, 500);

  const supabase = createServerClient();
  let query = supabase
    .from('tenders')
    .select('id, source, source_ref, url, title, donor, buyer, country, sectors, type, value_usd_min, value_usd_max, currency, published_at, deadline_at, passes_filter, filter_reasons, created_at, translations, source_language')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (source) query = query.eq('source', source);
  if (sector) query = query.contains('sectors', [sector]);
  if (passesOnly) query = query.eq('passes_filter', true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also return aggregate counts so the dashboard can show stats.
  const { count: totalCount } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true });
  const { count: passingCount } = await supabase
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .eq('passes_filter', true);

  return NextResponse.json({
    tenders: data || [],
    totals: { all: totalCount ?? 0, passing: passingCount ?? 0 },
  });
}
