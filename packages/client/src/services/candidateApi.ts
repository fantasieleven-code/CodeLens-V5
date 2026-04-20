/**
 * candidateApi — POST /api/candidate/profile/submit wrapper.
 *
 * The Consent flow (brief §3 D3) only needs the consent field; later F-A12
 * extends the same endpoint with the 7-field profile form. Round 1 accepts
 * Backend B-A12's brief contract:
 *   200 → { ok: true, profile, consentAcceptedAt }
 *   400 → { code: 'SESSION_TOKEN_REQUIRED' | 'VALIDATION_FAILED' | 'EMPTY_SUBMIT', error }
 *   404 → { code: 'SESSION_NOT_FOUND', error }
 *
 * Round 2 (after B-A12 merge) re-greps the actual route + zod schema —
 * any drift stops the cutover per Pattern H.
 *
 * Errors are surfaced as `SubmitConsentError` with `kind` so the page can
 * pick localised copy without string-matching the server message.
 */

export interface SubmitConsentSuccess {
  ok: true;
  profile: unknown;
  consentAcceptedAt: string;
}

export type SubmitConsentErrorKind =
  | 'session_token_required'
  | 'session_not_found'
  | 'validation_failed'
  | 'empty_submit'
  | 'network'
  | 'unknown';

export class SubmitConsentError extends Error {
  readonly kind: SubmitConsentErrorKind;
  readonly status: number | null;
  constructor(
    kind: SubmitConsentErrorKind,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'SubmitConsentError';
    this.kind = kind;
    this.status = status;
  }
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
 * Unlike `adminFetch`, no Bearer header is attached — the URL-bound
 * `sessionToken` is the only candidate credential in V5.0. Returns the
 * raw Response so callers decide how to parse and throw.
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

const ERROR_CODE_MAP: Record<string, SubmitConsentErrorKind> = {
  SESSION_TOKEN_REQUIRED: 'session_token_required',
  SESSION_NOT_FOUND: 'session_not_found',
  VALIDATION_FAILED: 'validation_failed',
  EMPTY_SUBMIT: 'empty_submit',
};

export async function submitConsent(
  sessionToken: string,
): Promise<SubmitConsentSuccess> {
  let res: Response;
  try {
    res = await candidateFetch('/api/candidate/profile/submit', {
      method: 'POST',
      body: JSON.stringify({ sessionToken, consentAccepted: true }),
    });
  } catch (err) {
    throw new SubmitConsentError(
      'network',
      err instanceof Error ? err.message : 'network failure',
    );
  }

  if (res.ok) {
    return res.json() as Promise<SubmitConsentSuccess>;
  }

  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    /* body not JSON — fall through with empty object */
  }

  const mapped = body.code ? ERROR_CODE_MAP[body.code] : undefined;
  if (mapped) {
    throw new SubmitConsentError(
      mapped,
      body.error ?? `submitConsent failed: ${res.status}`,
      res.status,
    );
  }
  throw new SubmitConsentError(
    'unknown',
    body.error ?? `submitConsent failed: ${res.status}`,
    res.status,
  );
}

export const __candidateFetch__ = candidateFetch;
