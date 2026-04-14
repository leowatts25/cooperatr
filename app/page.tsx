'use client';
import Link from 'next/link';
import { useTranslation } from '@/app/lib/i18n/context';
import type { TranslationKey } from '@/app/lib/i18n/translations';

export default function Dashboard() {
  const { t } = useTranslation();

  const sectors = [
    { icon: '🌾', name: t('landing.sectors.agri') },
    { icon: '☀️', name: t('landing.sectors.energy') },
    { icon: '💧', name: t('landing.sectors.water') },
    { icon: '♻️', name: t('landing.sectors.circular') },
    { icon: '⛏️', name: t('landing.sectors.minerals') },
  ];

  const modules = [
    { num: '01', icon: '🔍', name: t('landing.module.1.name'), description: t('landing.module.1.desc'), href: '/opportunities', live: true },
    { num: '02', icon: '📝', name: t('landing.module.2.name'), description: t('landing.module.2.desc'), href: '/proposals', live: true },
    { num: '03', icon: '🔎', name: t('landing.module.3.name'), description: t('landing.module.3.desc'), href: '/partners', live: true },
    { num: '04', icon: '📊', name: t('landing.module.4.name'), description: t('landing.module.4.desc'), href: '/projects', live: true },
    { num: '05', icon: '📋', name: t('landing.module.5.name'), description: t('landing.module.5.desc'), href: '/reports', live: true },
  ];

  const missed = [
    t('landing.missed.1'),
    t('landing.missed.2'),
    t('landing.missed.3'),
    t('landing.missed.4'),
  ];

  const engineSteps: { num: number; label: TranslationKey; desc: TranslationKey }[] = [
    { num: 1, label: 'landing.engineStep.1.label', desc: 'landing.engineStep.1.desc' },
    { num: 2, label: 'landing.engineStep.2.label', desc: 'landing.engineStep.2.desc' },
    { num: 3, label: 'landing.engineStep.3.label', desc: 'landing.engineStep.3.desc' },
    { num: 4, label: 'landing.engineStep.4.label', desc: 'landing.engineStep.4.desc' },
  ];

  const stats = [
    { value: '€400B+', label: t('landing.statsLabel.1') },
    { value: '$40B+', label: t('landing.statsLabel.2') },
    { value: '47', label: t('landing.statsLabel.3') },
    { value: '12', label: t('landing.statsLabel.4') },
  ];

  const objections = [
    { q: t('landing.faq.1.q'), a: t('landing.faq.1.a') },
    { q: t('landing.faq.2.q'), a: t('landing.faq.2.a') },
    { q: t('landing.faq.3.q'), a: t('landing.faq.3.a') },
    { q: t('landing.faq.4.q'), a: t('landing.faq.4.a') },
  ];

  return (
    <div style={{ fontFamily: "DM Sans, sans-serif" }}>

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
            <span style={{ borderBottom: '3px solid #F0A500', paddingBottom: '2px' }}>{t('landing.heroHighlight')}</span>
            {' '}{t('landing.heroSuffix')}
          </h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: 'rgba(245,240,232,0.72)', lineHeight: 1.7, maxWidth: '640px', margin: '0 auto 40px' }}>
            {t('landing.heroDesc')}
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

      <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>{t('landing.marketLabel')}</p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '48px' }}>
            {t('landing.marketTitle')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
            {missed.map((text, i) => (
              <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '20px 24px' }}>
                <span style={{ color: '#C8860A', fontSize: '18px', flexShrink: 0 }}>→</span>
                <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.65, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', backgroundColor: '#D4CFC6' }}>
        {stats.map(s => (
          <div key={s.label} style={{ backgroundColor: '#F7F5F0', padding: '32px', textAlign: 'center' }}>
            <div className="font-serif" style={{ fontSize: '32px', color: '#C8860A', marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Engine section */}
      <div style={{ backgroundColor: '#1A2332', padding: '80px 32px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#C8860A', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>{t('landing.engineKicker')}</p>
            <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#F5F0E8', lineHeight: 1.25, marginBottom: '20px' }}>
              {t('landing.engineTitle')}
            </h2>
            <p style={{ fontSize: '15px', color: 'rgba(245,240,232,0.6)', lineHeight: 1.7, maxWidth: '700px', margin: '0 auto' }}>
              {t('landing.engineSubtitle')}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '40px' }}>
            {engineSteps.map((step) => (
              <div key={step.num} style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '28px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    backgroundColor: 'rgba(200,134,10,0.2)',
                    border: '1px solid rgba(200,134,10,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: '700', color: '#C8860A',
                  }}>
                    {step.num}
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#F5F0E8', margin: 0 }}>
                    {t(step.label)}
                  </h3>
                </div>
                <p style={{ fontSize: '13px', color: 'rgba(245,240,232,0.55)', lineHeight: 1.65, margin: 0 }}>
                  {t(step.desc)}
                </p>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid rgba(200,134,10,0.3)',
            paddingTop: '24px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '15px', color: 'rgba(245,240,232,0.72)', lineHeight: 1.7, maxWidth: '680px', margin: '0 auto', fontStyle: 'italic' }}>
              {t('landing.engineNote')}
            </p>
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#fff', padding: '80px 32px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>{t('landing.modulesKicker')}</p>
            <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', marginBottom: '16px' }}>{t('landing.modulesTitle')}</h2>
            <p style={{ color: '#718096', fontSize: '16px', maxWidth: '520px', margin: '0 auto', lineHeight: 1.7 }}>{t('landing.modulesSubtitle')}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {modules.map((m) => (
              <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
                <div style={{ backgroundColor: '#F7F5F0', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '28px', height: '100%', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <span style={{ fontSize: '11px', color: '#A09080', fontWeight: '600', letterSpacing: '1px' }}>{m.num}</span>
                    {m.live
                      ? <span style={{ fontSize: '10px', fontWeight: '700', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FCD34D' }}>{t('landing.live')}</span>
                      : <span style={{ fontSize: '10px', fontWeight: '500', padding: '2px 8px', borderRadius: '20px', backgroundColor: '#F0EDE8', color: '#A09080', border: '1px solid #D4CFC6' }}>{t('landing.comingSoon')}</span>
                    }
                  </div>
                  <div style={{ fontSize: '28px', marginBottom: '14px' }}>{m.icon}</div>
                  <h3 className="font-serif" style={{ fontSize: '19px', color: '#1A2332', marginBottom: '10px' }}>{m.name}</h3>
                  <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.65 }}>{m.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#8B6914', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>{t('landing.faqLabel')}</p>
            <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3vw, 38px)', color: '#1A2332' }}>{t('landing.faqTitle')}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {objections.map((item, i) => (
              <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '24px' }}>
                <p style={{ fontSize: '14px', fontWeight: '700', color: '#1A2332', marginBottom: '10px', lineHeight: 1.4 }}>{item.q}</p>
                <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.65 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ backgroundColor: '#1A2332', padding: '80px 32px', textAlign: 'center' }}>
        <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 48px)', color: '#F5F0E8', marginBottom: '16px', lineHeight: 1.2 }}>{t('landing.bottomCta')}</h2>
        <p style={{ color: 'rgba(245,240,232,0.6)', fontSize: '17px', maxWidth: '460px', margin: '0 auto 36px', lineHeight: 1.7 }}>{t('landing.bottomCtaDesc')}</p>
        <Link href="/opportunities">
          <button style={{ backgroundColor: '#F0A500', color: '#1A2332', fontWeight: '700', fontSize: '17px', padding: '18px 44px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
            {t('landing.bottomCtaButton')}
          </button>
        </Link>
        <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.3)', marginTop: '14px' }}>{t('landing.bottomCtaSub')}</p>
      </div>

    </div>
  );
}
