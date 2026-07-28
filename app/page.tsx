'use client';
import Link from 'next/link';
import { useTranslation } from '@/app/lib/i18n/context';
import {
  MarketingTabs,
  RunBiz,
  Modules,
  MarketNow,
  StatsBand,
  WhatWeDo,
  PushPipeline,
  WorkingExamples,
  EngineSection,
  Segments,
  ExploreCards,
  Faq,
  FinalCta,
} from '@/app/components/marketing/sections';

export default function Dashboard() {
  const { t } = useTranslation();

  const sectors = [
    { icon: '🌾', name: t('landing.sectors.agri') },
    { icon: '☀️', name: t('landing.sectors.energy') },
    { icon: '💧', name: t('landing.sectors.water') },
    { icon: '♻️', name: t('landing.sectors.circular') },
    { icon: '⛏️', name: t('landing.sectors.minerals') },
  ];

  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>

      <MarketingTabs />

      {/* Hero */}
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(rgba(246,248,251,0.88), rgba(231,240,251,0.93)), url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1800&q=80) center/cover no-repeat',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '80px 32px',
      }}>
        <div style={{ maxWidth: '900px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase', color: '#64748B', marginBottom: '28px' }}>
            {t('landing.location')}
          </p>
          <h1 className="font-serif" style={{ fontSize: 'clamp(32px, 4.6vw, 54px)', color: '#17233A', lineHeight: 1.12, marginBottom: '24px', letterSpacing: '-1px', maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' }}>
            {t('landing.heroPrefix')}{' '}
            <span style={{ borderBottom: '3px solid #1f6cc5', paddingBottom: '2px' }}>{t('landing.heroHighlight')}</span>
            {t('landing.heroSuffix')}
          </h1>
          <p style={{ fontSize: 'clamp(17px, 2vw, 21px)', fontWeight: 400, color: '#475569', lineHeight: 1.55, maxWidth: '720px', margin: '0 auto 20px' }}>
            {t('landing.heroApproach')}
          </p>
          <p style={{ fontSize: 'clamp(14px, 1.5vw, 16px)', fontWeight: 500, color: '#64748B', lineHeight: 1.5, maxWidth: '640px', margin: '0 auto 40px' }}>
            {t('landing.heroSub')}
          </p>
          <Link href="/opportunities">
            <button style={{ backgroundColor: '#1f6cc5', color: '#FFFFFF', fontWeight: '700', fontSize: '16px', padding: '16px 36px', borderRadius: '4px', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>
              {t('landing.cta')}
            </button>
          </Link>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '48px' }}>{t('landing.ctaSub')}</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {sectors.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '40px', backgroundColor: '#FFFFFF', border: '1px solid #E3E9F1', fontSize: '13px', color: '#334155' }}>
                <span>{s.icon}</span><span>{s.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <RunBiz />
      <WhatWeDo />
      <Modules />
      <MarketNow />
      <StatsBand />
      <PushPipeline />
      <WorkingExamples />
      <EngineSection />
      <Segments />
      <ExploreCards />
      <Faq />
      <FinalCta />

    </div>
  );
}
