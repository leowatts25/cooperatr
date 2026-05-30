// ============================================================================
// Tender translation — auto-translate TED foreign-language tenders
// ============================================================================
// TED returns notices in the buyer's local language (Polish, Italian, Dutch,
// German, Bulgarian, ...). Scanning the BD report in 8 languages is unusable.
//
// This module translates title + description into one or more target languages
// via MyMemory's free API (50K words/day with email, no ongoing fees) and
// stores the result in tenders.translations (JSONB):
//
//   translations = {
//     "en": { "title": "...", "description": "..." },
//     "es": { "title": "...", "description": "..." },
//     ...
//   }
//
// Adding a new target language is one line in DEFAULT_TARGETS — no schema or
// UI changes (the dashboard reads translations[user_locale] with fallback).
//
// Cost: $0 ongoing. MyMemory has no API key and no charges. Set I18N_EMAIL
// to bump quota from 5K → 50K words/day.
// ============================================================================

import { createServerClient } from '@/app/lib/supabase';

type Supabase = ReturnType<typeof createServerClient>;

// Add 'es', 'fr', etc. here and the next cron run will start translating
// into the new language. No migration or UI changes required.
const DEFAULT_TARGETS = ['en'] as const;
type LanguageCode = string;

// Map ISO 3166-1 alpha-3 country codes → ISO 639-1 language codes for
// MyMemory. Only common EU + reference countries; unknown maps to autodetect.
const COUNTRY_TO_LANG: Record<string, string> = {
  BGR: 'bg', HRV: 'hr', CZE: 'cs', DNK: 'da', NLD: 'nl', EST: 'et',
  FIN: 'fi', FRA: 'fr', DEU: 'de', GRC: 'el', HUN: 'hu', ITA: 'it',
  LVA: 'lv', LTU: 'lt', MLT: 'mt', POL: 'pl', PRT: 'pt', ROU: 'ro',
  SVK: 'sk', SVN: 'sl', ESP: 'es', SWE: 'sv', AUT: 'de', BEL: 'nl',
  CYP: 'el', LUX: 'fr', NOR: 'no', ISL: 'is', CHE: 'de', UKR: 'uk',
  RUS: 'ru', TUR: 'tr',
  // Native-English
  GBR: 'en', IRL: 'en', USA: 'en', CAN: 'en', AUS: 'en', NZL: 'en',
};

const DESCRIPTION_TRANSLATE_CAP = 500;   // chars, enough for dashboard preview
const TITLE_TRANSLATE_CAP = 300;
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const POLITE_DELAY_MS = 300;

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

interface TranslationBlock {
  title?: string;
  description?: string;
}
type Translations = Record<LanguageCode, TranslationBlock>;

export interface TranslationResult {
  ok: boolean;
  translated: number;            // tenders where at least one language was added
  skippedNoSource: number;       // can't detect source language, no text, etc.
  skippedAlreadyComplete: number;
  errors: string[];
  charsUsed: number;
  languagesProcessed: string[];
}

export async function runTranslationForRecentTenders(
  supabase: Supabase,
  opts: {
    sinceDays?: number;
    maxTenders?: number;
    targetLanguages?: readonly string[];
  } = {},
): Promise<TranslationResult> {
  const sinceDays = opts.sinceDays ?? 14;
  const maxTenders = opts.maxTenders ?? 60;
  const targetLanguages = (opts.targetLanguages ?? DEFAULT_TARGETS) as string[];
  const since = new Date(Date.now() - sinceDays * 86400_000).toISOString();

  // Load passing tenders that don't yet have ALL the target languages.
  // We pull a slightly oversized window then filter in JS so callers can
  // change targetLanguages without a schema change.
  const { data, error } = await supabase
    .from('tenders')
    .select('id, title, description, country, translations, source_language')
    .eq('passes_filter', true)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(maxTenders * 2);
  if (error) {
    return {
      ok: false, translated: 0, skippedNoSource: 0, skippedAlreadyComplete: 0,
      errors: [`load: ${error.message}`], charsUsed: 0, languagesProcessed: [...targetLanguages],
    };
  }

  const rows = (data || []) as Array<{
    id: string;
    title: string | null;
    description: string | null;
    country: string | null;
    translations: Translations | null;
    source_language: string | null;
  }>;

  // Trim to rows that are MISSING at least one target language
  const needsWork = rows.filter((r) => {
    const existing = (r.translations || {}) as Translations;
    return targetLanguages.some((lang) => !existing[lang]);
  }).slice(0, maxTenders);

  let translated = 0;
  let skippedNoSource = 0;
  let skippedAlreadyComplete = 0;
  let charsUsed = 0;
  const errors: string[] = [];

  for (const t of rows) {
    if (!needsWork.find((r) => r.id === t.id)) {
      skippedAlreadyComplete += 1;
      continue;
    }
    const countryUpper = (t.country || '').toUpperCase();
    const sourceLang = t.source_language || COUNTRY_TO_LANG[countryUpper];

    if (!sourceLang) {
      skippedNoSource += 1;
      continue;
    }

    const existing = (t.translations || {}) as Translations;
    const next: Translations = { ...existing };
    let didAny = false;

    for (const targetLang of targetLanguages) {
      if (existing[targetLang]) continue; // already translated to this lang

      // Same-language: just copy the original text into translations[lang]
      if (targetLang === sourceLang) {
        next[targetLang] = {
          title: t.title || undefined,
          description: t.description || undefined,
        };
        didAny = true;
        continue;
      }

      try {
        const titleText = (t.title || '').slice(0, TITLE_TRANSLATE_CAP).trim();
        const descriptionText = (t.description || '').slice(0, DESCRIPTION_TRANSLATE_CAP).trim();

        const block: TranslationBlock = {};
        if (titleText) {
          block.title = await translateMyMemory(titleText, sourceLang, targetLang);
          charsUsed += titleText.length;
          await sleep(POLITE_DELAY_MS);
        }
        if (descriptionText) {
          block.description = await translateMyMemory(descriptionText, sourceLang, targetLang);
          charsUsed += descriptionText.length;
          await sleep(POLITE_DELAY_MS);
        }
        next[targetLang] = block;
        didAny = true;
      } catch (err) {
        errors.push(`${t.id} [${sourceLang}→${targetLang}]: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (didAny) {
      const { error: upErr } = await supabase
        .from('tenders')
        .update({
          translations: next,
          source_language: sourceLang,
          translated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      if (upErr) {
        errors.push(`update ${t.id}: ${upErr.message}`);
      } else {
        translated += 1;
      }
    }
  }

  return {
    ok: errors.length === 0 || translated > 0,
    translated,
    skippedNoSource,
    skippedAlreadyComplete,
    errors,
    charsUsed,
    languagesProcessed: [...targetLanguages],
  };
}

// ----------------------------------------------------------------------------
// MyMemory translation — free, no API key, 50K words/day with email
// ----------------------------------------------------------------------------

async function translateMyMemory(text: string, source: string, target: string): Promise<string> {
  const params = new URLSearchParams({ q: text, langpair: `${source}|${target}` });
  const email = process.env.I18N_EMAIL;
  if (email) params.set('de', email);
  const url = `${MYMEMORY_URL}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number | string;
  };
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error(`MyMemory returned no translation`);

  let out = translated
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Strip XLIFF-style placeholder tags MyMemory's translation memory leaks
  out = out
    .replace(/<\/?(?:g|x|bx|ex|bpt|ept|ph|it|mrk)\b[^>]*\/?>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
