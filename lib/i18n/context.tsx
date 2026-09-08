'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Language } from '@/types';
import en from './en.json';
import ar from './ar.json';

type Translations = typeof en;
type TranslationKey = keyof Translations;

interface I18nContextType {
  locale: Language;
  t: (section: TranslationKey, key: string) => string;
  setLocale: (lang: Language) => void;
  isRTL: boolean;
}

const dictionaries = { en, ar } as Record<Language, Translations>;

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Language | null;
    if (saved === 'ar' || saved === 'en') {
      setLocaleState(saved);
      applyDirection(saved);
    }
  }, []);

  const applyDirection = (lang: Language) => {
    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
  };

  const setLocale = (lang: Language) => {
    setLocaleState(lang);
    localStorage.setItem('locale', lang);
    applyDirection(lang);
  };

  const t = (section: TranslationKey, key: string): string => {
    const dict = dictionaries[locale];
    const sectionDict = dict[section] as Record<string, string> | undefined;
    return sectionDict?.[key] ?? `${section}.${key}`;
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
