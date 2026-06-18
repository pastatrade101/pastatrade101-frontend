// Thin fetch wrapper around the Pastatrade backend. Attaches the JWT from
// localStorage and unwraps the { success, message, data } envelope.
import { browser } from '$app/environment';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5050/api/v1';

const TOKEN_KEY = 'pastatrade_token';

export const getToken = (): string | null => (browser ? localStorage.getItem(TOKEN_KEY) : null);
export const setToken = (token: string): void => {
  if (browser) localStorage.setItem(TOKEN_KEY, token);
};
export const clearToken = (): void => {
  if (browser) localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; auth?: boolean };

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new ApiError(payload.message ?? `Request failed (${response.status})`, response.status);
  }

  return payload.data as T;
}
