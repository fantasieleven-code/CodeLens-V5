/**
 * candidateApi — wrapper for `/api/candidate/*` (POST profile/submit today;
 * F-A12 will reuse the same fetch + error plumbing for the 7-field profile
 * form).
 *
 * Round 3 (Backend B-A12 merged at 376ada7) aligns with:
 *   - auth: header Bearer, or body.sessionToken fallback (Session.candidateToken)
 *   - 200 response: { ok, sessionId, profile, consentAcceptedAt: string | null }
 *   - error envelope (AppError via errorHandler): nested
 *       { error: { code, message, details? } }
 *     where code ∈ { AUTH_REQUIRED, NOT_FOUND, VALIDATION_ERROR,
 *                    FORBIDDEN, INTERNAL_ERROR }
 *   - a few legacy paths (requireAdmin) still emit flat { error: 'string' };
 *     the union parser below treats that as AUTH_REQUIRED so callers get a
 *     sensible default.
 *
 * Errors surface as `CandidateApiError` — the β naming ratified in Round 3
 * so the same class covers Consent + F-A12 calls.
 */
export type CandidateApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'
  | 'NETWORK'
  | 'UNKNOWN';

export class CandidateApiError extends Error {
  readonly code: string;
  readonly status: number | null;
  constructor(code: string, status: number | null, message: string) {
    super(message);
    this.name = 'CandidateApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ConsentSubmitResponse {
  ok: true;
  sessionId: string;
  profile: unknown | null;
  consentAcceptedAt: string | null;
}

declare global {
  interface ImportMeta {
    readonly env?: Record<string, string | undefined>;
  }
}

function requireApiUrl(): string {
  const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const base = env.VITE_API_URL;
  if (!base) throw new Error('VITE_API_URL not configured');
  return base.replace(/\/+$/, '');
}

/**
 * Centralised fetch wrapper for `/api/candidate/*`.
 *
 * No Bearer header — the body-level `sessionToken` is the candidate
 * credential in V5.0; `requireCandidate` middleware consumes it when no
 * header is present.
 */
async function candidateFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return fetch(`${requireApiUrl()}${path}`, { ...init, headers });
}

/**
 * Parse a non-2xx Backend response into (code, message).
 *
 * Preferred nested shape (AppError → errorHandler): { error: { code, message } }.
 * Legacy flat shape (e.g. requireAdmin): { error: 'string' } → AUTH_REQUIRED
 * by convention, since the only flat emitters today are 401/403 guards.
 * Anything else (non-JSON, empty) → UNKNOWN.
 */
function parseErrorBody(
  body: unknown,
  status: number,
): { code: string; message: string } {
  if (body && typeof body === 'object') {
    const errField = (body as { error?: unknown }).error;
    if (errField && typeof errField === 'object') {
      const nested = errField as { code?: unknown; message?: unknown };
      const code = typeof nested.code === 'string' ? nested.code : 'UNKNOWN';
      const message =
        typeof nested.message === 'string'
          ? nested.message
          : `Request failed: ${status}`;
      return { code, message };
    }
    if (typeof errField === 'string') {
      return { code: 'AUTH_REQUIRED', message: errField };
    }
  }
  return { code: 'UNKNOWN', message: `Request failed: ${status}` };
}

export async function submitConsent(
  sessionToken: string,
): Promise<ConsentSubmitResponse> {
  let res: Response;
  try {
    res = await candidateFetch('/api/candidate/profile/submit', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, consentAccepted: true }),
    });
  } catch (err) {
    throw new CandidateApiError(
      'NETWORK',
      null,
      err instanceof Error ? err.message : 'network failure',
    );
  }

  if (res.ok) {
    return res.json() as Promise<ConsentSubmitResponse>;
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* body not JSON — parseErrorBody treats as UNKNOWN */
  }
  const { code, message } = parseErrorBody(body, res.status);
  throw new CandidateApiError(code, res.status, message);
}

export const __candidateFetch__ = candidateFetch;
