'use client';

import Link from 'next/link';
import { useTranslation } from '@/app/lib/i18n/context';

export default function SiteFooter() {
  const { t } = useTranslation();
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '24px 32px', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
        {t('footer.tagline')}
      </p>
      <p style={{ fontSize: '12px' }}>
        <Link href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'underline', marginRight: '12px' }}>
          {t('footer.privacy')}
        </Link>
        <Link href="/legal" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>
          {t('footer.legal')}
        </Link>
      </p>
    </footer>
  );
}
