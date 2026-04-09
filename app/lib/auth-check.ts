import { createServerClient } from '@/app/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const ADMIN_EMAIL = 'leowatts25@gmail.com';

export async function checkApprovedUser(req: NextRequest): Promise<{ authorized: boolean; userId?: string; response?: NextResponse }> {
  const supabase = createServerClient();

  // Get auth token from cookie or header
  const authHeader = req.headers.get('authorization');
  const cookieHeader = req.headers.get('cookie');

  // Try to get user from Supabase auth
  let user = null;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    const { data } = await supabase.auth.getUser(token);
    user = data?.user;
  }

  if (!user && cookieHeader) {
    // For browser requests, the session cookie is sent automatically
    // We need to check the sb-access-token cookie
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => {
        const [key, ...val] = c.trim().split('=');
        return [key, val.join('=')];
      })
    );

    // Look for Supabase auth token in cookies
    const accessToken = cookies['sb-access-token'] ||
      Object.entries(cookies).find(([k]) => k.includes('auth-token'))?.[1];

    if (accessToken) {
      const { data } = await supabase.auth.getUser(accessToken);
      user = data?.user;
    }
  }

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Authentication required. Please sign in.' }, { status: 401 }),
    };
  }

  // Check approval status
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('status')
    .eq('id', user.id)
    .single();

  // Admin is always approved
  if (user.email === ADMIN_EMAIL) {
    return { authorized: true, userId: user.id };
  }

  if (!profile || profile.status !== 'approved') {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Account pending approval. Contact admin.' }, { status: 403 }),
    };
  }

  return { authorized: true, userId: user.id };
}
