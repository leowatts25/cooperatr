'use client';

// ============================================================================
// Marketing section components
// ----------------------------------------------------------------------------
// The public landing content, broken into reusable sections so the home page
// and the dedicated marketing pages (/how-it-works, /platform, /about) can
// compose them without duplicating markup. Every section pulls its copy from
// the global i18n keys (landing.* / page.* / mkt.*).
// ============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from '@/app/lib/i18n/context';
import type { TranslationKey } from '@/app/lib/i18n/translations';

// ── Marketing sub-nav ───────────────────────────────────────────────────────
// Slim secondary bar so visitors can move between the marketing pages. Sits
// below the global app Nav. Active link is underlined.
export function MarketingTabs() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const links: { href: string; key: TranslationKey }[] = [
    { href: '/', key: 'mkt.nav.home' },
    { href: '/how-it-works', key: 'mkt.nav.how' },
    { href: '/platform', key: 'mkt.nav.platform' },
    { href: '/about', key: 'mkt.nav.about' },
  ];
  return (
    <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #E8E2D8', padding: '0 32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
        {links.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} style={{ textDecoration: 'none' }}>
              <span style={{
                display: 'inline-block',
                padding: '14px 14px',
                fontSize: '13px',
                fontWeight: active ? 700 : 500,
                color: active ? '#1A2332' : '#718096',
                borderBottom: active ? '2px solid #1f6cc5' : '2px solid transparent',
              }}>
                {t(l.key)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Compact page header for sub-pages ────────────────────────────────────────
export function PageHero({ titleKey, subKey }: { titleKey: TranslationKey; subKey: TranslationKey }) {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#1A2332', padding: '72px 32px', textAlign: 'center' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 className="font-serif" style={{ fontSize: 'clamp(30px, 5vw, 52px)', color: '#F5F0E8', lineHeight: 1.15, marginBottom: '18px', letterSpacing: '-0.5px' }}>
          {t(titleKey)}
        </h1>
        <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: 'rgba(245,240,232,0.7)', lineHeight: 1.55, margin: 0 }}>
          {t(subKey)}
        </p>
      </div>
    </div>
  );
}

// ── You run the business ─────────────────────────────────────────────────────
export function RunBiz() {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
        <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '24px' }}>
          {t('landing.runBiz.title')}
        </h2>
        <p style={{ fontSize: '17px', color: '#1A2332', lineHeight: 1.7, marginBottom: '18px' }}>
          {t('landing.runBiz.body1')}
        </p>
        <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, margin: 0 }}>
          {t('landing.runBiz.body2')}
        </p>
      </div>
    </div>
  );
}

