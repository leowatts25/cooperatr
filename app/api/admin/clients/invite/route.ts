import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServerClient } from '@/app/lib/supabase';
import { sendEmail, clientInviteEmail } from '@/app/lib/email';

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

  // Create the auth user (email pre-confirmed). If they already exist, resolve
  // the existing auth user and reset its password so the admin has a shareable
  // credential (works whether they originally used a password or a magic link).
  const { data, error } = await supabase.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (error) {
    if (error.message.toLowerCase().includes('already') || error.message.toLowerCase().includes('registered')) {
      // Page through the auth users to find this email (admin API, not user_profiles).
      for (let page = 1; page <= 30 && !userId; page++) {
        const { data: list } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        const u = list?.users?.find((x) => (x.email || '').toLowerCase() === email);
        if (u) userId = u.id;
        if (!list || list.users.length < 200) break;
      }
      if (!userId) {
        const { data: prof } = await supabase.from('user_profiles').select('id').eq('email', email).maybeSingle();
        userId = prof?.id ?? null;
      }
      if (!userId) return NextResponse.json({ error: 'That email already has an account but I could not resolve its id.' }, { status: 409 });
      // Reset the password to the shareable temp one.
      await supabase.auth.admin.updateUserById(userId, { password: tempPassword, email_confirm: true });
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
  const { data: linked, error: linkErr } = await supabase.from('clients').update({ owner_user_id: userId }).eq('id', body.clientId).select('name').single();
  if (linkErr) return NextResponse.json({ error: `link failed: ${linkErr.message}` }, { status: 500 });

  // Auto-email the client their login (if Resend is configured).
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cooperatr.com';
  const loginUrl = `${siteUrl}/portal`;
  let emailed = false;
  let emailError: string | null = null;
  const mail = clientInviteEmail({ clientName: linked?.name || 'your company', loginUrl, email, password: tempPassword });
  const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html, replyTo: ADMIN_EMAIL });
  emailed = sent.ok;
  if (!sent.ok) emailError = sent.error || 'send failed';

  return NextResponse.json({
    ok: true,
    email,
    tempPassword, // always share-able (created or reset) — fallback if email isn't set up
    reused: !created,
    loginUrl: '/portal',
    emailed,
    emailError,
  });
}
