/**
 * i18n configuration
 *
 * Add a language by adding to `targetLocales`. The next time you run
 * `npm run i18n:sync`, the missing keys will be auto-translated.
 *
 * Manual overrides: in translations.ts, add `// @manual` after any string
 * to lock it from auto-overwrite.
 */

export const i18nConfig = {
  // Source language — keys are written in this language and translated to others.
  sourceLocale: 'en' as const,

  // Languages to auto-translate into. Add codes here.
  // Supported codes (MyMemory): https://mymemory.translated.net/doc/spec.php
  targetLocales: ['es'] as const,
  // Future expansion suggested by the business plan: ['es', 'fr', 'pt', 'ar']

  // Path to the translations file (relative to repo root).
  translationsPath: 'app/lib/i18n/translations.ts',

  // Optional: email passed to MyMemory for higher daily quota (50k chars/day vs 5k anonymous).
  // Set via env var: I18N_EMAIL=you@example.com
  email: process.env.I18N_EMAIL || '',

  // Translation provider (only "mymemory" supported today; trivial to add more).
  provider: 'mymemory' as const,

  // Sleep between API calls (ms) — be polite to the free service.
  rateLimitMs: 250,
};

export type TargetLocale = typeof i18nConfig.targetLocales[number];
