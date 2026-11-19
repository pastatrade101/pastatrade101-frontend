import { writable } from 'svelte/store';
import { api } from '$lib/api';

// Whether the signed-in account has a share of the rotation sleeve to look at (the admin
// links it). Only decides whether the menu shows "My investment"; the backend still
// returns nothing but the account's own share.
export const investmentLinked = writable(false);

export const loadInvestmentLinked = async (): Promise<void> => {
  try {
    const r = await api<{ linked: boolean }>('/me/investments/linked', { auth: true });
    investmentLinked.set(r.linked);
  } catch {
    investmentLinked.set(false);
  }
};

export const clearInvestmentLinked = (): void => investmentLinked.set(false);
