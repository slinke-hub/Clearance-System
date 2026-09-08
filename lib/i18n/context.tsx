'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Language } from '@/types';
import en from './en.json';
import ar from './ar.json';

type Translations = typeof en;
type TranslationKey = keyof Translations;

interface I18nContextType {
  locale: Language;
  t: (section: TranslationKey, key: string, values?: Record<string, string | number>) => string;
  setLocale: (lang: Language) => void;
  isRTL: boolean;
}

const dictionaries = { en, ar } as Record<Language, Translations>;

const I18nContext = createContext<I18nContextType | null>(null);

function applyDirection(lang: Language) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.setAttribute('dir', dir);
  document.documentElement.setAttribute('lang', lang);
}

interface I18nProviderProps {
  children: React.ReactNode;
  initialLocale?: Language;
}

function persistLocale(lang: Language) {
  localStorage.setItem('locale', lang);
  document.cookie = `locale=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function I18nProvider({ children, initialLocale = 'en' }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Language>(initialLocale);

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Language | null;
    if (saved === 'ar' || saved === 'en') {
      // Restore the browser-only preference after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLocaleState(saved);
      persistLocale(saved);
      applyDirection(saved);
    } else {
      applyDirection(initialLocale);
    }
  }, [initialLocale]);

  const setLocale = (lang: Language) => {
    setLocaleState(lang);
    persistLocale(lang);
    applyDirection(lang);
  };

  const t = (
    section: TranslationKey,
    key: string,
    values: Record<string, string | number> = {},
  ): string => {
    const dict = dictionaries[locale];
    const sectionDict = dict[section] as Record<string, string> | undefined;
    const template = sectionDict?.[key] ?? `${section}.${key}`;

    return Object.entries(values).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };

  return (
    <I18nContext.Provider value={{ locale, t, setLocale, isRTL: locale === 'ar' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
