'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const modules = [
  { href: '/opportunities', label: 'Opportunities', live: true },
  { href: '/proposals', label: 'Proposals', live: false },
  { href: '/partners', label: 'Partners', live: false },
  { href: '/projects', label: 'Projects', live: false },
  { href: '/reports', label: 'Reports', live: false },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav style={{
      borderBottom: '1px solid var(--border)',
      backgroundColor: 'var(--bg-base)',
      padding: '0 32px',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 50,
    }}>
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span className="font-serif" style={{ fontSize: '22px', color: 'var(--accent)', letterSpacing: '-0.3px' }}>
          Cooperatr
        </span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {modules.map((m) => {
          const active = pathname.startsWith(m.href);
          return (
            <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                backgroundColor: active ? 'var(--bg-elevated)' : 'transparent',
                border: active ? '1px solid var(--border)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}>
                <span style={{
                  fontSize: '13px',
                  fontWeight: active ? '600' : '400',
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                }}>
                  {m.label}
                </span>
                {m.live && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '600',
                    padding: '1px 5px',
                    borderRadius: '20px',
                    backgroundColor: 'var(--accent-dim)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(240,165,0,0.3)',
                  }}>
                    LIVE
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
