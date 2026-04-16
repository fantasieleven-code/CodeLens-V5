/**
 * Admin API helpers — extracted from AdminDashboard.tsx L118-141
 */

export const API_BASE = '/api/admin';

export function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export function setToken(token: string): void {
  localStorage.setItem('admin_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('admin_token');
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    // Auto-redirect to login on 401 (expired token) — but not on login page itself
    if (res.status === 401 && window.location.pathname !== '/admin/login') {
      clearToken();
      window.location.href = '/admin/login';
      return new Promise<never>(() => {});
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof err.error === 'string' ? err.error : err.error?.message || err.message || res.statusText;
    throw new Error(msg);
  }
  return res.json();
}
