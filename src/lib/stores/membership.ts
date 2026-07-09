import { writable } from 'svelte/store';
import { api } from '$lib/api';

// Plan access summary from the backend. The frontend NEVER decides access on its
// own — it mirrors GET /me/features and gates UI; the backend still enforces.
export interface Membership {
  plan: string;
  plan_name: string;
  badge: string | null;
  status: string;
  is_admin: boolean;
  phone: string | null;
  current_period_end: string | null;
  days_left: number | null;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  usage: { watchlist_items: number; alerts: number; ai_interpretations?: number };
}

export const membership = writable<Membership | null>(null);
export const membershipReady = writable(false);

export const loadMembership = async (): Promise<void> => {
  try {
    membership.set(await api<Membership>('/me/features', { auth: true }));
  } catch {
    membership.set(null);
  } finally {
    membershipReady.set(true);
  }
};

export const clearMembership = (): void => {
  membership.set(null);
  membershipReady.set(false);
};

// Reactive-friendly pure helpers (use with $membership in components).
export const hasFeature = (m: Membership | null, key: string): boolean => !!m && (m.is_admin || m.features[key] === true);
export const limitOf = (m: Membership | null, key: string): number | null => {
  if (!m) return null;
  if (m.is_admin) return null;
  return m.limits[key] ?? null;
};
export const reachedLimit = (m: Membership | null, limitKey: string, usageKey: keyof Membership['usage']): boolean => {
  const lim = limitOf(m, limitKey);
  if (lim === null) return false;
  return (m?.usage[usageKey] ?? 0) >= lim;
};
