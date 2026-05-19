-- ============================================================================
-- Migration 010: BD scanner — tenders, scouted SMEs, LinkedIn contacts, matches
-- ============================================================================
-- Companion to the existing pull-mode flow. Adds the push-mode BD pipeline:
--   1. Periodic ingestion of donor tenders from official feeds (TED, UNGM,
--      SAM.gov, devbusiness.un.org, AECID, etc.)
--   2. Per-tender SME discovery (web search + CORDIS + warm-intro lookup
--      against linkedin_contacts)
--   3. Tender × SME scoring with corpus-grounded rationale
--   4. Weekly internal BD report sorted by score
--
-- Existing tables we DO NOT touch:
--   - companies      (kept as user-profile / pull-mode)
--   - opportunities  (kept as M1 ideation output)
--   - proposals      (kept as M2 output)
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- sectors — config table for the matcher filter
-- ============================================================================
-- Sector slugs are referenced by tenders.sectors[] and scouted_companies.sectors[].
-- Keywords are used by the lightweight in-ingester text filter; the LLM
-- scoring step uses the slug+label, not keywords.
-- ============================================================================
create table if not exists sectors (
  slug text primary key,
  label text not null,
  keywords text[] default '{}',
  active boolean default true,
  created_at timestamptz default now()
);

insert into sectors (slug, label, keywords) values
  ('agri_food',         'Agri-food & Agri-tech',
   array['agriculture','agribusiness','food security','rural development','farming','agri-tech','agroecology','smallholder','value chain agriculture','livestock','aquaculture']),
  ('renewable_energy',  'Renewable Energy',
   array['solar','wind','renewable energy','photovoltaic','biomass','hydro','geothermal','energy access','off-grid','mini-grid','clean energy','energy transition']),
  ('water_tech',        'Water Technology',
   array['water','sanitation','wastewater','irrigation','desalination','wash','water resources','hydrology','water supply']),
  ('circular_esg',      'Circular Economy & ESG',
   array['circular economy','recycling','waste management','sustainability','esg','eu taxonomy','green economy','climate finance','green transition']),
  ('critical_minerals', 'Critical Minerals',
   array['critical raw materials','rare earth','lithium','cobalt','mining','strategic minerals','battery materials','crm']),
  ('human_rights',      'Human Rights',
   array['human rights','gender','civil society','rule of law','democracy','rights-based','hrdd','migration','protection','equality'])
on conflict (slug) do nothing;

-- ============================================================================
-- tenders — normalized tender records from donor feeds
-- ============================================================================
create table if not exists tenders (
  id uuid primary key default gen_random_uuid(),

  -- Source provenance
  source text not null,                      -- 'TED' | 'UNGM' | 'SAM_GOV' | 'DEVBUSINESS' | 'AECID' | etc.
  source_ref text not null,                  -- external notice ID
  url text,                                  -- link back to source
  raw jsonb,                                 -- full original record for re-parsing

  -- Core fields
  title text,
  description text,
  donor text,                                -- normalized donor name (EU NDICI, AECID, USAID-legacy, DFC, etc.)
  buyer text,                                -- contracting authority
  country text,                              -- ISO-2 or written-out
  region text,                               -- 'west-africa' | 'latam' | 'mena' | 'sea' | 'europe' | 'global' | ...
  sectors text[] default '{}',               -- slugs matching sectors.slug
  type text,                                 -- 'services' | 'works' | 'goods' | 'mixed' | 'unknown'

  -- Value (normalized to USD where possible)
  value_usd_min numeric,
  value_usd_max numeric,
  currency text,                             -- original currency
  raw_value_text text,                       -- original value string

  -- Dates
  published_at timestamptz,
  deadline_at timestamptz,

  -- Filter state — set by the ingester; not the same as scoring
  passes_filter boolean default false,
  filter_reasons text[] default '{}',        -- e.g. ['sector:renewable_energy', 'value_in_range']

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (source, source_ref)
);

create index if not exists tenders_published_idx on tenders(published_at desc);
create index if not exists tenders_passes_filter_idx on tenders(passes_filter) where passes_filter = true;
create index if not exists tenders_sectors_idx on tenders using gin(sectors);
create index if not exists tenders_country_idx on tenders(country);

