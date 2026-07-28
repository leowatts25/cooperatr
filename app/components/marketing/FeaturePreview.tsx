'use client';

// ============================================================================
// FeaturePreview — marketing splash shown to LOGGED-OUT visitors on the gated
// product routes (/opportunities, /proposals, /partners, /projects, /reports).
// Passed to <AuthGuard marketing={...}>. Logged-in users see the real tool;
// logged-out visitors see this: what the module does + a sign-up CTA, instead
// of being bounced straight to the login screen.
// ============================================================================

import Link from 'next/link';
import { useTranslation } from '@/app/lib/i18n/context';
import type { TranslationKey } from '@/app/lib/i18n/translations';
import { MarketingTabs } from '@/app/components/marketing/sections';

export type FeatureId = 'opportunities' | 'proposals' | 'partners' | 'projects' | 'reports';

interface FeatureConfig {
  icon: string;
  accent: string;
  live: boolean;
  eyebrow: TranslationKey;
  title: TranslationKey;
  sub: TranslationKey;
  bullets: TranslationKey[];
}

const FEATURES: Record<FeatureId, FeatureConfig> = {
  opportunities: {
    icon: '🔍', accent: '#1f6cc5', live: true, eyebrow: 'landing.module.1.name',
    title: 'feature.opportunities.title', sub: 'feature.opportunities.sub',
    bullets: ['feature.opportunities.b1', 'feature.opportunities.b2', 'feature.opportunities.b3'],
  },
  proposals: {
    icon: '📝', accent: '#60A5FA', live: true, eyebrow: 'landing.module.2.name',
    title: 'feature.proposals.title', sub: 'feature.proposals.sub',
    bullets: ['feature.proposals.b1', 'feature.proposals.b2', 'feature.proposals.b3'],
  },
  partners: {
    icon: '🛡️', accent: '#22C55E', live: false, eyebrow: 'landing.module.3.name',
    title: 'feature.partners.title', sub: 'feature.partners.sub',
    bullets: ['feature.partners.b1', 'feature.partners.b2', 'feature.partners.b3'],
  },
  projects: {
    icon: '📊', accent: '#8B5CF6', live: true, eyebrow: 'landing.module.4.name',
    title: 'feature.projects.title', sub: 'feature.projects.sub',
    bullets: ['feature.projects.b1', 'feature.projects.b2', 'feature.projects.b3'],
  },
  reports: {
    icon: '📋', accent: '#EC4899', live: true, eyebrow: 'landing.module.5.name',
    title: 'feature.reports.title', sub: 'feature.reports.sub',
    bullets: ['feature.reports.b1', 'feature.reports.b2', 'feature.reports.b3'],
  },
};

export default function FeaturePreview({ feature }: { feature: FeatureId }) {
  const { t } = useTranslation();
  const f = FEATURES[feature];

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <MarketingTabs />

      {/* Hero */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '72px 32px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '24px',
            padding: '6px 14px', borderRadius: '40px',
            backgroundColor: '#EEF2F7', border: '1px solid #E3E9F1',
          }}>
            <span style={{ fontSize: '14px' }}>🔒</span>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', letterSpacing: '0.5px' }}>
              {t('feature.badge')}
            </span>
          </div>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 24px',
            background: `${f.accent}26`, border: `1px solid ${f.accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px',
          }}>
            {f.icon}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: f.accent, letterSpacing: '3px', textTransform: 'uppercase', margin: 0 }}>
              {t(f.eyebrow)}
            </p>
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
              backgroundColor: f.live ? 'rgba(34,197,94,0.15)' : '#EEF2F7',
              color: f.live ? '#22C55E' : '#64748B',
              border: f.live ? '1px solid rgba(34,197,94,0.4)' : '1px solid #E3E9F1',
            }}>
              {f.live ? t('landing.live') : t('landing.comingSoon')}
            </span>
          </div>
          <h1 className="font-serif" style={{ fontSize: 'clamp(30px, 5vw, 50px)', color: '#17233A', lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-0.5px' }}>
            {t(f.title)}
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#475569', lineHeight: 1.6, maxWidth: '680px', margin: '0 auto 36px' }}>
            {t(f.sub)}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth">
              <button style={{ backgroundColor: f.accent, color: '#fff', fontWeight: 700, fontSize: '16px', padding: '15px 32px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
                {t('feature.cta')}
              </button>
            </Link>
            <Link href="/auth">
              <button style={{ backgroundColor: 'transparent', color: '#17233A', fontWeight: 600, fontSize: '16px', padding: '15px 28px', borderRadius: '6px', border: '1px solid #CBD5E1', cursor: 'pointer' }}>
                {t('feature.signIn')}
              </button>
            </Link>
          </div>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '16px' }}>{t('landing.ctaSub')}</p>
        </div>
      </div>

      {/* Capabilities */}
      <div style={{ backgroundColor: '#F6F8FB', padding: '72px 32px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '32px', textAlign: 'center' }}>
            {t('feature.capKicker')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {f.bullets.map((b, i) => (
              <div key={b} style={{ backgroundColor: '#fff', border: '1px solid #E3E9F1', borderRadius: '10px', padding: '28px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px', marginBottom: '16px',
                  background: `${f.accent}15`, color: f.accent,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '15px', fontWeight: 700,
                }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: '15px', color: '#17233A', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{t(b)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ backgroundColor: '#E7F0FB', padding: '72px 32px', textAlign: 'center' }}>
        <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', color: '#17233A', marginBottom: '14px', lineHeight: 1.2 }}>
          {t('feature.bottomTitle')}
        </h2>
        <p style={{ color: '#64748B', fontSize: '16px', maxWidth: '480px', margin: '0 auto 32px', lineHeight: 1.7 }}>
          {t('feature.bottomSub')}
        </p>
        <Link href="/auth">
          <button style={{ backgroundColor: '#1f6cc5', color: '#FFFFFF', fontWeight: 700, fontSize: '17px', padding: '17px 42px', borderRadius: '6px', border: 'none', cursor: 'pointer' }}>
            {t('feature.cta')}
          </button>
        </Link>
        <div style={{ marginTop: '20px' }}>
          <Link href="/platform" style={{ fontSize: '14px', fontWeight: 600, color: '#1f6cc5', textDecoration: 'none' }}>
            {t('feature.exploreCta')}
          </Link>
        </div>
      </div>
    </div>
  );
}
