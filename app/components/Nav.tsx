'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCurrentUser, signOut, ADMIN_EMAIL } from '@/app/lib/supabase-auth';

const modules = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/opportunities', label: 'Opportunities' },
  { href: '/proposals', label: 'Proposals' },
  { href: '/partners', label: 'Partners' },
  { href: '/projects', label: 'Projects' },
  { href: '/reports', label: 'Reports' },
  { href: '/agents', label: 'AI Agents', accent: true },
];

export default function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u);
      setIsAdmin(u?.email === ADMIN_EMAIL);
    });
  }, []);

  // Don't show nav on auth pages
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
                  {m.label}
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
              <span style={{ fontSize: '13px', fontWeight: pathname === '/admin' ? '600' : '400', color: '#EF4444' }}>Admin</span>
            </div>
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {user ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </span>
            <button
              onClick={signOut}
              style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link href="/auth" style={{ textDecoration: 'none' }}>
            <span style={{ padding: '6px 16px', borderRadius: 8, background: 'var(--accent)', color: '#0F1623', fontSize: 13, fontWeight: 600 }}>
              Sign in
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
