import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { checkApprovedUser } from '@/app/lib/auth-check';

// ============================================================================
// GET /api/portal — the authenticated caller's OWN client portal.
// Real per-user auth (not the admin query-param): resolves the signed-in user
// and returns ONLY the client they own (clients.owner_user_id = their id) plus
// its ranked tender matches. A client can never see another client's data.
// ============================================================================
export async function GET(req: NextRequest) {
  const auth = await checkApprovedUser(req);
  if (!auth.authorized || !auth.userId) return auth.response!;

  const supabase = createServerClient();

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, name, website, description, sectors, geographies, size_band, capabilities, past_wins, certifications, ceo_name, ceo_background, market')
    .eq('owner_user_id', auth.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!client) return NextResponse.json({ client: null, matches: [] });

  const { data: matches } = await supabase
    .from('client_tender_matches')
    .select(`id, score, rationale, fit_dimensions, partner_stack, risks, status,
             tender:tenders ( id, source, url, title, donor, country, sectors,
                              value_usd_min, value_usd_max, deadline_at )`)
    .eq('client_id', client.id)
    .order('score', { ascending: false, nullsFirst: false });

  return NextResponse.json({ client, matches: matches || [] });
}
