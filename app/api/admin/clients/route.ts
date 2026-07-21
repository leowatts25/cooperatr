import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { researchClient } from '@/app/lib/clientResearch';

export const maxDuration = 120; // POST runs web research

const ADMIN_EMAIL = 'leowatts25@gmail.com';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'client';
}

// ============================================================================
// GET  /api/admin/clients            — list clients (+ match aggregates)
// GET  /api/admin/clients?clientId=X — one client + its ranked tender matches
// POST /api/admin/clients            — create a client (auto-research the profile)
// PATCH /api/admin/clients           — edit a client profile
// ============================================================================

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const supabase = createServerClient();
  const clientId = req.nextUrl.searchParams.get('clientId');

  // Single client + ranked matches.
  if (clientId) {
    const { data: client, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    const { data: matches } = await supabase
      .from('client_tender_matches')
      .select(`id, score, rationale, fit_dimensions, partner_stack, risks, status, matched_at,
               tender:tenders ( id, source, source_ref, url, title, donor, buyer, country, sectors,
                                value_usd_min, value_usd_max, deadline_at, tender_fit_score, tender_fit_verdict )`)
      .eq('client_id', clientId)
      .order('score', { ascending: false, nullsFirst: false });
    return NextResponse.json({ client, matches: matches || [] });
  }

  // List.
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, slug, website, sectors, geographies, size_band, ceo_name, status, last_researched_at')
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (clients || []).map((c) => c.id);
  const agg: Record<string, { count: number; top: number }> = {};
  if (ids.length) {
    const { data: ms } = await supabase.from('client_tender_matches').select('client_id, score').in('client_id', ids);
    for (const m of (ms || []) as Array<{ client_id: string; score: number | null }>) {
      const a = (agg[m.client_id] ||= { count: 0, top: 0 });
      a.count += 1; a.top = Math.max(a.top, Math.round(m.score ?? 0));
    }
  }
  const enriched = (clients || []).map((c) => ({ ...c, match_count: agg[c.id]?.count ?? 0, top_score: agg[c.id]?.top ?? 0 }));
  return NextResponse.json({ clients: enriched });
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { name?: string; website?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name || !body.name.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const supabase = createServerClient();
  let profile = null;
  try {
    profile = await researchClient({ name: body.name.trim(), website: body.website?.trim() || null });
  } catch (err) {
    console.error('[clients POST] research failed', err);
  }

  const base = slugify(body.name);
  const insert = {
    name: (profile?.name || body.name).trim(),
    slug: `${base}-${Math.abs(hash(base + Date.now())).toString(36).slice(0, 4)}`,
    website: body.website?.trim() || null,
    description: profile?.description ?? null,
    sectors: profile?.sectors ?? [],
    geographies: profile?.geographies ?? [],
    size_band: profile?.size_band ?? null,
    capabilities: profile?.capabilities ?? null,
    past_wins: profile?.past_wins ?? [],
    certifications: profile?.certifications ?? [],
    ceo_name: profile?.ceo_name ?? null,
    ceo_background: profile?.ceo_background ?? null,
    ceo_linkedin: profile?.ceo_linkedin ?? null,
    research_provenance: profile ? 'AI web research' : null,
    last_researched_at: profile ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase.from('clients').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data, researched: !!profile });
}

export async function PATCH(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: Record<string, unknown> & { id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const allowed = ['name', 'website', 'description', 'sectors', 'geographies', 'size_band', 'capabilities', 'past_wins', 'certifications', 'ceo_name', 'ceo_background', 'ceo_linkedin', 'status', 'market'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const supabase = createServerClient();
  const { data, error } = await supabase.from('clients').update(updates).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return h;
}
