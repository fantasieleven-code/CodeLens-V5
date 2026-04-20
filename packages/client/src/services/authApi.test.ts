import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postLogin, LoginError } from './authApi.js';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetch(
  fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): void {
  globalThis.fetch = fn as typeof fetch;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('postLogin', () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('POSTs JSON to /auth/login and returns the response body on 200', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    mockFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, {
        token: 't',
        orgId: 'org-1',
        orgRole: 'OWNER',
        expiresIn: 28_800,
      });
    });

    const out = await postLogin('a@b.com', 'pw');
    expect(out).toEqual({
      token: 't',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresIn: 28_800,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.test/auth/login');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      email: 'a@b.com',
      password: 'pw',
    });
  });

  it('throws LoginError(invalid_credentials) on 401', async () => {
    mockFetch(async () =>
      jsonResponse(401, { error: 'Invalid credentials', code: 'AUTH_INVALID' }),
    );
    await expect(postLogin('x@y.z', 'bad')).rejects.toMatchObject({
      name: 'LoginError',
      kind: 'invalid_credentials',
      status: 401,
    });
  });

  it('throws LoginError(rate_limited) on 429', async () => {
    mockFetch(async () =>
      jsonResponse(429, { error: 'Too many authentication attempts' }),
    );
    await expect(postLogin('x@y.z', 'pw')).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
    });
  });

  it('throws LoginError(validation) on 400', async () => {
    mockFetch(async () => jsonResponse(400, { error: 'email required' }));
    await expect(postLogin('', 'pw')).rejects.toMatchObject({
      kind: 'validation',
      status: 400,
    });
  });

  it('throws LoginError(network) when fetch itself rejects', async () => {
    mockFetch(async () => {
      throw new TypeError('failed to fetch');
    });
    const err = await postLogin('a@b.com', 'pw').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoginError);
    expect((err as LoginError).kind).toBe('network');
  });

  it('throws LoginError(unknown) on 500 with no body', async () => {
    mockFetch(async () => new Response(null, { status: 500 }));
    await expect(postLogin('a@b.com', 'pw')).rejects.toMatchObject({
      kind: 'unknown',
      status: 500,
    });
  });
});
