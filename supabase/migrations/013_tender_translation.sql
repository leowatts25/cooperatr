-- ============================================================================
-- Migration 013: Tender translations (multi-language, JSONB-backed)
-- ============================================================================
-- TED notices come back in the buyer's local language. The BD report becomes
-- unreadable when you skim 20 rows in 8 different languages.
--
-- Store translations in a single JSONB column so adding new target languages
-- never requires a schema change:
--
--   translations = {
--     "en": { "title": "...", "description": "..." },
--     "es": { "title": "...", "description": "..." },
--     "fr": { ... }     -- added later, no migration needed
--   }
--
-- The translation cron fills this via MyMemory (free, 50K words/day with
-- email). UI reads translations[user_locale]?.title, falling back to
-- translations.en then to the original title.
-- ============================================================================

alter table tenders
  add column if not exists translations jsonb not null default '{}'::jsonb,
  add column if not exists source_language text,
  add column if not exists translated_at timestamptz;

-- Quick lookup: which passing tenders still need translation?
-- Used by the daily translation cron to find work without scanning everything.
create index if not exists tenders_needs_translation_idx
  on tenders(passes_filter)
  where passes_filter = true and translations = '{}'::jsonb;

-- JSONB index for future per-language queries (e.g. "tenders missing es")
create index if not exists tenders_translations_idx
  on tenders using gin (translations);
