-- Migration 003: Ideas table + extended company profile
-- Transforms the Opportunity Engine from a simple EU-fund matcher into a
-- discovery engine that surfaces tagged ideas (concrete/creative/hybrid)
-- with expandable sub-sections: funding paths, partners, buyers, investors,
-- regulatory requirements, risks, next steps, data provenance.

-- ============================================
-- EXTEND companies with Stage 2 intake fields
-- ============================================
alter table companies add column if not exists capabilities text[] default '{}';
alter table companies add column if not exists certifications text[] default '{}';
alter table companies add column if not exists team_size text;
alter table companies add column if not exists existing_partners text[] default '{}';
alter table companies add column if not exists key_customers text[] default '{}';
alter table companies add column if not exists typical_project_size text;
alter table companies add column if not exists three_year_vision text;
alter table companies add column if not exists cash_runway text;
alter table companies add column if not exists consortium_posture text;
alter table companies add column if not exists international_contacts text[] default '{}';
alter table companies add column if not exists profile_completeness integer default 0;

-- ============================================
-- IDEAS — the discovery engine output
-- ============================================
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,

  -- Core
  title text not null,
  summary text not null,
  tag text not null check (tag in ('concrete', 'creative', 'hybrid')),
  confidence integer not null check (confidence between 0 and 100),
  confidence_rationale text,

  -- Sizing
  estimated_value_min numeric,
  estimated_value_max numeric,
  currency text default 'EUR',
  estimated_timeline_months integer,

  -- Expandable sub-sections (jsonb arrays of structured objects)
  funding_paths jsonb default '[]'::jsonb,
  partners jsonb default '[]'::jsonb,
  buyers jsonb default '[]'::jsonb,
  investors jsonb default '[]'::jsonb,
  next_steps jsonb default '[]'::jsonb,

  -- Compliance + risk
  regulatory_requirements text[] default '{}',
  risks text[] default '{}',

  -- Trust + transparency
  data_provenance jsonb default '[]'::jsonb,
  missing_data text[] default '{}',
  proposal_ready boolean default false,

  -- Lifecycle
  status text default 'new',  -- new | saved | dismissed | in_progress | won | lost
  last_refreshed_at timestamptz default now(),
  stale_after_days integer default 30,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ideas_company_id on ideas(company_id);
create index if not exists idx_ideas_status on ideas(status);
create index if not exists idx_ideas_confidence on ideas(confidence desc);
create index if not exists idx_ideas_tag on ideas(tag);

-- ============================================
-- RLS
-- ============================================
alter table ideas enable row level security;
create policy "allow_all_ideas" on ideas for all using (true) with check (true);
