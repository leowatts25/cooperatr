-- ============================================================================
-- Migration 019 — funding_sources registry (Part B: non-notice funding)
-- ============================================================================
-- Standing funds, financial instruments, foundations and private impact capital
-- don't publish dated "calls", so a notice scraper can't model them. This is an
-- ENTITY registry: each row is an ongoing funding vehicle Cooperatr can engage
-- with relationally. Seeded with Global Gateway facilities/mechanisms.
-- ============================================================================

create table if not exists funding_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,                 -- standing_fund | financial_instrument | foundation | impact_fund | dfi_window | blended_facility | initiative
  funder text,               -- parent body (EC/INTPA, EIB, EFSD+, a foundation, ...)
  themes text[],             -- maps to our sector slugs
  geographies text[],
  instrument text,           -- grant | guarantee | equity | debt | TA | blended
  access_mode text,          -- rolling_loi | invitation | open_window | intermediary_only | periodic_call
  status text not null default 'active',  -- active | paused | closed
  cadence text,
  eligibility_notes text,
  url text,
  source_provenance text,
  last_reviewed_at timestamptz,            -- null = AI/seeded, awaiting human review
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ux_funding_sources_name on funding_sources (name);
create index if not exists idx_funding_sources_status on funding_sources (status);

-- ── Seed: Global Gateway vehicles (curated; last_reviewed_at null = verify) ──
insert into funding_sources (name, type, funder, themes, geographies, instrument, access_mode, status, cadence, eligibility_notes, url, source_provenance)
values
  ('Global Gateway Early-Stage Investment Mechanism', 'financial_instrument', 'EC / INTPA (Global Gateway)',
   array['renewable_energy','water_tech','circular_esg','capacity_building'], array['Global South'], 'blended', 'open_window', 'active', 'rolling',
   'Early-stage project preparation / investment support under Global Gateway. Listed OPEN on the EU F&T Portal with a rolling/stale deadline.',
   'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities', 'EU F&T Portal (SEDIA)'),
  ('Global Gateway Transport and Urban Facility', 'standing_fund', 'EC / INTPA (Global Gateway)',
   array['capacity_building','circular_esg'], array['Global South'], 'TA', 'open_window', 'active', 'rolling',
   'Technical assistance facility for transport and urban development under Global Gateway.',
   'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities', 'EU F&T Portal (SEDIA)'),
  ('EFSD+ (European Fund for Sustainable Development Plus)', 'blended_facility', 'European Commission / EIB',
   array['renewable_energy','water_tech','agri_food','circular_esg','capacity_building'], array['Africa','Neighbourhood','Global South'], 'guarantee', 'intermediary_only', 'active', 'rolling',
   'The guarantee + blended-finance backbone of Global Gateway. Accessed via accredited pillar-assessed implementing partners / DFIs, not direct calls.',
   'https://international-partnerships.ec.europa.eu/funding/funding-instruments/european-fund-sustainable-development-plus-efsd_en', 'Curated'),
  ('Team Europe Initiatives (TEIs)', 'initiative', 'EU + Member States (Global Gateway delivery)',
   array['renewable_energy','water_tech','agri_food','capacity_building','human_rights'], array['Africa','Latin America','Asia','Neighbourhood'], 'blended', 'invitation', 'active', 'rolling',
   'Joint EU + member-state programming vehicle delivering Global Gateway priorities by country/region. Relationship-driven, not a public call.',
   'https://international-partnerships.ec.europa.eu/policies/team-europe-initiatives_en', 'Curated')
on conflict (name) do nothing;
