-- ============================================================================
-- Migration 007: Proposal-pattern corpus (clean-room extraction)
-- ============================================================================
-- The corpus stores ABSTRACTIONS only, never source prose.
--
-- Two tables:
--   - corpus_sources       : provenance / legal posture (audit trail)
--   - proposal_patterns    : the extracted abstract patterns (retrieval target)
--
-- Source documents themselves are NEVER stored. They live offline (or are
-- destroyed). corpus_sources records "we extracted from X" for audit only.
--
-- Retrieval (Phase 1): filter by donor + sector + geography_class.
-- Retrieval (Phase 2): semantic similarity via pgvector embeddings.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists vector;

-- ============================================================================
-- corpus_sources — provenance / audit
-- ============================================================================
-- One row per source document extracted from. Records WHAT was extracted
-- and under WHAT LEGAL POSTURE. Does NOT store the source text or file.
-- ============================================================================
create table if not exists corpus_sources (
  id uuid primary key default gen_random_uuid(),

  -- Legal posture (triage outcome — see /api/admin/corpus/extract guardrails)
  source_tier text not null check (source_tier in (
    'public_disclosure',     -- USAID FOIA, EU TED, OECD case studies, etc.
    'own_authored',          -- Founder authored & cleared via separation
    'industry_standard',     -- Generic public methodology
    'cleared_third_party'    -- Other, with explicit attorney review
  )),
  legal_review text not null default 'self' check (legal_review in (
    'self',                  -- Founder self-reviewed
    'counsel',               -- Counsel consulted
    'attorney_reviewed'      -- Formal attorney signoff
  )),

  -- Classification (no identifying content)
  donor text,                -- AECID, EU-NDICI, USAID, World Bank, ...
  sector text,
  geography_class text,      -- 'sub-saharan-africa' | 'latam' | 'mena' | 'sea' | 'europe' | 'global'
  award_size_band text,      -- 'sub-1M' | '1-5M' | '5-20M' | '20M+'
  outcome text check (outcome in ('won', 'lost', 'shortlisted', 'unknown')),
  year int,

  -- Admin reference (free text, never used for generation)
  source_description text,   -- e.g. "AECID 2022 agrifood SLV award abstract (public)"
  public_url text,           -- If publicly disclosed
  source_hash text,          -- SHA-256 of normalized source text (dedupe; no content)

  -- Source disposition
  source_status text not null default 'destroyed' check (source_status in (
    'destroyed',             -- Source file deleted after extraction
    'archived_offline',      -- Held offline outside the platform
    'public_link'            -- Available at public_url
  )),

  added_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists corpus_sources_donor_sector_idx
  on corpus_sources(donor, sector);
create index if not exists corpus_sources_hash_idx
  on corpus_sources(source_hash);

-- ============================================================================
-- proposal_patterns — the extracted abstractions (retrieval target)
-- ============================================================================
-- Each row is a STRUCTURAL PATTERN extracted from one source. Contains
-- NO verbatim source content. Used by:
--   - Opportunity Engine (M1) as few-shot context for ideation
--   - Proposal Writer (M2) as section drafting scaffolds
-- ============================================================================
create table if not exists proposal_patterns (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references corpus_sources(id) on delete cascade,

  -- Retrieval match keys
  donor text,
  sector text,
  geography_class text,
  award_size_band text,

  -- Structural skeleton
  section_inventory jsonb,           -- [{section, pages, weight_pct}, ...]
  toc_archetype text check (toc_archetype in (
    'pilot-scale',
    'capacity-then-impact',
    'platform-aggregator',
    'consortium-led',
    'evidence-then-policy',
    'other'
  )),
  m_and_e_framework text check (m_and_e_framework in (
    'logframe', 'mel-plan', 'results-chain', 'dced', 'other'
  )),

  -- Public indicator IDs only (SDG-X.Y.Z, DCED-X.Y, etc.). NEVER proprietary.
  indicator_set_refs text[] default '{}',

  -- Budget RATIOS, never absolutes. e.g. {personnel: 0.40, travel: 0.15, ...}
  budget_ratios jsonb,

  -- Donor signaling
  evaluation_dimensions text[] default '{}',   -- ['cost realism', 'sustainability', ...]
  signaling_phrases text[] default '{}',       -- Generic concepts, NOT verbatim sentences

  -- Win/loss abstractions (extractor's own words; no source quotes)
  win_archetype text,
  failure_archetype text,

  -- Compliance scaffold (framework refs only)
  compliance_sections_required text[] default '{}',

  -- Free-form structural notes in extractor's voice (max ~200 words)
  structural_notes text,

  -- Embedding for semantic retrieval (1536-dim — text-embedding-3-small or compatible).
  -- Nullable: Phase 1 retrieval uses metadata filters only.
  embedding vector(1536),

  -- Guardrail / review state
  human_reviewed boolean default false,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,

  -- Guardrail flags raised by the extraction endpoint (server-side regex
  -- screens AND model self-attestation). If any are true, the reviewer
  -- MUST clear them before approval.
  flag_proper_nouns boolean default false,
  flag_verbatim_quotes boolean default false,
  flag_absolute_figures boolean default false,
  flag_notes text,                   -- What the screen found, for reviewer

  created_at timestamptz default now()
);

create index if not exists proposal_patterns_donor_sector_idx
  on proposal_patterns(donor, sector);
create index if not exists proposal_patterns_geo_size_idx
  on proposal_patterns(geography_class, award_size_band);
create index if not exists proposal_patterns_reviewed_idx
  on proposal_patterns(human_reviewed) where human_reviewed = true;

-- HNSW index for cosine similarity over embeddings. Created without the
-- embedding column populated (it's nullable) so this is cheap.
create index if not exists proposal_patterns_embedding_idx
  on proposal_patterns using hnsw (embedding vector_cosine_ops);

-- ============================================================================
-- RLS — service-role only (admin-only feature, no public access)
-- ============================================================================
alter table corpus_sources enable row level security;
alter table proposal_patterns enable row level security;

create policy "service_role_corpus_sources"
  on corpus_sources for all using (true) with check (true);
create policy "service_role_proposal_patterns"
  on proposal_patterns for all using (true) with check (true);
