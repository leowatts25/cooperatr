import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export function createAuthClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export const ADMIN_EMAIL = 'leowatts25@gmail.com';

export async function getCurrentUser() {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getUserProfile(userId: string) {
  const supabase = createAuthClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return data;
}

export async function signInWithMagicLink(email: string) {
  const supabase = createAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  return { error };
}

export async function signUpWithPassword(email: string, password: string) {
  // Server-side signup: bypasses Supabase email confirmation + rate limits
  const res = await fetch('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const body = await res.json();

  if (!res.ok) {
    return { data: null, error: { message: body.error || 'Signup failed' } };
  }

  // After successful signup, sign in immediately to establish a client session
  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { data, error };
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const supabase = createAuthClient();
  await supabase.auth.signOut();
  window.location.href = '/';
}
