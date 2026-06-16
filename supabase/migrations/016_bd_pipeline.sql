-- ============================================================================
-- Migration 016 — BD pipeline stages (Step 1 → 2 → 3)
-- ============================================================================
-- The BD scanner becomes an explicit 3-stage pipeline:
--
--   Step 1 — Verify tenders.   The tender-fit AI pre-screens every ingested
--     tender; the operator confirms the good ones (Verify) or discards them
--     (Reject). Only verified tenders flow to Step 2.
--
--   Step 2 — Match.   For each verified tender, surface ranked company
--     candidates (≥5 ideally). The operator can trigger discovery on demand.
--     Selecting a company moves the pair to Step 3.
--
--   Step 3 — Pursue.   Driven by the existing `tender_matches.status`
--     ('pursuing' / 'won' / 'lost'); no schema change needed there.
--
-- This migration adds the Step-1 verification state to `tenders`.
-- ============================================================================

-- bd_status: where the tender sits in the human review pipeline.
--   'pending'  — passed ingestion + (usually) AI-scored, awaiting operator review
--   'verified' — operator confirmed it's a real opportunity → eligible for Step 2
--   'rejected' — operator discarded it → hidden from the default views
alter table tenders
  add column if not exists bd_status text not null default 'pending';

alter table tenders
  add column if not exists bd_status_at timestamptz;

-- Constrain to the known states (idempotent: drop+recreate the check).
do $$
begin
  if exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'tenders' and constraint_name = 'tenders_bd_status_check'
  ) then
    alter table tenders drop constraint tenders_bd_status_check;
  end if;
  alter table tenders
    add constraint tenders_bd_status_check
    check (bd_status in ('pending', 'verified', 'rejected'));
end $$;

-- Filter index for the stage views (e.g. WHERE bd_status = 'verified').
create index if not exists idx_tenders_bd_status on tenders (bd_status);
