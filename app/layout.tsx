import type { Metadata } from 'next';
import './globals.css';
import Nav from './components/Nav';

export const metadata: Metadata = {
  title: 'Cooperatr — EU Development Finance Platform',
  description: 'AI-powered platform for international development and economic cooperation projects.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main style={{ minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </main>
        <footer style={{ borderTop: '1px solid var(--border)', padding: '24px 32px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Cooperatr S.L. — Seville, Andalusia — Built for the European development finance market.
          </p>
        </footer>
      </body>
    </html>
  );
}
