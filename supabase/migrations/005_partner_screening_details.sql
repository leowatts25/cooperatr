-- ============================================
-- Add per-framework rationales + recommendations
-- to the partner screening output
-- ============================================
alter table partners add column if not exists sanctions_detail text;
alter table partners add column if not exists csddd_detail text;
alter table partners add column if not exists gdpr_detail text;
alter table partners add column if not exists hrdd_detail text;
alter table partners add column if not exists recommendations jsonb default '[]'::jsonb;
