-- ============================================================================
-- Migration 015 — BD matcher recalibration
-- ============================================================================
-- Implements the three-stage recalibration:
--
--  Stage 1 — Tender-fit gate. Before matching companies, score whether the
--    tender fits Cooperatr at all (sectors + founder geography/experience +
--    deal band). Below-floor tenders skip company matching entirely but record
--    why (hard-skip + record). New columns on `tenders`.
--
--  Stage 2 — Spanish-SME-first + needs-us recalibration. No schema change —
--    `needs_us` lives inside the existing fit_dimensions jsonb.
--
--  Stage 3 — Opportunity-engine expansion. For high-fit matches, a generated
--    impact-expansion (consortium partners / impact investors / blended
--    finance). Stored on `tender_matches.opportunity_expansion`.
--
--  Feedback loop — per-match feedback (thumbs + free text) so the operator can
--    recalibrate the pipeline over time. New columns on `tender_matches`.
--
--  Sector add — `capacity_building` (founder CV: capacity building is a named
--    competency; the business plan lists institutional strengthening / TA).
-- ============================================================================

-- ─── 1. capacity_building sector ─────────────────────────────────────────────
insert into sectors (slug, label, keywords) values
  ('capacity_building', 'Capacity Building & Institutional Strengthening',
   array[
     'capacity building', 'capacity development', 'institutional strengthening',
     'institutional capacity', 'technical assistance', 'technical advisory',
     'training', 'train the trainer', 'organizational development',
     'organizational capacity', 'systems strengthening', 'knowledge transfer',
     'curriculum development', 'workforce development', 'skills development',
     'change management', 'mentoring', 'coaching', 'public administration reform',
     'civil service reform', 'public sector capacity', 'monitoring and evaluation',
     'm&e', 'learning and development', 'organisational development',
     'capacity strengthening', 'institution building', 'twinning'
   ])
on conflict (slug) do nothing;

-- ─── 2. Stage 1 — tender-fit columns on tenders ──────────────────────────────
alter table tenders
  add column if not exists tender_fit_score numeric,        -- 0-100
  add column if not exists tender_fit_reasons jsonb,         -- {sector_fit, geography_fit, deal_band_fit, reasons[]}
  add column if not exists tender_fit_verdict text,          -- 'pursue' | 'maybe' | 'skip'
  add column if not exists tender_fit_at timestamptz;

create index if not exists tenders_fit_score_idx on tenders(tender_fit_score desc);

-- ─── 3. Stage 3 + feedback columns on tender_matches ─────────────────────────
alter table tender_matches
  add column if not exists opportunity_expansion jsonb,      -- {consortium_partners[], impact_investors[], blended_finance_angle, expanded_impact}
  add column if not exists feedback text,                    -- operator free-text feedback
  add column if not exists feedback_signal text,             -- 'up' | 'down' | null
  add column if not exists feedback_at timestamptz;

create index if not exists tender_matches_feedback_idx
  on tender_matches(feedback_at desc)
  where feedback is not null;
