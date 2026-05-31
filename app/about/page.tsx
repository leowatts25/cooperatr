'use client';
import {
  MarketingTabs,
  PageHero,
  Team,
  StatsBand,
  FinalCta,
} from '@/app/components/marketing/sections';

export default function AboutPage() {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <MarketingTabs />
      <PageHero titleKey="page.about.title" subKey="page.about.sub" />
      <Team />
      <StatsBand />
      <FinalCta />
    </div>
  );
}
