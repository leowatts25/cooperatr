'use client';
import {
  MarketingTabs,
  PageHero,
  MarketNow,
  PushPipeline,
  EngineSection,
  WorkingExamples,
  FinalCta,
} from '@/app/components/marketing/sections';

export default function HowItWorksPage() {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <MarketingTabs />
      <PageHero titleKey="page.how.title" subKey="page.how.sub" />
      <MarketNow />
      <PushPipeline />
      <EngineSection />
      <WorkingExamples />
      <FinalCta />
    </div>
  );
}
