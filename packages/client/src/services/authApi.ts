/**
 * authApi — POST /auth/login wrapper.
 *
 * Kept separate from adminApi because the login endpoint lives at `/auth/*`
 * (not under `/api/admin/*`) and is reached without a Bearer token. Shapes
 * match server Task 15b (`packages/server/src/routes/auth.ts`):
 *   200 → { token, orgId, orgRole, expiresIn }
 *   401 → { error: 'Invalid credentials', code: 'AUTH_INVALID' }
 *   429 → { error: 'Too many authentication attempts' }
 *   400 → ValidationError JSON
 *
 * Throws `LoginError` with `kind` so the UI can branch on cause without
 * string-matching.
 */

import type { AdminOrgRole } from '../stores/auth.store.js';

export interface LoginSuccess {
  token: string;
  orgId: string;
  orgRole: AdminOrgRole;
  expiresIn: number;
}

export type LoginErrorKind =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'validation'
  | 'network'
  | 'unknown';

export class LoginError extends Error {
  readonly kind: LoginErrorKind;
  readonly status: number | null;
  constructor(kind: LoginErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = 'LoginError';
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
  return base.replace(/\/$/, '');
}

export async function postLogin(
  email: string,
  password: string,
): Promise<LoginSuccess> {
  let res: Response;
  try {
    res = await fetch(`${requireApiUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new LoginError(
      'network',
      err instanceof Error ? err.message : 'network failure',
    );
  }

  if (res.ok) {
    return res.json() as Promise<LoginSuccess>;
  }

  // Best-effort error parse; never throw from the parse itself.
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    /* body not JSON — fall through with empty object */
  }

  if (res.status === 401 || body.code === 'AUTH_INVALID') {
    throw new LoginError(
      'invalid_credentials',
      body.error ?? 'Invalid credentials',
      res.status,
    );
  }
  if (res.status === 429) {
    throw new LoginError(
      'rate_limited',
      body.error ?? 'Too many authentication attempts',
      res.status,
    );
  }
  if (res.status === 400) {
    throw new LoginError('validation', body.error ?? 'Invalid input', res.status);
  }
  throw new LoginError(
    'unknown',
    body.error ?? `Login failed: ${res.status}`,
    res.status,
  );
}
