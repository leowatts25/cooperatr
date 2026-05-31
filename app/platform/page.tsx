'use client';
import {
  MarketingTabs,
  PageHero,
  Modules,
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
      <Segments />
      <Windows />
      <FinalCta />
    </div>
  );
}
