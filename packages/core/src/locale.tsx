import { editorHost } from './host';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import english from './locales/en.json';

export type Locale = 'fa' | 'en';
const messages: Record<string, string> = english;
export function translate(text: string, locale: Locale) {
  return locale === 'en' ? messages[text] ?? text : text;
}
export function languagePath(locale: Locale, pathname = window.location.pathname) {
  const base = pathname.replace(/\/en(?:\/index\.html|\/)?$/, '/').replace(/index\.html$/, '');
  return `${base.endsWith('/') ? base : `${base}/`}${locale === 'en' ? 'en/' : ''}`;
}
const currentLocale = (): Locale => /\/en(?:\/index\.html|\/)?$/.test(window.location.pathname) ? 'en' : 'fa';

const pageMetadata = {
  fa: {
    title: 'ویرایشگر Markdown راست‌به‌چپ (RTL) و پیش‌نمایش | پارسی‌ورد',
    description: 'Markdown راست‌به‌چپ را راحت ببین و ویرایش کن. پارسی‌ورد ویرایشگر RTL برای فارسی، عربی و متن ترکیبی با پیش‌نمایش قابل ویرایش و خروجی Word و PDF است.',
  },
  en: {
    title: 'RTL Markdown Editor & Live Preview | ParsiWord',
    description: 'View and edit right-to-left Markdown with an editable live preview. A free RTL Markdown editor for Persian, Arabic and mixed RTL/LTR text, with Word and PDF export.',
  },
};
const defaultValue = {
  locale: 'fa' as Locale,
  dir: 'rtl' as 'rtl' | 'ltr',
  t: (text: string) => text,
  number: (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString('fa-IR', options),
  setLocale: (_locale: Locale) => {},
};
const LocaleContext = createContext(defaultValue);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, changeLocale] = useState(() => editorHost().locale ?? currentLocale());
  const setLocale = useCallback((next: Locale) => {
    editorHost().localeChanged?.(next);
    if (editorHost().kind !== 'vscode' && /^https?:$/.test(window.location.protocol)) history.pushState(null, '', languagePath(next));
    changeLocale(next);
  }, []);
  useEffect(() => {
    const onPopState = () => changeLocale(currentLocale());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'fa' ? 'rtl' : 'ltr';
    if (editorHost().kind === 'vscode') return;
    const meta = pageMetadata[locale];
    document.title = meta.title;
    const setMeta = (selector: string, content: string) => document.querySelector(selector)?.setAttribute('content', content);
    setMeta('meta[name="description"]', meta.description);
    for (const prefix of ['og', 'twitter']) {
      setMeta(`meta[${prefix === 'og' ? 'property' : 'name'}="${prefix}:title"]`, meta.title);
      setMeta(`meta[${prefix === 'og' ? 'property' : 'name'}="${prefix}:description"]`, meta.description);
    }
    const canonical = `https://soroushjm.github.io/ParsiWord/${locale === 'en' ? 'en/' : ''}`;
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
    setMeta('meta[property="og:url"]', canonical);
    setMeta('meta[property="og:locale"]', locale === 'fa' ? 'fa_IR' : 'en_US');
    const schema = document.querySelector('script[type="application/ld+json"]');
    if (schema?.textContent) {
      const data = JSON.parse(schema.textContent);
      schema.textContent = JSON.stringify({ ...data, url: canonical, inLanguage: locale, description: meta.description });
    }
  }, [locale]);
  const value = useMemo(() => ({
    locale, dir: locale === 'fa' ? 'rtl' as const : 'ltr' as const,
    t: (text: string) => translate(text, locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => value.toLocaleString(locale === 'fa' ? 'fa-IR' : 'en-US', options),
    setLocale,
  }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
