'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, getUserProfile } from '@/app/lib/supabase-auth';

interface AuthGuardProps {
  children: React.ReactNode;
  requireApproval?: boolean;
  /**
   * Optional marketing fallback for logged-out visitors. When provided, an
   * unauthenticated user sees this content (a feature marketing preview with a
   * sign-up CTA) instead of being redirected to /auth. Logged-in users still
   * get `children`; pending/rejected users still redirect as before.
   */
  marketing?: React.ReactNode;
}

export default function AuthGuard({ children, requireApproval = false, marketing }: AuthGuardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'pending'>('loading');

  useEffect(() => {
    async function checkAuth() {
      const user = await getCurrentUser();

      if (!user) {
        setStatus('unauthenticated');
        // With a marketing fallback we keep the visitor on the page and show
        // the preview; without one we bounce to the sign-in screen.
        if (!marketing) router.push('/auth');
        return;
      }

      if (!requireApproval) {
        setStatus('authenticated');
        return;
      }

      const profile = await getUserProfile(user.id);

      if (!profile || profile.status === 'pending') {
        setStatus('pending');
        router.push('/auth/pending');
        return;
      }

      if (profile.status === 'rejected') {
        setStatus('unauthenticated');
        router.push('/auth');
        return;
      }

      setStatus('authenticated');
    }

    checkAuth();
  }, [router, requireApproval]);

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated' && marketing) return <>{marketing}</>;

  if (status !== 'authenticated') return null;

  return <>{children}</>;
}
