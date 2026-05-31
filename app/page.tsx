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
        background: 'linear-gradient(rgba(15,22,35,0.72), rgba(15,22,35,0.62)), url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1800&q=80) center/cover no-repeat',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center', padding: '80px 32px',
      }}>
        <div style={{ maxWidth: '900px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(240,237,230,0.6)', marginBottom: '28px' }}>
            {t('landing.location')}
          </p>
          <h1 className="font-serif" style={{ fontSize: 'clamp(38px, 6vw, 72px)', color: '#F5F0E8', lineHeight: 1.1, marginBottom: '28px', letterSpacing: '-1px' }}>
            {t('landing.heroPrefix')}{' '}
            <span style={{ borderBottom: '3px solid #4a9eff', paddingBottom: '2px' }}>{t('landing.heroHighlight')}</span>
            {t('landing.heroSuffix')}
          </h1>
          <p style={{ fontSize: 'clamp(20px, 2.8vw, 28px)', fontWeight: 400, color: 'rgba(245,240,232,0.88)', lineHeight: 1.45, maxWidth: '760px', margin: '0 auto 40px' }}>
            {t('landing.heroSub')}
          </p>
          <Link href="/opportunities">
            <button style={{ backgroundColor: '#fff', color: '#1A2332', fontWeight: '700', fontSize: '16px', padding: '16px 36px', borderRadius: '4px', border: 'none', cursor: 'pointer', marginBottom: '12px' }}>
              {t('landing.cta')}
            </button>
          </Link>
          <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.35)', marginBottom: '48px' }}>{t('landing.ctaSub')}</p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {sectors.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '40px', backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', fontSize: '13px', color: 'rgba(245,240,232,0.85)' }}>
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
