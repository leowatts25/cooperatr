'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signInWithMagicLink } from '@/app/lib/supabase-auth';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setError('');

    const { error: authError } = await signInWithMagicLink(email);

    if (authError) {
      setError(authError.message);
      setSending(false);
    } else {
      setSent(true);
      setSending(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="font-serif" style={{ fontSize: 32, color: 'var(--accent)', display: 'block', marginBottom: 32 }}>Cooperatr</span>
        </Link>

        {sent ? (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 12 }}>Check your email</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              We sent a login link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
              Click the link to sign in.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              style={{ marginTop: 24, padding: '10px 20px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 8 }}>Sign in to Cooperatr</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>Enter your email to receive a magic link</p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)', fontSize: 15, outline: 'none',
                  marginBottom: 16,
                }}
              />

              {error && (
                <p style={{ fontSize: 13, color: '#EF4444', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 16 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={sending || !email}
                style={{
                  width: '100%', padding: '12px', borderRadius: 8, border: 'none',
                  background: sending ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: sending ? 'var(--text-muted)' : '#0F1623',
                  fontSize: 15, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}
              >
                {sending ? 'Sending link...' : 'Send Magic Link'}
              </button>
            </form>

            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20, lineHeight: 1.5 }}>
              No password needed. We will email you a secure login link.
              New accounts require admin approval before accessing AI features.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
