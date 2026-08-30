import type { Prefs } from '../types/news';

const BASE = 'http://localhost:8000';

export interface AuthResponse {
  token: string;
  email: string;
}

async function apiPost(path: string, body: object): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Request failed');
  return data;
}

export async function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return apiPost('/api/auth/google', { credential }) as Promise<AuthResponse>;
}

export async function fetchPrefs(token: string): Promise<Prefs | null> {
  const res = await fetch(`${BASE}/api/prefs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('Token expired');
  if (!res.ok) return null;
  const data = await res.json() as { prefs: Prefs | null };
  return data.prefs ?? null;
}

export async function savePrefsApi(token: string, prefs: Prefs): Promise<void> {
  const res = await fetch(`${BASE}/api/prefs`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    const data = await res.json() as { error?: string };
    throw new Error(data.error ?? 'Failed to save preferences');
  }
}
