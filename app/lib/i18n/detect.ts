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

// Server-side: parse the Accept-Language header.
// Picks 'es' if Spanish appears with a higher q-value than English, otherwise 'en'.
export function detectLocaleFromHeader(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return 'en';
  let bestEs = 0;
  let bestEn = 0;
  for (const part of acceptLanguage.split(',')) {
    const [tagRaw, ...params] = part.trim().split(';');
    const tag = tagRaw.toLowerCase();
    const qParam = params.find(p => p.trim().startsWith('q='));
    const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
    if (Number.isNaN(q)) continue;
    if (tag.startsWith('es') && q > bestEs) bestEs = q;
    else if (tag.startsWith('en') && q > bestEn) bestEn = q;
  }
  return bestEs > bestEn ? 'es' : 'en';
}

export function setLocale(locale: Locale) {
  localStorage.setItem('cooperatr_locale', locale);
}
