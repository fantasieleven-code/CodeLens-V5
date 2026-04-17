import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session.store.js';

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
