-- ============================================================================
-- Migration 009: Corpus extensions discovered during initial extractions
-- ============================================================================
-- During the first 7 extractions, four pattern dimensions emerged that
-- weren't in the original schema. Adding them as nullable columns so the
-- existing corpus rows remain valid; new extractions populate these where
-- relevant.
-- ============================================================================

-- engagement_type: distinguishes one-time project from multi-year services
-- from coalition/platform engagements. Important for the Opportunity Engine
-- because the same sector/geography can support all three shapes and the
-- retrieved pattern should match the prospect's engagement-shape expectation.
alter table proposal_patterns
  add column if not exists engagement_type text check (engagement_type in (
    'one-time-project',           -- Single award, defined activity period (typical USAID)
    'multi-year-services',        -- Ongoing services contract (typical corporate climate advisory)
    'multi-stakeholder-coalition',-- Coalition convenor / platform engagement
    'fund-of-funds',              -- Investment fund with portfolio (impact investor archetype)
    'other'
  ));

-- donor_archetype: free-text refinement of the donor field for cases where
-- the donor type matters more than the specific donor name. e.g. for a
-- corporate FMCG single-client services proposal, donor_archetype captures
-- "Global FMCG multinational with SBTi-aligned net-zero target".
alter table proposal_patterns
  add column if not exists donor_archetype text;

-- daily_rate_band_USD: senior-staff daily-rate band (free text like "1085-2032")
-- preserved as commercial-services pricing benchmark intelligence. Useful for
-- BD pricing calibration when Cooperatr designs its own service offerings.
alter table proposal_patterns
  add column if not exists daily_rate_band_usd text;

-- co_funding_sources_identified: array of co-funder archetype tags pulled
-- from the source. Especially valuable for coalition patterns where naming
-- the relevant co-funding ecosystem is part of the win archetype.
alter table proposal_patterns
  add column if not exists co_funding_sources_identified text[] default '{}';

create index if not exists proposal_patterns_engagement_type_idx
  on proposal_patterns(engagement_type);
create index if not exists proposal_patterns_donor_archetype_idx
  on proposal_patterns(donor_archetype);

comment on column proposal_patterns.engagement_type is
  'Project/services/coalition/fund shape. Matches retrieval to prospect engagement-shape expectation.';
comment on column proposal_patterns.donor_archetype is
  'Free-text refinement of donor field for funder-type matching beyond specific donor name.';
comment on column proposal_patterns.daily_rate_band_usd is
  'Senior-staff daily-rate band as commercial pricing benchmark intelligence.';
comment on column proposal_patterns.co_funding_sources_identified is
  'Array of co-funder archetype tags - valuable for coalition pattern matching.';
