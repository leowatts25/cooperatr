import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/app/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createServerClient();

    // Exchange code for session — using the REST API approach
    // The magic link callback includes token_hash and type params
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'magiclink' | 'email';

    if (tokenHash && type) {
      const { data: { user }, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type || 'magiclink',
      });

      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(new URL('/auth?error=auth_failed', req.url));
      }

      if (user) {
        // Check if user_profile exists, create if not
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id, status')
          .eq('id', user.id)
          .single();

        if (!profile) {
          // Create new profile (trigger will auto-approve admin)
          await supabase.from('user_profiles').insert({
            id: user.id,
            email: user.email || '',
          });

          // Check if admin (auto-approved)
          const { data: newProfile } = await supabase
            .from('user_profiles')
            .select('status')
            .eq('id', user.id)
            .single();

          if (newProfile?.status === 'approved') {
            return NextResponse.redirect(new URL('/dashboard', req.url));
          }
          return NextResponse.redirect(new URL('/auth/pending', req.url));
        }

        if (profile.status === 'approved') {
          return NextResponse.redirect(new URL('/dashboard', req.url));
        }
        return NextResponse.redirect(new URL('/auth/pending', req.url));
      }
    }
  }

  // Fallback — redirect to auth page
  return NextResponse.redirect(new URL('/auth', req.url));
}
