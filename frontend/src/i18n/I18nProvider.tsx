import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { I18nContext, type I18nContextValue, type InterpolationValues } from './context';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  translations,
  type SupportedLocale,
} from './translations';

function detectLocale(): SupportedLocale {
  return DEFAULT_LOCALE;
}

function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<SupportedLocale>(() => detectLocale());

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    setLocaleState(nextLocale);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((prev) => (prev === 'en' ? 'zh-TW' : 'en'));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: string, values?: InterpolationValues) => {
    const template = translations[locale][key] ?? key;
    return interpolate(template, values);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    dateLocale: locale === 'zh-TW' ? 'zh-TW' : 'en-US',
    setLocale,
    toggleLocale,
    t,
  }), [locale, setLocale, t, toggleLocale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}
