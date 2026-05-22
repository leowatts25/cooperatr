-- ============================================================================
-- Migration 011: add partner_stack and risks columns to tender_matches
-- ============================================================================
-- The BD matcher (Sonnet 4.6 structured tool-use) returns an optional list of
-- complementary partners the SME would need (consortium picture) and a list of
-- concrete risks. Migration 010 stored only score / rationale / fit_dimensions;
-- this extends the table so we can persist the full LLM output.
--
-- RLS: tender_matches already has `enable row level security` + the
-- `service_role_tender_matches` policy from migration 010. ALTER TABLE keeps
-- that policy attached — no new policy needed for added columns.
-- ============================================================================

alter table tender_matches
  add column if not exists partner_stack text[],
  add column if not exists risks text[];
