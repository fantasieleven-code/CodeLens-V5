/**
 * auth.store — admin Bearer authentication state.
 *
 * Holds the JWT + org context returned by POST /auth/login. Persists across
 * full page reloads via localStorage so an admin's tab refresh doesn't bounce
 * them back to the login page; expired tokens (past `expiresAt`) are dropped
 * on every access so a stale session never makes it into a request.
 *
 * Scope is strictly V5.0: single-login, single-org, no refresh token. V5.0.5
 * scope covers 2FA / OAuth / password reset / refresh rotation.
 */

import { create } from 'zustand';

const STORAGE_KEY = 'codelens_admin_auth';

export type AdminOrgRole = 'OWNER' | 'MEMBER';

export interface LoginPayload {
  token: string;
  orgId: string;
  orgRole: AdminOrgRole;
  /** Seconds until `token` expires. Matches POST /auth/login response. */
  expiresIn: number;
}

export interface AuthSnapshot {
  token: string;
  orgId: string;
  orgRole: AdminOrgRole;
  /** Unix ms — compared against `Date.now()` for expiry. */
  expiresAt: number;
}

export interface AuthStore {
  token: string | null;
  orgId: string | null;
  orgRole: AdminOrgRole | null;
  expiresAt: number | null;

  /** Persist a fresh login result. */
  login: (payload: LoginPayload) => void;
  /** Clear everything (callers handle navigation). */
  logout: () => void;
  /**
   * Return the token only if it's still valid; auto-clear + return null
   * otherwise so callers never see a stale token.
   */
  getToken: () => string | null;
  isAuthenticated: () => boolean;
}

// Node 25+ injects a global `localStorage` that's non-functional unless
// `--localstorage-file` is set; jsdom's window.localStorage shadows it only
// after the DOM env boots. Check for the method, not the global, so module
// import doesn't blow up before jsdom is ready.
function hasLocalStorage(): boolean {
  return (
    typeof localStorage !== 'undefined' &&
    typeof localStorage.getItem === 'function'
  );
}

function readPersisted(): AuthSnapshot | null {
  if (!hasLocalStorage()) return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSnapshot>;
    if (
      typeof parsed.token === 'string' &&
      typeof parsed.orgId === 'string' &&
      (parsed.orgRole === 'OWNER' || parsed.orgRole === 'MEMBER') &&
      typeof parsed.expiresAt === 'number'
    ) {
      // Drop anything already expired so restore doesn't yield a stale token.
      if (parsed.expiresAt <= Date.now()) return null;
      return parsed as AuthSnapshot;
    }
  } catch {
    // Malformed JSON — treat as absent.
  }
  return null;
}

function writePersisted(snapshot: AuthSnapshot): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

function clearPersisted(): void {
  if (!hasLocalStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
}

const initial = readPersisted();

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: initial?.token ?? null,
  orgId: initial?.orgId ?? null,
  orgRole: initial?.orgRole ?? null,
  expiresAt: initial?.expiresAt ?? null,

  login: ({ token, orgId, orgRole, expiresIn }) => {
    const expiresAt = Date.now() + expiresIn * 1000;
    const snapshot: AuthSnapshot = { token, orgId, orgRole, expiresAt };
    writePersisted(snapshot);
    set({ token, orgId, orgRole, expiresAt });
  },

  logout: () => {
    clearPersisted();
    set({ token: null, orgId: null, orgRole: null, expiresAt: null });
  },

  getToken: () => {
    const { token, expiresAt } = get();
    if (!token || !expiresAt) return null;
    if (expiresAt <= Date.now()) {
      clearPersisted();
      set({ token: null, orgId: null, orgRole: null, expiresAt: null });
      return null;
    }
    return token;
  },

  isAuthenticated: () => get().getToken() !== null,
}));

export const __authStorageKey__ = STORAGE_KEY;
