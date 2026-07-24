import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';
import { researchClient } from '@/app/lib/clientResearch';

export const maxDuration = 120;

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// POST /api/admin/clients/research — re-run web research for an existing client
// (e.g. after its website/domain changed) and overwrite the AI-derived profile
// fields. Does not touch owner_user_id, status, or market.
//   body: { clientId: string }
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { clientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const supabase = createServerClient();
  const { data: client, error } = await supabase.from('clients').select('id, name, website').eq('id', body.clientId).single();
  if (error || !client) return NextResponse.json({ error: 'client not found' }, { status: 404 });

  let profile = null;
  try {
    profile = await researchClient({ name: client.name, website: client.website });
  } catch (err) {
    console.error('[clients/research] failed', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!profile) return NextResponse.json({ error: 'research produced no profile' }, { status: 500 });

  const { data: updated, error: upErr } = await supabase.from('clients').update({
    name: profile.name || client.name,
    description: profile.description,
    sectors: profile.sectors,
    geographies: profile.geographies,
    size_band: profile.size_band,
    capabilities: profile.capabilities,
    past_wins: profile.past_wins,
    certifications: profile.certifications,
    ceo_name: profile.ceo_name,
    ceo_background: profile.ceo_background,
    ceo_linkedin: profile.ceo_linkedin,
    last_researched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', body.clientId).select('*').single();
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ client: updated });
}
