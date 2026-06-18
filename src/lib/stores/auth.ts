import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { api, clearToken, getToken, setToken } from '$lib/api';

export interface AuthUser {
  sub: string;
  email: string;
  role: 'subscriber' | 'analyst' | 'admin';
  name: string;
}

export const user = writable<AuthUser | null>(null);
export const authReady = writable(false);

interface AuthResult {
  token: string;
  user: AuthUser;
}

const applySession = (result: AuthResult) => {
  setToken(result.token);
  user.set(result.user);
};

export const login = async (email: string, password: string) => {
  const result = await api<AuthResult>('/auth/login', { method: 'POST', body: { email, password } });
  applySession(result);
};

export const register = async (email: string, password: string, full_name?: string) => {
  const result = await api<AuthResult>('/auth/register', { method: 'POST', body: { email, password, full_name } });
  applySession(result);
};

export const logout = () => {
  clearToken();
  user.set(null);
};

// Restore session on first load by validating the stored token against /auth/me.
export const initAuth = async () => {
  if (!browser) return;
  const token = getToken();
  if (!token) {
    authReady.set(true);
    return;
  }
  try {
    const me = await api<AuthUser>('/auth/me', { auth: true });
    user.set(me);
  } catch {
    clearToken();
    user.set(null);
  } finally {
    authReady.set(true);
  }
};
