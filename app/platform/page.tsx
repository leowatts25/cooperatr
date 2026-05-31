'use client';
import {
  MarketingTabs,
  PageHero,
  Modules,
  AgentRoster,
  Segments,
  Windows,
  FinalCta,
} from '@/app/components/marketing/sections';

export default function PlatformPage() {
  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <MarketingTabs />
      <PageHero titleKey="page.platform.title" subKey="page.platform.sub" />
      <Modules />
      <AgentRoster />
      <Segments />
      <Windows />
      <FinalCta />
    </div>
  );
}
