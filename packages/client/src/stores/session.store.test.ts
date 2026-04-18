import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session.store.js';
import { useModuleStore } from './module.store.js';

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

describe('useSessionStore — loadSession (Layer 1 mock)', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
    useModuleStore.getState().reset();
  });

  it('starts with loadStatus = idle', () => {
    expect(useSessionStore.getState().loadStatus).toBe('idle');
    expect(useSessionStore.getState().loadError).toBeNull();
  });

  it('hydrates session + module stores from the admin fixture', async () => {
    await useSessionStore.getState().loadSession('sess-00001');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('loaded');
    expect(s.sessionId).toBe('sess-00001');
    expect(s.suiteId).toBe('full_stack');
    expect(s.candidateId).toBe('cand-liam');
    expect(s.moduleOrder.length).toBeGreaterThan(0);
    // module.store primed to 'intro' with the same module order
    const m = useModuleStore.getState();
    expect(m.suiteId).toBe('full_stack');
    expect(m.currentModule).toBe('intro');
    expect(m.moduleOrder).toEqual(s.moduleOrder);
  });

  it('sets loadStatus = error and a message when the id is unknown', async () => {
    await useSessionStore.getState().loadSession('no-such-id');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('error');
    expect(s.loadError).toMatch(/no-such-id/);
    expect(s.sessionId).toBeNull();
  });

  it('re-loading with a valid id clears the prior error', async () => {
    await useSessionStore.getState().loadSession('no-such-id');
    expect(useSessionStore.getState().loadStatus).toBe('error');
    await useSessionStore.getState().loadSession('sess-00002');
    const s = useSessionStore.getState();
    expect(s.loadStatus).toBe('loaded');
    expect(s.loadError).toBeNull();
    expect(s.suiteId).toBe('architect');
  });
});
