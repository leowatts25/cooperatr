-- ============================================================================
-- Migration 020 — client portals (tenant-ready)
-- ============================================================================
-- Cooperatr represents SME clients and runs the BD scanner FROM the client's
-- side: given a client's capabilities, rank the tenders that fit them.
--
-- Tenant-ready from day one: each client is a first-class row with an
-- owner_user_id (null for now). Client-facing logins later = link a user to a
-- client + an access check; no redesign.
-- ============================================================================

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  website text,
  description text,
  sectors text[],                 -- our sector slugs
  geographies text[],             -- delivery geographies
  size_band text,                 -- micro | small | medium | large
  capabilities text,              -- freeform technical capabilities / service lines
  past_wins text[],               -- named donor/program wins
  certifications text[],
  ceo_name text,
  ceo_background text,            -- CEO experience/network — used as a matching signal
  ceo_linkedin text,
  status text not null default 'active',   -- active | paused | archived
  owner_user_id uuid,             -- for future client-facing logins (null = internal only)
  research_provenance text,
  last_researched_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists ux_clients_slug on clients (slug);
create index if not exists idx_clients_status on clients (status);
create index if not exists idx_clients_owner on clients (owner_user_id);

-- Per-client BD matches: (client × tender) scored from the client's side.
create table if not exists client_tender_matches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  tender_id uuid not null references tenders (id) on delete cascade,
  score numeric,
  rationale text,
  fit_dimensions jsonb,
  partner_stack text[],
  risks text[],
  status text not null default 'suggested',  -- suggested | reviewed | pursuing | dropped | won | lost
  notes text,
  matched_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (client_id, tender_id)
);

create index if not exists idx_ctm_client on client_tender_matches (client_id);
create index if not exists idx_ctm_tender on client_tender_matches (tender_id);