// ── What Cooperatr does (platform + implementation partner) ───────────────────
export function WhatWeDo() {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.whatWeDo.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25 }}>
            {t('landing.whatWeDo.title')}
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <div style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '32px' }}>
            <h3 className="font-serif" style={{ fontSize: '20px', color: '#1A2332', marginBottom: '14px' }}>{t('landing.whatWeDo.platform.label')}</h3>
            <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7, margin: 0 }}>
              {t('landing.whatWeDo.platform.body')}
            </p>
          </div>
          <div style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '32px' }}>
            <h3 className="font-serif" style={{ fontSize: '20px', color: '#1A2332', marginBottom: '14px' }}>{t('landing.whatWeDo.partner.label')}</h3>
            <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7, margin: 0 }}>
              {t('landing.whatWeDo.partner.body')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stats band ────────────────────────────────────────────────────────────────
export function StatsBand() {
  const { t } = useTranslation();
  const stats = [
    { value: '€400B+', label: t('landing.statsLabel.1') },
    { value: '$40B+', label: t('landing.statsLabel.2') },
    { value: '47', label: t('landing.statsLabel.3') },
    { value: '12', label: t('landing.statsLabel.4') },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1px', backgroundColor: '#D4CFC6' }}>
      {stats.map((s) => (
        <div key={s.label} style={{ backgroundColor: '#F7F5F0', padding: '32px', textAlign: 'center' }}>
          <div className="font-serif" style={{ fontSize: '32px', color: '#1f6cc5', marginBottom: '4px' }}>{s.value}</div>
          <div style={{ fontSize: '11px', color: '#8A8070', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── The market right now ──────────────────────────────────────────────────────
export function MarketNow() {
  const { t } = useTranslation();
  const missed = [t('landing.missed.1'), t('landing.missed.2'), t('landing.missed.3'), t('landing.missed.4')];
  return (
    <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', fontWeight: '700', color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '16px' }}>{t('landing.marketLabel')}</p>
        <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '24px' }}>
          {t('landing.marketTitle')}
        </h2>
        <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, maxWidth: '700px', margin: '0 auto 40px' }}>
          {t('landing.heroBody')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
          {missed.map((text, i) => (
            <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '20px 24px' }}>
              <span style={{ color: '#1f6cc5', fontSize: '18px', flexShrink: 0 }}>→</span>
              <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.65, margin: 0 }}>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Push-mode BD pipeline ─────────────────────────────────────────────────────
export function PushPipeline() {
  const { t } = useTranslation();
  const pushSteps: { num: number; icon: string; label: TranslationKey; desc: TranslationKey }[] = [
    { num: 1, icon: '📡', label: 'landing.push.step.1.label', desc: 'landing.push.step.1.desc' },
    { num: 2, icon: '🎯', label: 'landing.push.step.2.label', desc: 'landing.push.step.2.desc' },
    { num: 3, icon: '📩', label: 'landing.push.step.3.label', desc: 'landing.push.step.3.desc' },
  ];
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px', borderTop: '1px solid #E8E2D8' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.push.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '20px' }}>
            {t('landing.push.title')}
          </h2>
          <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.7, maxWidth: '720px', margin: '0 auto' }}>
            {t('landing.push.subtitle')}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {pushSteps.map((step) => (
            <div key={step.num} style={{ backgroundColor: '#F7F5F0', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <span style={{ fontSize: '22px' }}>{step.icon}</span>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: 'rgba(31,108,197,0.12)', border: '1px solid rgba(31,108,197,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#1f6cc5' }}>
                  {step.num}
                </div>
              </div>
              <h3 className="font-serif" style={{ fontSize: '17px', color: '#1A2332', marginBottom: '10px', lineHeight: 1.3 }}>
                {t(step.label)}
              </h3>
              <p style={{ fontSize: '13px', color: '#4A5568', lineHeight: 1.65, margin: 0 }}>
                {t(step.desc)}
              </p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.7, textAlign: 'center', maxWidth: '720px', margin: '0 auto', fontStyle: 'italic', paddingTop: '20px', borderTop: '1px solid #E8E2D8' }}>
          {t('landing.push.note')}
        </p>
      </div>
    </div>
  );
}

// ── The engine ────────────────────────────────────────────────────────────────
export function EngineSection() {
  const { t } = useTranslation();
  const engineSteps: { num: number; label: TranslationKey; desc: TranslationKey }[] = [
    { num: 1, label: 'landing.engineStep.1.label', desc: 'landing.engineStep.1.desc' },
    { num: 2, label: 'landing.engineStep.2.label', desc: 'landing.engineStep.2.desc' },
    { num: 3, label: 'landing.engineStep.3.label', desc: 'landing.engineStep.3.desc' },
    { num: 4, label: 'landing.engineStep.4.label', desc: 'landing.engineStep.4.desc' },
  ];
  return (
    <div style={{ backgroundColor: '#1A2332', padding: '80px 32px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#1f6cc5', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '16px' }}>{t('landing.engineKicker')}</p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#F5F0E8', lineHeight: 1.25, marginBottom: '20px' }}>
            {t('landing.engineTitle')}
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(245,240,232,0.6)', lineHeight: 1.7, maxWidth: '700px', margin: '0 auto' }}>
            {t('landing.engineSubtitle')}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '40px' }}>
          {engineSteps.map((step) => (
            <div key={step.num} style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'rgba(31,108,197,0.2)', border: '1px solid rgba(31,108,197,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#1f6cc5' }}>
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
        <div style={{ borderTop: '1px solid rgba(31,108,197,0.3)', paddingTop: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '15px', color: 'rgba(245,240,232,0.72)', lineHeight: 1.7, maxWidth: '680px', margin: '0 auto', fontStyle: 'italic' }}>
            {t('landing.engineNote')}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Working examples (tabbed) ─────────────────────────────────────────────────
export function WorkingExamples() {
  const { t } = useTranslation();
  const [activeExample, setActiveExample] = useState(0);
  const examples: { tab: TranslationKey; title: TranslationKey; body1: TranslationKey; body2: TranslationKey; body3: TranslationKey }[] = [
    { tab: 'landing.example.0.tab', title: 'landing.example.0.title', body1: 'landing.example.0.body1', body2: 'landing.example.0.body2', body3: 'landing.example.0.body3' },
    { tab: 'landing.example.1.tab', title: 'landing.example.1.title', body1: 'landing.example.1.body1', body2: 'landing.example.1.body2', body3: 'landing.example.1.body3' },
    { tab: 'landing.example.2.tab', title: 'landing.example.2.title', body1: 'landing.example.2.body1', body2: 'landing.example.2.body2', body3: 'landing.example.2.body3' },
  ];
  return (
    <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
      <div style={{ maxWidth: '820px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.example.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', color: '#1A2332', lineHeight: 1.25 }}>
            {t(examples[activeExample].title)}
          </h2>
        </div>
        <div role="tablist" aria-label={t('landing.example.kicker')} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', marginBottom: '28px' }}>
          {examples.map((ex, i) => {
            const active = i === activeExample;
            return (
              <button
                key={ex.tab}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveExample(i)}
                style={{
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, letterSpacing: '0.3px',
                  padding: '10px 18px', borderRadius: '999px',
                  border: active ? '1px solid #1f6cc5' : '1px solid #E8E2D8',
                  backgroundColor: active ? '#1f6cc5' : '#fff',
                  color: active ? '#fff' : '#4A5568',
                  transition: 'all 0.15s ease',
                }}
              >
                {t(ex.tab)}
              </button>
            );
          })}
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '36px', borderLeft: '4px solid #1f6cc5' }}>
          <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, marginTop: 0, marginBottom: '18px' }}>{t(examples[activeExample].body1)}</p>
          <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, marginBottom: '18px' }}>{t(examples[activeExample].body2)}</p>
          <p style={{ fontSize: '15px', color: '#1A2332', lineHeight: 1.75, fontWeight: 600, margin: 0 }}>{t(examples[activeExample].body3)}</p>
        </div>
      </div>
    </div>
  );
}

