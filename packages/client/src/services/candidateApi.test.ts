import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateProfile } from '@codelens-v5/shared';
import type { V5CandidateSelfView } from '@codelens-v5/shared';
import {
  submitConsent,
  submitProfile,
  fetchCandidateSelfView,
  CandidateApiError,
} from './candidateApi.js';

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
        sessionId: 'sess-abc',
        profile: null,
        consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      });
    });

    const out = await submitConsent('sess-abc');
    expect(out).toEqual({
      ok: true,
      sessionId: 'sess-abc',
      profile: null,
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

  it('maps nested AppError envelope { error: { code, message } } to CandidateApiError.code', async () => {
    const cases: Array<{ status: number; code: string; message: string }> = [
      { status: 400, code: 'VALIDATION_ERROR', message: 'Validation failed' },
      { status: 404, code: 'NOT_FOUND', message: 'Session not found' },
      { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
      { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' },
    ];
    for (const c of cases) {
      mockFetch(async () =>
        jsonResponse(c.status, { error: { code: c.code, message: c.message } }),
      );
      const err = await submitConsent('sess-x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(CandidateApiError);
      expect((err as CandidateApiError).code).toBe(c.code);
      expect((err as CandidateApiError).status).toBe(c.status);
      expect((err as CandidateApiError).message).toBe(c.message);
    }
  });

  it('maps flat legacy envelope { error: "string" } to CandidateApiError(AUTH_REQUIRED)', async () => {
    mockFetch(async () =>
      jsonResponse(401, { error: 'Authentication required' }),
    );
    const err = await submitConsent('sess-x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('AUTH_REQUIRED');
    expect((err as CandidateApiError).status).toBe(401);
    expect((err as CandidateApiError).message).toBe('Authentication required');
  });

  it('falls back to code=UNKNOWN when the body is empty or non-JSON', async () => {
    mockFetch(async () => new Response(null, { status: 500 }));
    const err = await submitConsent('sess-x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('UNKNOWN');
    expect((err as CandidateApiError).status).toBe(500);
  });

  it('throws CandidateApiError(NETWORK) when fetch itself rejects', async () => {
    mockFetch(async () => {
      throw new TypeError('failed to fetch');
    });
    const err = await submitConsent('sess-x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('NETWORK');
    expect((err as CandidateApiError).status).toBeNull();
  });
});

describe('submitProfile', () => {
  const VALID_PROFILE: CandidateProfile = {
    yearsOfExperience: 3,
    currentRole: 'fullstack',
    primaryTechStack: ['typescript', 'react'],
    companySize: 'medium',
    aiToolYears: 1,
    primaryAiTool: 'claude_code',
    dailyAiUsageHours: '1_3',
  };

  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('POSTs JSON with sessionToken + profile to /api/candidate/profile/submit', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    mockFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, {
        ok: true,
        sessionId: 'sess-abc',
        profile: VALID_PROFILE,
        consentAcceptedAt: '2026-04-20T10:00:00.000Z',
      });
    });

    const out = await submitProfile({
      sessionToken: 'sess-abc',
      profile: VALID_PROFILE,
    });
    expect(out.ok).toBe(true);
    expect(out.sessionId).toBe('sess-abc');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://api.test/api/candidate/profile/submit');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      sessionToken: 'sess-abc',
      profile: VALID_PROFILE,
    });
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('returns the parsed response body on 200', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        ok: true,
        sessionId: 'sess-ok',
        profile: VALID_PROFILE,
        consentAcceptedAt: null,
      }),
    );
    const out = await submitProfile({
      sessionToken: 'sess-ok',
      profile: VALID_PROFILE,
    });
    expect(out).toEqual({
      ok: true,
      sessionId: 'sess-ok',
      profile: VALID_PROFILE,
      consentAcceptedAt: null,
    });
  });

  it('throws CandidateApiError(AUTH_REQUIRED) on 401 flat envelope', async () => {
    mockFetch(async () =>
      jsonResponse(401, { error: 'Authentication required' }),
    );
    const err = await submitProfile({
      sessionToken: 'sess-x',
      profile: VALID_PROFILE,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('AUTH_REQUIRED');
    expect((err as CandidateApiError).status).toBe(401);
    expect((err as CandidateApiError).message).toBe('Authentication required');
  });

  it('throws CandidateApiError(VALIDATION_ERROR) on 422 nested envelope', async () => {
    mockFetch(async () =>
      jsonResponse(422, {
        error: { code: 'VALIDATION_ERROR', message: 'Invalid profile' },
      }),
    );
    const err = await submitProfile({
      sessionToken: 'sess-y',
      profile: VALID_PROFILE,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('VALIDATION_ERROR');
    expect((err as CandidateApiError).status).toBe(422);
    expect((err as CandidateApiError).message).toBe('Invalid profile');
  });

  it('throws CandidateApiError(NETWORK) when fetch itself rejects', async () => {
    mockFetch(async () => {
      throw new TypeError('failed to fetch');
    });
    const err = await submitProfile({
      sessionToken: 'sess-x',
      profile: VALID_PROFILE,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('NETWORK');
    expect((err as CandidateApiError).status).toBeNull();
  });
});

describe('fetchCandidateSelfView', () => {
  const VALID_VIEW: V5CandidateSelfView = {
    sessionId: 'sess-sv',
    completedAt: '2026-04-20T10:00:00.000Z',
    capabilityProfiles: [
      {
        id: 'independent_delivery',
        nameZh: '独立交付能力',
        nameEn: 'Independent Delivery',
        label: '熟练',
        description: '能独立交付中等复杂度的任务。',
      },
    ],
    dimensionRadar: [
      {
        id: 'technicalJudgment',
        nameZh: '技术判断',
        nameEn: 'Technical Judgment',
        relativeStrength: 'strong',
      },
    ],
  };

  beforeEach(() => {
    (import.meta.env as Record<string, string | undefined>).VITE_API_URL =
      'http://api.test';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    delete (import.meta.env as Record<string, string | undefined>).VITE_API_URL;
    vi.restoreAllMocks();
  });

  it('GETs /api/candidate/self-view/:sessionId/:privateToken and returns the parsed body on 200', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    mockFetch(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return jsonResponse(200, VALID_VIEW);
    });

    const out = await fetchCandidateSelfView('sess-sv', 'tok-abc');
    expect(out).toEqual(VALID_VIEW);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'http://api.test/api/candidate/self-view/sess-sv/tok-abc',
    );
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  it('throws CandidateApiError(NOT_FOUND) on 404 nested envelope', async () => {
    mockFetch(async () =>
      jsonResponse(404, {
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      }),
    );
    const err = await fetchCandidateSelfView('sess-missing', 'tok-x').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('NOT_FOUND');
    expect((err as CandidateApiError).status).toBe(404);
  });

  it('throws CandidateApiError(SESSION_INCOMPLETE) on 400 — new code not in the union', async () => {
    mockFetch(async () =>
      jsonResponse(400, {
        error: { code: 'SESSION_INCOMPLETE', message: 'Session not yet completed' },
      }),
    );
    const err = await fetchCandidateSelfView('sess-draft', 'tok-y').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('SESSION_INCOMPLETE');
    expect((err as CandidateApiError).status).toBe(400);
    expect((err as CandidateApiError).message).toBe('Session not yet completed');
  });

  it('throws CandidateApiError(INTERNAL_ERROR) when server returns 200 with an invalid shape', async () => {
    mockFetch(async () =>
      jsonResponse(200, {
        ...VALID_VIEW,
        grade: 'A',
      }),
    );
    const err = await fetchCandidateSelfView('sess-sv', 'tok-abc').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CandidateApiError);
    expect((err as CandidateApiError).code).toBe('INTERNAL_ERROR');
    expect((err as CandidateApiError).status).toBe(200);
    expect((err as CandidateApiError).message).toBe(
      'Server response shape invalid',
    );
  });
});
