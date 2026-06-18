import { writable } from 'svelte/store';

// Shared so the global header's hamburger can toggle the app layout's section drawer.
export const sidebarOpen = writable(false);
