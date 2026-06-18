import { derived, writable } from 'svelte/store';
import { browser } from '$app/environment';
import { en } from './locales/en';
import { sw } from './locales/sw';

// Lightweight, dependency-free i18n. Mirrors the theme store: default on the
// server, hydrate from localStorage on the client. English is the source of
// truth — any missing Swahili key falls back to English, then to the key.

export type Locale = 'en' | 'sw';
const KEY = 'pastatrade_locale';
const dicts: Record<Locale, Record<string, string>> = { en, sw };

export const LOCALES: { code: Locale; label: string; name: string }[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'sw', label: 'SW', name: 'Kiswahili' }
];

export const locale = writable<Locale>('en');

const applyLang = (l: Locale) => {
  if (browser) document.documentElement.lang = l;
};

export const initLocale = (): void => {
  if (!browser) return;
  const saved = localStorage.getItem(KEY);
  if (saved === 'en' || saved === 'sw') locale.set(saved);
  applyLang((saved as Locale) ?? 'en');
};

export const setLocale = (l: Locale): void => {
  locale.set(l);
  if (browser) localStorage.setItem(KEY, l);
  applyLang(l);
};

const interpolate = (str: string, params?: Record<string, string | number>): string =>
  params ? str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`)) : str;

// Usage: {$t('nav.pricing')} or {$t('auth.login.continue', { target })}
export const t = derived(locale, ($locale) => (key: string, params?: Record<string, string | number>): string => {
  const s = dicts[$locale][key] ?? dicts.en[key] ?? key;
  return interpolate(s, params);
});
