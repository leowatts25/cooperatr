import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import Nav from './components/Nav';
import { I18nProvider } from './lib/i18n/context';
import { detectLocaleFromHeader } from './lib/i18n/detect';
import SiteFooter from './components/SiteFooter';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const initialLocale = detectLocaleFromHeader(h.get('accept-language'));
  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body>
        <I18nProvider initialLocale={initialLocale}>
          <Nav />
          <main style={{ minHeight: 'calc(100vh - 64px)' }}>
            {children}
          </main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
