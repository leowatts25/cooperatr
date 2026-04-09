'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser, getUserProfile, signOut } from '@/app/lib/supabase-auth';

export default function PendingPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function check() {
      const user = await getCurrentUser();
      if (!user) { router.push('/auth'); return; }
      setEmail(user.email || '');

      const profile = await getUserProfile(user.id);
      if (profile?.status === 'approved') {
        router.push('/dashboard');
        return;
      }
      setChecking(false);
    }
    check();
  }, [router]);

  if (checking) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)' }}>Checking status...</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="font-serif" style={{ fontSize: 32, color: 'var(--accent)', display: 'block', marginBottom: 32 }}>Cooperatr</span>
        </Link>

        <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 12 }}>Account Pending Approval</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>
            Your account <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> has been registered.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
            An administrator will review and approve your access shortly.
            You will be able to use all platform features once approved.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 20px', background: 'var(--accent)', color: '#0F1623', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              Check Again
            </button>
            <button
              onClick={signOut}
              style={{ padding: '10px 20px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
