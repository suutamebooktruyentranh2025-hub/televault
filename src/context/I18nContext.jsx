import { createContext, useContext, useMemo, useState } from 'react';
import { en, vi } from '../i18n/locales';

const I18nContext = createContext({ t: vi, locale: 'vi', setLocale: () => {} });

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState('vi');
  const value = useMemo(() => {
    const dict = locale === 'en' ? en : vi;
    return {
      locale,
      setLocale,
      t: (key, params = {}) => {
        let text = dict[key] ?? key;
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
        return text;
      },
    };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
