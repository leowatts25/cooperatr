'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ============================================================================
// Shared admin sub-nav. Renders above every /admin/* page so each admin
// surface links to the others without forcing the user to type URLs.
// ============================================================================

const ADMIN_TABS: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: '/admin', label: 'Users', match: (p) => p === '/admin' },
  { href: '/admin/bd', label: 'BD scanner', match: (p) => p.startsWith('/admin/bd') },
  { href: '/admin/funding', label: 'Funding sources', match: (p) => p.startsWith('/admin/funding') },
  { href: '/admin/tenders', label: 'Tenders', match: (p) => p === '/admin/tenders' || p === '/admin/tenders/' },
  { href: '/admin/tenders?view=contacts', label: 'Contacts', match: (p) => p.startsWith('/admin/tenders') && typeof window !== 'undefined' && window.location.search.includes('view=contacts') },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '';

  return (
    <div>
      {/* Sub-nav */}
      <nav style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-base)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 44,
        position: 'sticky',
        top: 64,
        zIndex: 40,
      }}>
        {ADMIN_TABS.map((tab) => {
          // For Tenders/Contacts we differentiate via the query string; we can't
          // do that reliably from a server-rendered match function, so we use the
          // raw pathname for active-state and let the user disambiguate visually.
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                textDecoration: 'none',
                background: active ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
