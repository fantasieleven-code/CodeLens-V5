import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __authStorageKey__,
  useAuthStore,
  type AuthStore,
} from './auth.store.js';

function clear(): void {
  localStorage.removeItem(__authStorageKey__);
  useAuthStore.setState({
    token: null,
    orgId: null,
    orgRole: null,
    expiresAt: null,
  } as Partial<AuthStore>);
}

describe('useAuthStore', () => {
  beforeEach(() => {
    clear();
    vi.useRealTimers();
  });

  it('starts with a null snapshot when nothing is persisted', () => {
    const s = useAuthStore.getState();
    expect(s.token).toBeNull();
    expect(s.orgId).toBeNull();
    expect(s.orgRole).toBeNull();
    expect(s.expiresAt).toBeNull();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('login writes token + computes expiresAt from expiresIn (seconds)', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    useAuthStore.getState().login({
      token: 'jwt-abc',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresIn: 28_800, // 8h — matches parseJwtExpiryToSeconds('8h')
    });
    const s = useAuthStore.getState();
    expect(s.token).toBe('jwt-abc');
    expect(s.orgId).toBe('org-1');
    expect(s.orgRole).toBe('OWNER');
    expect(s.expiresAt).toBe(now + 28_800_000);
    expect(s.isAuthenticated()).toBe(true);
  });

  it('persists to localStorage so a subsequent read restores identity', () => {
    useAuthStore.getState().login({
      token: 'jwt-xyz',
      orgId: 'org-2',
      orgRole: 'MEMBER',
      expiresIn: 3600,
    });
    const raw = localStorage.getItem(__authStorageKey__);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed.token).toBe('jwt-xyz');
    expect(parsed.orgRole).toBe('MEMBER');
    expect(typeof parsed.expiresAt).toBe('number');
  });

  it('logout clears state and localStorage', () => {
    useAuthStore.getState().login({
      token: 'jwt-abc',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresIn: 3600,
    });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
    expect(localStorage.getItem(__authStorageKey__)).toBeNull();
  });

  it('getToken returns null and wipes state once expiresAt is past', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    useAuthStore.getState().login({
      token: 'jwt-abc',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresIn: 60,
    });
    expect(useAuthStore.getState().getToken()).toBe('jwt-abc');

    vi.setSystemTime(now + 61_000);
    expect(useAuthStore.getState().getToken()).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(localStorage.getItem(__authStorageKey__)).toBeNull();
  });

  it('isAuthenticated flips to false the moment getToken detects expiry', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    useAuthStore.getState().login({
      token: 'jwt-abc',
      orgId: 'org-1',
      orgRole: 'OWNER',
      expiresIn: 10,
    });
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
    vi.setSystemTime(now + 11_000);
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
