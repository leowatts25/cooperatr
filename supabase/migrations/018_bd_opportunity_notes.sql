-- ============================================================================
-- Migration 018 — operator notes + AI feedback on an opportunity (tender)
-- ============================================================================
-- The BD operator can jot freeform notes on a bid (context, intel, strategy,
-- partner thoughts). On demand, Claude reviews the opportunity + those notes
-- and returns strategic BD feedback, stored alongside.
-- ============================================================================

alter table tenders add column if not exists bd_notes text;
alter table tenders add column if not exists bd_ai_feedback text;
alter table tenders add column if not exists bd_ai_feedback_at timestamptz;
