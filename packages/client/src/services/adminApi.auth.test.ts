import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __adminFetch__ } from './adminApi.js';
import { __authStorageKey__, useAuthStore } from '../stores/auth.store.js';

const ORIGINAL_FETCH = globalThis.fetch;

function resetAuth(): void {
  localStorage.removeItem(__authStorageKey__);
  useAuthStore.setState({
    token: null,
    orgId: null,
    orgRole: null,
    expiresAt: null,
  });
}

function seedAuth(token = 'jwt-ok'): void {
  useAuthStore.setState({
    token,
    orgId: 'org-1',
    orgRole: 'OWNER',
    expiresAt: Date.now() + 60_000,
  });
}

describe('adminFetch', () => {
  beforeEach(() => {
    resetAuth();
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('attaches Authorization: Bearer <token> from the auth store', async () => {
    seedAuth('jwt-xyz');
    let captured: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      captured = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await __adminFetch__('/api/admin/suites');
    const headers = new Headers(captured?.headers);
    expect(headers.get('authorization')).toBe('Bearer jwt-xyz');
  });

  it('omits Authorization when there is no token', async () => {
    let captured: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      captured = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await __adminFetch__('/api/admin/suites');
    const headers = new Headers(captured?.headers);
    expect(headers.has('authorization')).toBe(false);
  });

  it('defaults content-type to application/json when a body is present', async () => {
    seedAuth();
    let captured: RequestInit | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      captured = init;
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    await __adminFetch__('/api/admin/sessions/create', {
      method: 'POST',
      body: JSON.stringify({ x: 1 }),
    });
    const headers = new Headers(captured?.headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('logs the admin out on 401 so AdminGuard can bounce to /login', async () => {
    seedAuth();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'unauth' }), { status: 401 }),
    ) as typeof fetch;

    const res = await __adminFetch__('/api/admin/suites');
    expect(res.status).toBe(401);
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(__authStorageKey__)).toBeNull();
  });

  it('leaves auth state untouched on non-401 errors', async () => {
    seedAuth();
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as typeof fetch;

    await __adminFetch__('/api/admin/suites');
    expect(useAuthStore.getState().token).toBe('jwt-ok');
  });

  it('joins the path onto VITE_API_URL exactly once', async () => {
    seedAuth();
    let capturedUrl = '';
    globalThis.fetch = vi.fn(async (url) => {
      capturedUrl = String(url);
      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test/';
    await __adminFetch__('/api/admin/suites');
    expect(capturedUrl).toBe('http://api.test/api/admin/suites');
  });
});
