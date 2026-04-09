-- Cooperatr Database Schema
-- All tables for the 5 platform modules

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================
-- COMPANIES (user profiles / SMEs)
-- ============================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text not null,
  organization_type text not null,
  revenue_range text,
  prior_eu_experience boolean default false,
  description text,
  geographies text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- MODULE 1: OPPORTUNITIES
-- ============================================
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  funder text not null,
  funder_abbrev text,
  title text not null,
  description text,
  budget_min numeric,
  budget_max numeric,
  currency text default 'EUR',
  deadline text,
  geographies text[] default '{}',
  sectors text[] default '{}',
  match_score integer,
  match_rationale text,
  recommended_approach text,
  instrument_type text,
  prior_eu_experience_required boolean default false,
  status text default 'new',
  created_at timestamptz default now()
);

-- ============================================
-- MODULE 2: PROPOSALS
-- ============================================
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  status text default 'draft',
  executive_summary text,
  technical_section text,
  financial_section text,
  compliance_section text,
  progress integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- MODULE 3: PARTNER VETTING
-- ============================================
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  name text not null,
  country text,
  sector text,
  role text,
  contact_name text,
  contact_email text,
  website text,
  sanctions_status text default 'pending',
  csddd_status text default 'pending',
  gdpr_status text default 'pending',
  hrdd_status text default 'pending',
  overall_risk text default 'pending',
  risk_summary text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- MODULE 4: PROJECT MANAGEMENT
-- ============================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references proposals(id) on delete set null,
  company_id uuid references companies(id) on delete cascade,
  title text not null,
  funder text,
  status text default 'setup',
  budget_total numeric,
  budget_spent numeric default 0,
  start_date date,
  end_date date,
  geographies text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  due_date date,
  status text default 'pending',
  completion_pct integer default 0,
  sort_order integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Partner engagements (needs projects table to exist first)
create table if not exists partner_engagements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references partners(id) on delete cascade,
  proposal_id uuid references proposals(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  role text,
  created_at timestamptz default now()
);

-- ============================================
-- MODULE 5: MONITORING & IMPACT
-- ============================================
create table if not exists indicators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  category text,
  target_value numeric,
  current_value numeric default 0,
  unit text,
  reporting_period text,
  last_updated timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- ROW LEVEL SECURITY (permissive for now, no auth)
-- ============================================
alter table companies enable row level security;
alter table opportunities enable row level security;
alter table proposals enable row level security;
alter table partners enable row level security;
alter table partner_engagements enable row level security;
alter table projects enable row level security;
alter table milestones enable row level security;
alter table indicators enable row level security;

-- Allow all operations via anon key (no auth yet - Sprint 2 will add proper RLS)
create policy "allow_all_companies" on companies for all using (true) with check (true);
create policy "allow_all_opportunities" on opportunities for all using (true) with check (true);
create policy "allow_all_proposals" on proposals for all using (true) with check (true);
create policy "allow_all_partners" on partners for all using (true) with check (true);
create policy "allow_all_partner_engagements" on partner_engagements for all using (true) with check (true);
create policy "allow_all_projects" on projects for all using (true) with check (true);
create policy "allow_all_milestones" on milestones for all using (true) with check (true);
create policy "allow_all_indicators" on indicators for all using (true) with check (true);
