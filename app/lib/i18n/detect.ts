export type Locale = 'en' | 'es';

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  // Check localStorage first
  const stored = localStorage.getItem('cooperatr_locale');
  if (stored === 'en' || stored === 'es') return stored;

  // Auto-detect from browser
  const lang = navigator.language || '';
  if (lang.startsWith('es')) return 'es';

  return 'en';
}

export function setLocale(locale: Locale) {
  localStorage.setItem('cooperatr_locale', locale);
}
