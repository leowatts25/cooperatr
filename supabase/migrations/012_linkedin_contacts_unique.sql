-- ============================================================================
-- Migration 012: idempotent LinkedIn contacts import
-- ============================================================================
-- The /api/admin/linkedin/import endpoint upserts every row from the admin's
-- Connections.csv. The natural identity for a LinkedIn connection is the
-- profile URL — a person can re-export and re-import without creating
-- duplicates as long as their URL hasn't changed.
--
-- Existing rows without a LinkedIn URL (rare — LinkedIn always emits the URL
-- column) skip the upsert path and stay as plain inserts. The partial unique
-- index lets multiple owner_id=null OR linkedin_url=null rows coexist.
--
-- RLS already covers linkedin_contacts via the service_role_linkedin_contacts
-- policy from migration 010. Adding a unique index does not require a new
-- policy.
-- ============================================================================

-- First, drop any prior unique constraint or partial index (idempotent across
-- re-runs and earlier attempts).
alter table linkedin_contacts
  drop constraint if exists linkedin_contacts_owner_url_unique;
drop index if exists linkedin_contacts_owner_url_uidx;

-- Add a regular UNIQUE constraint. Postgres treats NULL values as DISTINCT in
-- unique constraints by default, so rows with linkedin_url=NULL (rare — LinkedIn
-- always emits the URL column) still coexist. The upsert ON CONFLICT target
-- requires a real constraint (a partial unique index doesn't qualify), hence
-- the constraint form here rather than `create unique index ... where ...`.
alter table linkedin_contacts
  add constraint linkedin_contacts_owner_url_unique
  unique (owner_id, linkedin_url);
