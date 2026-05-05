import { describe, expect, it, vi } from 'vitest';

import {
  bindSocketSessionIdentity,
  missingSessionMessage,
  registerSocketSessionIdentityMiddleware,
  resolveSocketSessionId,
} from './socket-session.js';

describe('socket session identity helpers', () => {
  it('binds sessionId from handshake auth before query', () => {
    const socket = {
      data: { existing: true },
      handshake: {
        auth: { sessionId: ' auth-session ' },
        query: { sessionId: 'query-session' },
      },
    };

    expect(bindSocketSessionIdentity(socket)).toBe('auth-session');
    expect(socket.data).toEqual({ existing: true, sessionId: 'auth-session' });
  });

  it('binds sessionId from query when auth is absent and handles query arrays', () => {
    const socket = {
      handshake: {
        query: { sessionId: ['query-session', 'ignored'] },
      },
    };

    expect(bindSocketSessionIdentity(socket)).toBe('query-session');
    expect(socket.data).toEqual({ sessionId: 'query-session' });
  });

  it('resolves bound socket session before payload fallback', () => {
    expect(
      resolveSocketSessionId(
        { data: { sessionId: 'bound-session' } },
        { sessionId: 'payload-session' },
      ),
    ).toBe('bound-session');
  });

  it('registers middleware that binds identity and always continues', () => {
    let middleware:
      | ((
          socket: {
            data?: Record<string, unknown>;
            handshake?: { auth?: Record<string, unknown> };
          },
          next: () => void,
        ) => void)
      | undefined;
    const target = {
      use: (fn: NonNullable<typeof middleware>) => {
        middleware = fn;
      },
    };
    const socket = { handshake: { auth: { sessionId: 'sess-mw' } } };
    const next = vi.fn();

    registerSocketSessionIdentityMiddleware(target);
    middleware?.(socket, next);

    expect(socket.data).toEqual({ sessionId: 'sess-mw' });
    expect(next).toHaveBeenCalledWith();
  });

  it('keeps payload fallback for existing clients', () => {
    expect(resolveSocketSessionId({}, { sessionId: 'payload-session' })).toBe('payload-session');
  });

  it('rejects blank or non-string session ids', () => {
    expect(bindSocketSessionIdentity({ handshake: { auth: { sessionId: '   ' } } })).toBeNull();
    expect(resolveSocketSessionId({ data: { sessionId: 123 } }, { sessionId: [] })).toBeNull();
  });

  it('returns a stable missing-session message', () => {
    expect(missingSessionMessage('phase0:submit')).toBe(
      'phase0:submit requires sessionId in socket handshake or payload',
    );
  });
});