// ── Five modules ──────────────────────────────────────────────────────────────
export function Modules() {
  const { t } = useTranslation();
  const modules = [
    { num: '01', icon: '🔍', name: t('landing.module.1.name'), description: t('landing.module.1.desc'), href: '/opportunities', live: true },
    { num: '02', icon: '📝', name: t('landing.module.2.name'), description: t('landing.module.2.desc'), href: '/proposals', live: true },
    { num: '03', icon: '🔎', name: t('landing.module.3.name'), description: t('landing.module.3.desc'), href: '/partners', live: true },
    { num: '04', icon: '📊', name: t('landing.module.4.name'), description: t('landing.module.4.desc'), href: '/projects', live: true },
    { num: '05', icon: '📋', name: t('landing.module.5.name'), description: t('landing.module.5.desc'), href: '/reports', live: true },
  ];
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>{t('landing.modulesKicker')}</p>
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
  );
}

// ── Who we serve ──────────────────────────────────────────────────────────────
export function Segments() {
  const { t } = useTranslation();
  const segments: { title: TranslationKey; desc: TranslationKey; icon: string }[] = [
    { title: 'landing.segments.1.title', desc: 'landing.segments.1.desc', icon: '🏭' },
    { title: 'landing.segments.2.title', desc: 'landing.segments.2.desc', icon: '🌍' },
    { title: 'landing.segments.3.title', desc: 'landing.segments.3.desc', icon: '🤝' },
    { title: 'landing.segments.4.title', desc: 'landing.segments.4.desc', icon: '🏛️' },
    { title: 'landing.segments.5.title', desc: 'landing.segments.5.desc', icon: '📑' },
  ];
  return (
    <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.segments.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25 }}>
            {t('landing.segments.title')}
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {segments.map((s) => (
            <div key={s.title} style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '28px' }}>
              <div style={{ fontSize: '24px', marginBottom: '14px' }}>{s.icon}</div>
              <h3 className="font-serif" style={{ fontSize: '17px', color: '#1A2332', marginBottom: '10px', lineHeight: 1.3 }}>
                {t(s.title)}
              </h3>
              <p style={{ fontSize: '13px', color: '#4A5568', lineHeight: 1.65, margin: 0 }}>
                {t(s.desc)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Two windows (EU + post-USAID US) ──────────────────────────────────────────
export function Windows() {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px', borderTop: '1px solid #E8E2D8' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.windows.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '16px' }}>
            {t('landing.windows.title')}
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div style={{ backgroundColor: '#F7F5F0', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '22px' }}>🇪🇺</span>
              <h3 className="font-serif" style={{ fontSize: '20px', color: '#1A2332', margin: 0 }}>{t('landing.windows.eu.label')}</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7, margin: 0 }}>
              {t('landing.windows.eu.list')}
            </p>
          </div>
          <div style={{ backgroundColor: '#F7F5F0', border: '1px solid #E8E2D8', borderRadius: '10px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '22px' }}>🇺🇸</span>
              <h3 className="font-serif" style={{ fontSize: '20px', color: '#1A2332', margin: 0 }}>{t('landing.windows.us.label')}</h3>
            </div>
            <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.7, margin: 0 }}>
              {t('landing.windows.us.list')}
            </p>
          </div>
        </div>
        <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.7, textAlign: 'center', maxWidth: '720px', margin: '0 auto', fontStyle: 'italic' }}>
          {t('landing.windows.note')}
        </p>
      </div>
    </div>
  );
}

