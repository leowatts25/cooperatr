import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Nav from './components/Nav';
import { I18nProvider } from './lib/i18n/context';

const interBrand = Inter({
  subsets: ['latin'],
  // 200 = thin (op, ratr); 800 = extra-bold black (co) — matches the
  // designed wordmark in cooperatr_logo_on_white.png.
  weight: ['200', '800'],
  variable: '--font-inter-brand',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Cooperatr — EU Development Finance Platform',
    template: '%s · Cooperatr',
  },
  description: 'AI-powered platform for international development and economic cooperation projects.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
  },
  openGraph: {
    siteName: 'Cooperatr',
    title: 'Cooperatr — EU Development Finance Platform',
    description: 'AI-powered platform for international development and economic cooperation projects.',
  },
};

export const viewport: Viewport = {
  themeColor: '#0F1623',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={interBrand.variable}>
      <body>
        <I18nProvider>
          <Nav />
          <main style={{ minHeight: 'calc(100vh - 64px)' }}>
            {children}
          </main>
          <footer style={{ borderTop: '1px solid var(--border)', padding: '24px 32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Cooperatr S.L. — Seville, Andalusia — Built for the European development finance market.
            </p>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
