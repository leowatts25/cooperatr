'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentUser, signOut, ADMIN_EMAIL } from '@/app/lib/supabase-auth';
import { useTranslation } from '@/app/lib/i18n/context';

const modules = [
  { href: '/dashboard', key: 'nav.dashboard' as const },
  { href: '/opportunities', key: 'nav.opportunities' as const },
  { href: '/proposals', key: 'nav.proposals' as const },
  { href: '/partners', key: 'nav.partners' as const },
  { href: '/projects', key: 'nav.projects' as const },
  { href: '/reports', key: 'nav.reports' as const },
  { href: '/agents', key: 'nav.agents' as const, accent: true },
];

export default function Nav() {
  const pathname = usePathname();
  const { locale, setLocale, t } = useTranslation();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u);
      setIsAdmin(u?.email === ADMIN_EMAIL);
    });
  }, []);

  if (pathname.startsWith('/auth')) return null;

  return (
    <nav style={{
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--bg-base)',
      padding: '0 20px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
        <span className="font-serif" style={{ fontSize: '22px', color: 'var(--accent)', letterSpacing: '-0.3px' }}>
          Cooperatr
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
        {modules.map((m) => {
          const active = pathname === m.href || (m.href !== '/dashboard' && pathname.startsWith(m.href));
          return (
            <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 10px', borderRadius: '8px',
                backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: active ? '600' : '400',
                  color: active ? 'var(--text-primary)' : 'accent' in m && m.accent ? 'var(--accent)' : 'var(--text-muted)',
                }}>
                  {t(m.key)}
                </span>
              </div>
            </Link>
          );
        })}
        {isAdmin && (
          <Link href="/admin" style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '6px 10px', borderRadius: '8px',
              backgroundColor: pathname === '/admin' ? 'var(--bg-elevated)' : 'transparent',
              border: pathname === '/admin' ? '1px solid var(--border)' : '1px solid transparent',
            }}>
              <span style={{ fontSize: '13px', fontWeight: pathname === '/admin' ? '600' : '400', color: '#EF4444' }}>{t('nav.admin')}</span>
            </div>
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Language toggle */}
        <div style={{ display: 'flex', borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {(['en', 'es'] as const).map(lang => (
            <button
              key={lang}
              onClick={() => setLocale(lang)}
              style={{
                padding: '4px 8px', border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: locale === lang ? 'var(--accent)' : 'transparent',
                color: locale === lang ? '#0F1623' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>

        {user ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </span>
            <button
              onClick={signOut}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
            >
              {t('nav.signOut')}
            </button>
          </>
        ) : (
          <Link href="/auth" style={{ textDecoration: 'none' }}>
            <span style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#0F1623', fontSize: 13, fontWeight: 600 }}>
              {t('nav.signIn')}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
