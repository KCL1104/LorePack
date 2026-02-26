import { createContext } from 'react';

import type { SupportedLocale } from './translations';

export type InterpolationValues = Record<string, string | number>;

export interface I18nContextValue {
  locale: SupportedLocale;
  dateLocale: string;
  setLocale: (locale: SupportedLocale) => void;
  toggleLocale: () => void;
  t: (key: string, values?: InterpolationValues) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