-- ============================================================================
-- scouted_companies — SMEs the scanner has discovered
-- ============================================================================
-- Distinct from `companies` (which holds user-profile SMEs in the pull-mode
-- flow). This table is the BD portfolio: third-party companies the system
-- found by scanning sources in response to a tender match.
-- ============================================================================
create table if not exists scouted_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  website text,
  linkedin_url text,
  description text,
  sectors text[] default '{}',
  size_band text,                            -- 'micro' | 'small' | 'medium' | 'large' | 'unknown'
  certifications text[] default '{}',
  past_donor_wins text[] default '{}',       -- ['EU-NDICI 2023', 'AECID 2022', ...] from CORDIS/TED archive
  discovered_via text,                       -- 'linkedin_import' | 'web_search' | 'cordis' | 'ted_archive' | 'manual'
  discovered_for_tender_id uuid references tenders(id) on delete set null,
  evidence_notes text,                       -- what the scanner found and where
  last_scored_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists scouted_companies_sectors_idx on scouted_companies using gin(sectors);
create index if not exists scouted_companies_country_idx on scouted_companies(country);

-- ============================================================================
-- linkedin_contacts — admin's LinkedIn network for warm-intro routing
-- ============================================================================
-- Loaded once from a LinkedIn data export ("Connections" CSV). Each row is a
-- personal contact. The matcher checks overlap between a contact's company
-- and a tender's requirements to surface warm-intro pairings.
-- ============================================================================
create table if not exists linkedin_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),   -- which admin's network this is
  first_name text,
  last_name text,
  email text,
  linkedin_url text,
  position text,
  company_name text,                         -- as written in the LinkedIn export (case-insensitive lookup later)
  scouted_company_id uuid references scouted_companies(id) on delete set null,
  connected_on date,
  created_at timestamptz default now()
);

create index if not exists linkedin_contacts_company_idx on linkedin_contacts(lower(company_name));
create index if not exists linkedin_contacts_owner_idx on linkedin_contacts(owner_id);

-- ============================================================================
-- tender_matches — scored (tender, scouted_company) pairings
-- ============================================================================
create table if not exists tender_matches (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references tenders(id) on delete cascade,
  scouted_company_id uuid not null references scouted_companies(id) on delete cascade,

  -- Scoring
  score numeric,                             -- 0-100
  rationale text,                            -- Claude's "why" (one paragraph, corpus-grounded)
  fit_dimensions jsonb,                      -- {sector: 0.9, geography: 0.7, capability: 0.8, ...}

  -- Warm-intro signal — if you have a personal contact at this SME
  warm_intro_via_contact_id uuid references linkedin_contacts(id) on delete set null,

  -- BD workflow status
  status text default 'suggested' check (status in (
    'suggested', 'reviewed', 'pursuing', 'dropped', 'won', 'lost'
  )),
  notes text,

  -- Provenance
  matched_at timestamptz default now(),
  reviewed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (tender_id, scouted_company_id)
);

create index if not exists tender_matches_tender_idx on tender_matches(tender_id);
create index if not exists tender_matches_score_idx on tender_matches(score desc);
create index if not exists tender_matches_status_idx on tender_matches(status);
create index if not exists tender_matches_warm_idx
  on tender_matches(warm_intro_via_contact_id)
  where warm_intro_via_contact_id is not null;

-- ============================================================================
-- RLS — service-role only (admin-only feature, no public access yet)
-- ============================================================================
alter table sectors enable row level security;
alter table tenders enable row level security;
alter table scouted_companies enable row level security;
alter table linkedin_contacts enable row level security;
alter table tender_matches enable row level security;

create policy "service_role_sectors"             on sectors             for all using (true) with check (true);
create policy "service_role_tenders"             on tenders             for all using (true) with check (true);
create policy "service_role_scouted_companies"   on scouted_companies   for all using (true) with check (true);
create policy "service_role_linkedin_contacts"   on linkedin_contacts   for all using (true) with check (true);
create policy "service_role_tender_matches"      on tender_matches      for all using (true) with check (true);
