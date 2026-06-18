import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';
const KEY = 'pastatrade_theme';

const read = (): Theme => {
  if (!browser) return 'dark';
  return (localStorage.getItem(KEY) as Theme) || 'dark';
};

export const theme = writable<Theme>(read());

const apply = (t: Theme) => {
  if (!browser) return;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(KEY, t);
};

/** Sync the store + <html data-theme> on first load (the inline script in app.html sets it pre-paint). */
export const initTheme = () => {
  const t = read();
  apply(t);
  theme.set(t);
};

export const setTheme = (t: Theme) => {
  apply(t);
  theme.set(t);
};

export const toggleTheme = () => theme.update((t) => {
  const next: Theme = t === 'dark' ? 'light' : 'dark';
  apply(next);
  return next;
});
