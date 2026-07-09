import { writable } from 'svelte/store';
import { api } from '$lib/api';

// Authoritative AI-interpretation allowance (server computes it, so admins are
// correctly treated as unlimited). Shared across every AiInterpret instance so
// the page makes ONE /ai/usage call regardless of how many modules show it.
export interface AiUsage {
  enabled: boolean; // is an API key configured on the backend
  allowed: boolean; // may this user ask (premium / admin)
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null; // null = unlimited
}

export const aiUsage = writable<AiUsage | null>(null);
let started = false;

export const loadAiUsage = async (force = false): Promise<void> => {
  if (started && !force) return;
  started = true;
  try {
    aiUsage.set(await api<AiUsage>('/ai/usage', { auth: true }));
  } catch {
    aiUsage.set({ enabled: false, allowed: false, used: 0, limit: 0, remaining: 0 });
  }
};

export const setAiUsage = (u: AiUsage): void => aiUsage.set(u);
