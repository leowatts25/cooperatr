import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const supabase = createServerClient();

    // Create user with email pre-confirmed — bypasses email verification and rate limits
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      // Surface friendlier message for duplicate accounts
      const msg = error.message.toLowerCase().includes('already')
        ? 'An account with this email already exists. Please sign in instead.'
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create approved user profile (service role bypasses RLS)
    const { error: profileError } = await supabase.from('user_profiles').insert({
      id: data.user.id,
      email: data.user.email || email,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: 'auto',
    });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Don't fail the signup — profile can be created on first sign-in if needed
    }

    return NextResponse.json({ success: true, userId: data.user.id });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