// ── Built by practitioners ────────────────────────────────────────────────────
export function Team() {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px', borderTop: '1px solid #E8E2D8' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
          {t('landing.team.kicker')}
        </p>
        <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '24px' }}>
          {t('landing.team.title')}
        </h2>
        <p style={{ fontSize: '15px', color: '#4A5568', lineHeight: 1.75, margin: 0 }}>
          {t('landing.team.body')}
        </p>
      </div>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
export function Faq() {
  const { t } = useTranslation();
  const objections = [
    { q: t('landing.faq.1.q'), a: t('landing.faq.1.a') },
    { q: t('landing.faq.2.q'), a: t('landing.faq.2.a') },
    { q: t('landing.faq.3.q'), a: t('landing.faq.3.a') },
    { q: t('landing.faq.4.q'), a: t('landing.faq.4.a') },
  ];
  return (
    <div style={{ backgroundColor: '#F7F5F0', padding: '80px 32px' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: '700', color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>{t('landing.faqLabel')}</p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(24px, 3vw, 38px)', color: '#1A2332' }}>{t('landing.faqTitle')}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {objections.map((item, i) => (
            <div key={i} style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '8px', padding: '24px' }}>
              <p style={{ fontSize: '14px', fontWeight: '700', color: '#1A2332', marginBottom: '10px', lineHeight: 1.4 }}>{item.q}</p>
              <p style={{ fontSize: '13px', color: '#718096', lineHeight: 1.65 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Explore cards (home → marketing pages) ────────────────────────────────────
export function ExploreCards() {
  const { t } = useTranslation();
  const cards: {
    href: string;
    icon: string;
    accent: string;
    title: TranslationKey;
    desc: TranslationKey;
    bullets: TranslationKey[];
  }[] = [
    {
      href: '/how-it-works',
      icon: '⚙️',
      accent: '#1f6cc5',
      title: 'landing.explore.how.title',
      desc: 'landing.explore.how.desc',
      bullets: ['landing.explore.how.b1', 'landing.explore.how.b2', 'landing.explore.how.b3'],
    },
    {
      href: '/platform',
      icon: '🧩',
      accent: '#0d8a6a',
      title: 'landing.explore.platform.title',
      desc: 'landing.explore.platform.desc',
      bullets: ['landing.explore.platform.b1', 'landing.explore.platform.b2', 'landing.explore.platform.b3'],
    },
    {
      href: '/about',
      icon: '👥',
      accent: '#a05a1f',
      title: 'landing.explore.about.title',
      desc: 'landing.explore.about.desc',
      bullets: ['landing.explore.about.b1', 'landing.explore.about.b2', 'landing.explore.about.b3'],
    },
  ];
  return (
    <div style={{ backgroundColor: '#fff', padding: '80px 32px', borderTop: '1px solid #E8E2D8' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, color: '#0d3b75', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
            {t('landing.explore.kicker')}
          </p>
          <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 42px)', color: '#1A2332', lineHeight: 1.25, marginBottom: '16px' }}>
            {t('landing.explore.title')}
          </h2>
          <p style={{ fontSize: '16px', color: '#718096', lineHeight: 1.7, maxWidth: '620px', margin: '0 auto' }}>
            {t('landing.explore.sub')}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {cards.map((c) => (
            <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
              <div style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', borderRadius: '12px', height: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 1px 3px rgba(26,35,50,0.06)' }}>
                {/* graphic header strip */}
                <div style={{
                  background: `linear-gradient(135deg, ${c.accent} 0%, #1A2332 140%)`,
                  padding: '28px 28px 24px',
                  display: 'flex', alignItems: 'center', gap: '14px',
                }}>
                  <div style={{
                    width: '52px', height: '52px', borderRadius: '12px',
                    backgroundColor: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.28)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '26px', flexShrink: 0,
                  }}>
                    {c.icon}
                  </div>
                  <h3 className="font-serif" style={{ fontSize: '22px', color: '#F5F0E8', margin: 0, lineHeight: 1.2 }}>{t(c.title)}</h3>
                </div>
                {/* body */}
                <div style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <p style={{ fontSize: '14px', color: '#4A5568', lineHeight: 1.65, margin: '0 0 20px' }}>{t(c.desc)}</p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {c.bullets.map((b) => (
                      <li key={b} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', color: '#4A5568', lineHeight: 1.5 }}>
                        <span style={{ color: c.accent, fontWeight: 700, flexShrink: 0 }}>✓</span>
                        <span>{t(b)}</span>
                      </li>
                    ))}
                  </ul>
                  <span style={{ marginTop: 'auto', fontSize: '14px', fontWeight: 700, color: c.accent }}>{t('landing.explore.cta')}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
export function FinalCta() {
  const { t } = useTranslation();
  return (
    <div style={{ backgroundColor: '#1A2332', padding: '80px 32px', textAlign: 'center' }}>
      <h2 className="font-serif" style={{ fontSize: 'clamp(26px, 4vw, 48px)', color: '#F5F0E8', marginBottom: '16px', lineHeight: 1.2 }}>{t('landing.bottomCta')}</h2>
      <p style={{ color: 'rgba(245,240,232,0.6)', fontSize: '17px', maxWidth: '460px', margin: '0 auto 36px', lineHeight: 1.7 }}>{t('landing.bottomCtaDesc')}</p>
      <Link href="/opportunities">
        <button style={{ backgroundColor: '#4a9eff', color: '#1A2332', fontWeight: '700', fontSize: '17px', padding: '18px 44px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}>
          {t('landing.bottomCtaButton')}
        </button>
      </Link>
      <p style={{ fontSize: '12px', color: 'rgba(245,240,232,0.3)', marginTop: '14px' }}>{t('landing.bottomCtaSub')}</p>
    </div>
  );
}
