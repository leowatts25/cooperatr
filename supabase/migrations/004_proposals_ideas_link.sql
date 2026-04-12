-- ============================================
-- Migration 004: Link proposals to ideas + sector specialist metadata
-- ============================================
-- Discovery Engine replaced the old `opportunities` table with `ideas`.
-- Proposals now originate from an idea, so add an idea_id column and drop
-- the hard dependency on opportunity_id. Also track which sector specialist
-- generated the proposal for analytics and future iteration.

alter table proposals add column if not exists idea_id uuid references ideas(id) on delete set null;
alter table proposals add column if not exists sector_specialist text;
alter table proposals add column if not exists specialist_rationale text;

create index if not exists idx_proposals_idea_id on proposals(idea_id);
