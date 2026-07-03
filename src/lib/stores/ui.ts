import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Shared so the global header's hamburger can toggle the app layout's section drawer.
export const sidebarOpen = writable(false);

// Desktop sidebar collapse (icons-only rail). Persisted per browser.
const COLLAPSE_KEY = 'pt_sidebar_collapsed';
export const sidebarCollapsed = writable<boolean>(browser && localStorage.getItem(COLLAPSE_KEY) === '1');
if (browser) sidebarCollapsed.subscribe((v) => localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'));
