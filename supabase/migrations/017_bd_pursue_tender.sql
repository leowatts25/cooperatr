-- ============================================================================
-- Migration 017 — pursue at the OPPORTUNITY (tender) level
-- ============================================================================
-- The BD operator advances a BID, not a (tender × company) pair — they may not
-- have chosen a partner yet. So the tender's own lifecycle gains the late stages
-- that previously only lived on tender_matches.status:
--
--   pending → verified → pursuing → won | lost   (rejected = discarded)
--
-- Companies remain CANDIDATES on a pursued bid (tender_matches), optionally
-- tagged as the preferred partner (tender_matches.status='pursuing') — never
-- required to advance the opportunity.
-- ============================================================================

alter table tenders drop constraint if exists tenders_bd_status_check;

alter table tenders
  add constraint tenders_bd_status_check
  check (bd_status in ('pending', 'verified', 'pursuing', 'won', 'lost', 'rejected'));
