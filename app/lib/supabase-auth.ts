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

export async function signOut() {
  const supabase = createAuthClient();
  await supabase.auth.signOut();
  window.location.href = '/';
}
