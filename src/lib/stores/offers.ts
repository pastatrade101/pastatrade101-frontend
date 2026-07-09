import { writable } from 'svelte/store';
import { api } from '$lib/api';

// Live pricing offers mirrored from GET /offers. An offer is a TEMPORARY price
// override — the real plan price is untouched. The backend only returns offers
// that are live right now, and it re-validates at checkout, so this is display-only.
export interface Offer {
  plan_id: string;
  billing_interval: string; // 'monthly' | 'yearly'
  offer_price: number;
  original_price: number;
  offer_label: string;
  starts_at: string;
  ends_at: string;
}

export const offers = writable<Offer[]>([]);

export const loadOffers = async (): Promise<void> => {
  try {
    offers.set((await api<{ items: Offer[] }>('/offers')).items ?? []);
  } catch {
    offers.set([]); // offers are optional — never block the pricing page
  }
};

/**
 * The offer to apply for a plan+interval, re-checked against the clock so an
 * offer that lapses while the page is open (past its ends_at) stops applying
 * even before a refetch.
 */
export const activeOffer = (list: Offer[], planId: string, interval: 'monthly' | 'yearly'): Offer | null => {
  const now = Date.now();
  const match = list.find(
    (o) =>
      o.plan_id === planId &&
      o.billing_interval === interval &&
      new Date(o.starts_at).getTime() <= now &&
      new Date(o.ends_at).getTime() > now &&
      Number(o.offer_price) < Number(o.original_price)
  );
  return match ?? null;
};
