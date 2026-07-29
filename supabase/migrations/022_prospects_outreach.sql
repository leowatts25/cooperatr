-- ============================================================================
-- 022 — Outreach engine: prospects pipeline
-- ----------------------------------------------------------------------------
-- A prospect is a company we found (or added) that we want to convert into a
-- platform user/client. The pipeline: sourced → researched → matched →
-- drafted → contacted → replied → activated (or dead at any point).
-- Each prospect can carry a "hook" tender — the concrete opportunity the
-- outreach email leads with — plus a tokenized read-only preview link.
-- looking_for is the partner-brokering hook (e.g. "EU partner for Peru
-- project") so consortium matching can build on this table later.
-- ============================================================================

create table if not exists prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  contact_name text,
  contact_email text,
  country text,
  market text not null default 'intl_dev',        -- 'intl_dev' | 'us_domestic'
  status text not null default 'sourced',         -- sourced|researched|matched|drafted|contacted|replied|activated|dead
  source text not null default 'manual',          -- manual|discovery|linkedin
  profile jsonb,                                  -- ClientProfile shape from clientResearch
  looking_for text,                               -- partner-brokering: what they need
  hook_tender_id uuid references tenders(id) on delete set null,
  match_score numeric,
  match_rationale text,
  fit_dimensions jsonb,
  draft_subject text,
  draft_html text,
  preview_token text unique,
  preview_viewed_at timestamptz,
  emailed_at timestamptz,
  replied_at timestamptz,
  activated_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_status_idx on prospects (status);
create index if not exists prospects_market_idx on prospects (market);
create index if not exists prospects_token_idx on prospects (preview_token);
