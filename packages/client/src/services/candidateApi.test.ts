import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitConsent, SubmitConsentError } from './candidateApi.js';

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

describe('submitConsent', () => {
  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('POSTs JSON to /api/candidate/profile/submit and returns the body on 200', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    mockFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, {
        ok: true,
        profile: { id: 'cand-1' },
        consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      });
    });

    const out = await submitConsent('sess-abc');
    expect(out).toEqual({
      ok: true,
      profile: { id: 'cand-1' },
      consentAcceptedAt: '2026-04-20T10:00:00.000Z',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.test/api/candidate/profile/submit');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      sessionToken: 'sess-abc',
      consentAccepted: true,
    });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('maps backend error codes to SubmitConsentError.kind', async () => {
    const cases: Array<{
      status: number;
      code: string;
      kind: SubmitConsentError['kind'];
    }> = [
      { status: 400, code: 'SESSION_TOKEN_REQUIRED', kind: 'session_token_required' },
      { status: 404, code: 'SESSION_NOT_FOUND', kind: 'session_not_found' },
      { status: 400, code: 'VALIDATION_FAILED', kind: 'validation_failed' },
      { status: 400, code: 'EMPTY_SUBMIT', kind: 'empty_submit' },
    ];
    for (const c of cases) {
      mockFetch(async () =>
        jsonResponse(c.status, { error: c.code, code: c.code }),
      );
      const err = await submitConsent('sess-x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SubmitConsentError);
      expect((err as SubmitConsentError).kind).toBe(c.kind);
      expect((err as SubmitConsentError).status).toBe(c.status);
    }
  });

  it('falls back to kind=unknown when no code or unknown code is returned', async () => {
    mockFetch(async () => new Response(null, { status: 500 }));
    const err = await submitConsent('sess-x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubmitConsentError);
    expect((err as SubmitConsentError).kind).toBe('unknown');
    expect((err as SubmitConsentError).status).toBe(500);
  });

  it('throws SubmitConsentError(network) when fetch itself rejects', async () => {
    mockFetch(async () => {
      throw new TypeError('failed to fetch');
    });
    const err = await submitConsent('sess-x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubmitConsentError);
    expect((err as SubmitConsentError).kind).toBe('network');
    expect((err as SubmitConsentError).status).toBeNull();
  });
});
