import { beforeEach, describe, expect, it, vi } from 'vitest';

const loggerInfo = vi.hoisted(() => vi.fn());

vi.mock('../lib/logger.js', () => ({
  logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  bindSocketSessionIdentity,
  missingSessionMessage,
  registerSocketSessionIdentityMiddleware,
  resolveSocketSessionIdentity,
  resolveSocketSessionId,
} from './socket-session.js';

describe('socket session identity helpers', () => {
  beforeEach(() => {
    loggerInfo.mockReset();
  });

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
    expect(
      resolveSocketSessionIdentity(
        { data: { sessionId: 'bound-session' } },
        { sessionId: 'payload-session' },
      ),
    ).toEqual({ sessionId: 'bound-session', source: 'socket-bound' });
    expect(loggerInfo).not.toHaveBeenCalled();
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
    expect(
      resolveSocketSessionId(
        {},
        { sessionId: 'payload-session' },
        { event: 'phase0:submit', socketId: 'sock-1' },
      ),
    ).toBe('payload-session');
    expect(resolveSocketSessionIdentity({}, { sessionId: 'payload-session' })).toEqual({
      sessionId: 'payload-session',
      source: 'payload-fallback',
    });
    expect(loggerInfo).toHaveBeenCalledWith('[socket:session] payload sessionId fallback used', {
      event: 'phase0:submit',
      socketId: 'sock-1',
      sessionId: 'payload-session',
    });
  });

  it('rejects blank or non-string session ids', () => {
    expect(bindSocketSessionIdentity({ handshake: { auth: { sessionId: '   ' } } })).toBeNull();
    expect(resolveSocketSessionId({ data: { sessionId: 123 } }, { sessionId: [] })).toBeNull();
    expect(resolveSocketSessionIdentity({ data: { sessionId: 123 } }, { sessionId: [] })).toEqual({
      sessionId: null,
      source: 'missing',
    });
  });

  it('returns a stable missing-session message', () => {
    expect(missingSessionMessage('phase0:submit')).toBe(
      'phase0:submit requires sessionId in socket handshake or payload',
    );
  });
});
