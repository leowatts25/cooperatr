import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// /api/admin/prospects — outreach pipeline CRUD.
//   GET  ?adminEmail=            → list (optional &status= filter)
//   POST { name, website, ... }  → create a prospect (status=sourced)
//   PATCH { id, ...fields }      → edit fields / advance status
// Pipeline steps (research/match/draft/send) live in ./pipeline.
// ============================================================================

function unauthorized() { return NextResponse.json({ error: 'Unauthorized' }, { status: 403 }); }

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) return unauthorized();
  const supabase = createServerClient();
  const status = req.nextUrl.searchParams.get('status');
  let q = supabase
    .from('prospects')
    .select('*, hook_tender:tenders(id, title, donor, country, value_usd_max, currency, deadline_at, url)')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospects: data || [] });
}

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) return unauthorized();
  let body: { name?: string; website?: string; contact_name?: string; contact_email?: string; country?: string; market?: string; looking_for?: string; source?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from('prospects').insert({
    name: body.name.trim(),
    website: body.website?.trim() || null,
    contact_name: body.contact_name?.trim() || null,
    contact_email: body.contact_email?.trim().toLowerCase() || null,
    country: body.country?.trim() || null,
    market: body.market === 'us_domestic' ? 'us_domestic' : 'intl_dev',
    looking_for: body.looking_for?.trim() || null,
    source: body.source || 'manual',
  }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}

const PATCHABLE = ['name', 'website', 'contact_name', 'contact_email', 'country', 'market', 'looking_for', 'notes', 'status', 'draft_subject', 'draft_html'] as const;

export async function PATCH(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) return unauthorized();
  let body: { id?: string } & Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of PATCHABLE) if (k in body) patch[k] = body[k];
  // Stamp funnel timestamps on status transitions.
  if (patch.status === 'contacted') patch.emailed_at = patch.emailed_at || new Date().toISOString();
  if (patch.status === 'replied') patch.replied_at = new Date().toISOString();
  if (patch.status === 'activated') patch.activated_at = new Date().toISOString();

  const supabase = createServerClient();
  const { data, error } = await supabase.from('prospects').update(patch).eq('id', body.id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prospect: data });
}
