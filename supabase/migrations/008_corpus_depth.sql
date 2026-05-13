-- ============================================================================
-- Migration 008: Deepen the corpus extraction
-- ============================================================================
-- 007 was scaffolded for the worst-case legal posture (verbatim-strip,
-- minimal text fields). Recalibrated: we now want rich methodological
-- detail — sector dynamics, problem diagnosis, intervention logic,
-- specific indicators, partnership architecture. Proper names stay out;
-- everything else (sector specifics, country-level geography, methodology
-- depth) is in scope.
--
-- Adds 11 columns to proposal_patterns. All nullable; safe to apply on
-- a corpus that already has rows from 007.
-- ============================================================================

alter table proposal_patterns
  add column if not exists side_perspective text
    check (side_perspective in ('donor', 'bidder', 'both'));

-- Sector & geography depth (free text in extractor's own voice)
alter table proposal_patterns add column if not exists sector_context text;
alter table proposal_patterns add column if not exists geography_context text;
alter table proposal_patterns add column if not exists value_chain_analysis text;

-- The actual logic
alter table proposal_patterns add column if not exists problem_diagnosis text;
alter table proposal_patterns add column if not exists intervention_logic text;
alter table proposal_patterns add column if not exists partnership_architecture text;
alter table proposal_patterns add column if not exists adaptive_management_approach text;

-- Structured methodology + indicators + risks
alter table proposal_patterns add column if not exists methodology_details jsonb;
alter table proposal_patterns add column if not exists specific_indicators jsonb;
alter table proposal_patterns add column if not exists risk_assumptions jsonb;

-- Relax structural_notes from "200-word ceiling" to a real narrative field.
-- (No DDL change — the column was already text. Documenting the intent.)

-- Add 'south-asia' as a recognized geography_class. geography_class is
-- free text in the schema, but we document the canonical values:
--   sub-saharan-africa | latam | mena | sea | south-asia | europe | global
-- New extractions should use 'south-asia' for South Asia rather than 'sea'.

comment on column proposal_patterns.side_perspective is
  'donor = pattern extracted from a donor RFP/SOO; bidder = from a proposal response; both = combined.';
comment on column proposal_patterns.sector_context is
  'Sector dynamics, market failures, value chain issues. Extractor''s words, no proper names.';
comment on column proposal_patterns.geography_context is
  'Country/region political economy, host-government dynamics, donor coordination. Country names OK.';
comment on column proposal_patterns.problem_diagnosis is
  'Specific problem definition + why it persists. Extractor''s analysis.';
comment on column proposal_patterns.intervention_logic is
  'Theory of change in operational detail: levers, mechanisms, staged approach.';
comment on column proposal_patterns.methodology_details is
  'Structured methodology: phases, components, deliverables, decision rules.';
comment on column proposal_patterns.specific_indicators is
  'Indicator framework with definitions, targets, collection methods.';
comment on column proposal_patterns.risk_assumptions is
  'Risk register + mitigation logic + critical assumptions.';
