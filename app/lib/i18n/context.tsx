'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations, { type TranslationKey } from './translations';
import { setLocale as persistLocale, type Locale } from './detect';

export type { TranslationKey };

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({
  children,
  initialLocale = 'en',
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // After mount, prefer the user's persisted choice if it differs from the
  // server-detected initial locale. We can't read localStorage during render
  // because it would mismatch the server-rendered HTML.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('cooperatr_locale');
    if ((stored === 'en' || stored === 'es') && stored !== locale) {
      setLocaleState(stored);
    }
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[locale]?.[key] || translations.en[key] || key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
