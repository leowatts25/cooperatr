'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithMagicLink, signUpWithPassword, signInWithPassword } from '@/app/lib/supabase-auth';
import { useTranslation } from '@/app/lib/i18n/context';

export default function AuthPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useTranslation();
  const [authMode, setAuthMode] = useState<'magic' | 'password'>('password');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    setError('');
    const { error: authError } = await signInWithMagicLink(email);
    if (authError) { setError(authError.message); setSending(false); }
    else { setSent(true); setSending(false); }
  }

  async function handlePasswordAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setError('');

    if (isSignUp) {
      if (password.length < 6) { setError(t('auth.passwordMinLength')); return; }
      if (password !== confirmPassword) { setError(t('auth.passwordMismatch')); return; }
      setSending(true);
      const { error: authError } = await signUpWithPassword(email, password);
      if (authError) { setError(authError.message); setSending(false); }
      else { router.push('/dashboard'); }
    } else {
      setSending(true);
      const { error: authError } = await signInWithPassword(email, password);
      if (authError) { setError(authError.message); setSending(false); }
      else { router.push('/dashboard'); }
    }
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-primary)', fontSize: 15, outline: 'none', marginBottom: 12,
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span className="font-serif" style={{ fontSize: 32, color: 'var(--accent)', display: 'block', marginBottom: 24 }}>Cooperatr</span>
        </Link>

        {/* Language toggle */}
        <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 24 }}>
          {(['en', 'es'] as const).map(lang => (
            <button key={lang} onClick={() => setLocale(lang)} style={{
              padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: locale === lang ? 'var(--accent)' : 'transparent',
              color: locale === lang ? '#0F1623' : 'var(--text-muted)',
            }}>
              {lang.toUpperCase()}
            </button>
          ))}
        </div>

        {sent ? (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 12 }}>{t('auth.checkEmail')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
              {t('auth.checkEmailDesc')} <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>.
            </p>
            <button onClick={() => { setSent(false); setEmail(''); }} style={{ marginTop: 24, padding: '10px 20px', background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
              {t('auth.differentEmail')}
            </button>
          </div>
        ) : (
          <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--text-primary)', marginBottom: 20 }}>{t('auth.title')}</h2>

            {/* Auth mode tabs */}
            <div style={{ display: 'flex', marginBottom: 24, borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {[{ key: 'password' as const, label: t('auth.tabPassword') }, { key: 'magic' as const, label: t('auth.tabMagicLink') }].map(tab => (
                <button key={tab.key} onClick={() => { setAuthMode(tab.key); setError(''); }}
                  style={{
                    flex: 1, padding: '10px', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: authMode === tab.key ? 'var(--bg-elevated)' : 'transparent',
                    color: authMode === tab.key ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >{tab.label}</button>
              ))}
            </div>

            {authMode === 'magic' ? (
              <form onSubmit={handleMagicLink}>
                <input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
                {error && <p style={{ fontSize: 13, color: '#EF4444', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 12 }}>{error}</p>}
                <button type="submit" disabled={sending || !email} style={{
                  width: '100%', padding: 12, borderRadius: 8, border: 'none',
                  background: sending ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: sending ? 'var(--text-muted)' : '#0F1623',
                  fontSize: 15, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}>
                  {sending ? t('auth.sending') : t('auth.sendMagicLink')}
                </button>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>{t('auth.noPassword')}</p>
              </form>
            ) : (
              <form onSubmit={handlePasswordAuth}>
                <input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
                <input type="password" placeholder={t('auth.password')} value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
                {isSignUp && (
                  <input type="password" placeholder={t('auth.confirmPassword')} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required style={inputStyle} />
                )}
                {error && <p style={{ fontSize: 13, color: '#EF4444', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, marginBottom: 12 }}>{error}</p>}
                <button type="submit" disabled={sending} style={{
                  width: '100%', padding: 12, borderRadius: 8, border: 'none',
                  background: sending ? 'var(--bg-elevated)' : 'var(--accent)',
                  color: sending ? 'var(--text-muted)' : '#0F1623',
                  fontSize: 15, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                }}>
                  {sending
                    ? (isSignUp ? t('auth.signingUp') : t('auth.signingIn'))
                    : (isSignUp ? t('auth.signUp') : t('auth.signIn'))
                  }
                </button>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 16 }}>
                  {isSignUp ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
                  <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0 }}>
                    {isSignUp ? t('auth.switchToSignIn') : t('auth.switchToSignUp')}
                  </button>
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
