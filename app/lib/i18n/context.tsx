'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import translations, { type TranslationKey } from './translations';
import { detectLocale, setLocale as persistLocale, type Locale } from './detect';

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

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocaleState(detectLocale());
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[locale]?.[key] || translations.en[key] || key;
  }, [locale]);

  // Prevent hydration mismatch — render in English until client mounts
  if (!mounted) {
    return (
      <I18nContext.Provider value={{ locale: 'en', setLocale, t: (key) => translations.en[key] || key }}>
        {children}
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
