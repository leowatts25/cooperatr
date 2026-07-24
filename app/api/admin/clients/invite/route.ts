import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/app/lib/supabase';

const ADMIN_EMAIL = 'leowatts25@gmail.com';

// ============================================================================
// POST /api/admin/clients/invite  — give a client's CEO a login.
// Creates (or reuses) a Supabase auth user, marks the profile approved, and
// links it to the client via clients.owner_user_id. Returns credentials for the
// admin to share. The client can then sign in and see ONLY their own portal.
//   body: { clientId: string, email: string }
// ============================================================================
export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('adminEmail') !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  let body: { clientId?: string; email?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = (body.email || '').trim().toLowerCase();
  if (!body.clientId || !email) return NextResponse.json({ error: 'clientId and email required' }, { status: 400 });

  const supabase = createServerClient();
  const tempPassword = randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) + 'A1';
  let userId: string | null = null;
  let created = false;

  // Create the auth user (email pre-confirmed). If they already exist, reuse.
  const { data, error } = await supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      const { data: prof } = await supabase.from('user_profiles').select('id').eq('email', email).maybeSingle();
      userId = prof?.id ?? null;
      if (!userId) return NextResponse.json({ error: 'That email already has an account but I could not resolve its id. Link it manually.' }, { status: 409 });
    } else {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  } else {
    userId = data.user?.id ?? null;
    created = true;
  }
  if (!userId) return NextResponse.json({ error: 'Failed to resolve user' }, { status: 500 });

  // Approved profile.
  await supabase.from('user_profiles').upsert({
    id: userId, email, status: 'approved', approved_at: new Date().toISOString(), approved_by: ADMIN_EMAIL,
  }, { onConflict: 'id' });

  // Link to the client (owner). One owner per client for now.
  const { error: linkErr } = await supabase.from('clients').update({ owner_user_id: userId }).eq('id', body.clientId);
  if (linkErr) return NextResponse.json({ error: `link failed: ${linkErr.message}` }, { status: 500 });

  return NextResponse.json({
    ok: true,
    email,
    // Only returned when we just created the account; existing accounts keep their password.
    tempPassword: created ? tempPassword : null,
    reused: !created,
    loginUrl: '/portal',
  });
}
