import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from './session.store.js';
import { useModuleStore } from './module.store.js';

const setSocketSessionId = vi.hoisted(() => vi.fn());

vi.mock('../lib/socket.js', () => ({ setSocketSessionId }));

const ORIGINAL_FETCH = globalThis.fetch;

interface SessionFetchOverride {
  status?: number;
  body?: unknown;
  reject?: Error;
}

function mockSessionFetch(override: SessionFetchOverride): void {
  globalThis.fetch = vi.fn(async () => {
    if (override.reject) throw override.reject;
    return new Response(JSON.stringify(override.body ?? {}), {
      status: override.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

describe('useSessionStore — token field', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts with token = null', () => {
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('setToken stores the bearer value', () => {
    useSessionStore.getState().setToken('bearer-abc');
    expect(useSessionStore.getState().token).toBe('bearer-abc');
  });

  it('setToken(null) clears the stored token', () => {
    useSessionStore.getState().setToken('bearer-abc');
    useSessionStore.getState().setToken(null);
    expect(useSessionStore.getState().token).toBeNull();
  });

  it('reset clears the token along with other session state', () => {
    useSessionStore.getState().setToken('bearer-abc');
    useSessionStore.getState().reset();
    expect(useSessionStore.getState().token).toBeNull();
  });
});

describe('useSessionStore — loadSession (Layer 2 · GET /api/v5/session/:id)', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useModuleStore.getState().reset();
    setSocketSessionId.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('starts with loadStatus = idle', () => {
    expect(useSessionStore.getState().loadStatus).toBe('idle');
    expect(useSessionStore.getState().loadError).toBeNull();
  });

  it('hydrates session + module stores from the backend response', async () => {
    mockSessionFetch({
      status: 200,
      body: {
        id: 'sess-uuid-1',
        candidate: { id: 'cand-liam', name: 'Liam', email: 'liam@test' },
        suiteId: 'full_stack',
        examInstanceId: 'e0000000-0000-0000-0000-000000000001',
        status: 'CREATED',
      },
    });

    await useSessionStore.getState().loadSession('sess-uuid-1');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('loaded');
    expect(s.sessionId).toBe('sess-uuid-1');
    expect(s.suiteId).toBe('full_stack');
    expect(s.candidateId).toBe('cand-liam');
    expect(s.moduleOrder.length).toBeGreaterThan(0);
    const m = useModuleStore.getState();
    expect(m.suiteId).toBe('full_stack');
    expect(m.currentModule).toBe('intro');
    expect(m.moduleOrder).toEqual(s.moduleOrder);
    expect(setSocketSessionId).toHaveBeenCalledWith('sess-uuid-1');
  });

  it('sets loadStatus = error with a sessionId message on 404', async () => {
    mockSessionFetch({ status: 404, body: { error: { code: 'NOT_FOUND' } } });

    await useSessionStore.getState().loadSession('no-such-id');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('error');
    expect(s.loadError).toMatch(/no-such-id/);
    expect(s.sessionId).toBeNull();
  });

  it('sets loadStatus = error on a non-404 non-OK response', async () => {
    mockSessionFetch({ status: 500, body: { error: 'boom' } });

    await useSessionStore.getState().loadSession('sess-uuid-x');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('error');
    expect(s.loadError).toMatch(/500/);
  });

  it('sets loadStatus = error on a network failure', async () => {
    mockSessionFetch({ reject: new TypeError('fetch failed') });

    await useSessionStore.getState().loadSession('sess-uuid-y');
    expect(useSessionStore.getState().loadStatus).toBe('error');
    expect(useSessionStore.getState().loadError).toMatch(/网络/);
  });

  it('re-loading with a valid id clears the prior error', async () => {
    mockSessionFetch({ status: 404 });
    await useSessionStore.getState().loadSession('no-such-id');
    expect(useSessionStore.getState().loadStatus).toBe('error');

    mockSessionFetch({
      status: 200,
      body: {
        id: 'sess-uuid-2',
        candidate: { id: 'cand-steve', name: 'Steve', email: 'steve@test' },
        suiteId: 'architect',
        examInstanceId: 'e2',
        status: 'CREATED',
      },
    });
    await useSessionStore.getState().loadSession('sess-uuid-2');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('loaded');
    expect(s.loadError).toBeNull();
    expect(s.suiteId).toBe('architect');
  });

  it('clears socket session identity on reset', () => {
    useSessionStore.getState().reset();

    expect(setSocketSessionId).toHaveBeenCalledWith(null);
  });
});
