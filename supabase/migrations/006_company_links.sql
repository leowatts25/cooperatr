-- ============================================
-- Add website and LinkedIn URL fields to companies
-- so the Discovery Engine can pull richer context.
-- ============================================
alter table companies add column if not exists website text;
alter table companies add column if not exists linkedin_url text;
