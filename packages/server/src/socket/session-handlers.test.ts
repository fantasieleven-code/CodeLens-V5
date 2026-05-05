import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const endSession = vi.hoisted(() => vi.fn());

vi.mock('../services/session.service.js', () => ({
  sessionService: { endSession },
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerSessionHandlers } from './session-handlers.js';

interface FakeSocket {
  id: string;
  data?: Record<string, unknown>;
  emit: ReturnType<typeof vi.fn>;
  handlers: Map<string, (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>>;
  on: (
    event: string,
    handler: (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>,
  ) => void;
}

function newFakeSocket(): FakeSocket {
  const handlers = new Map<string, (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>>();
  return {
    id: 'sock-1',
    emit: vi.fn(),
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
}

beforeEach(() => {
  endSession.mockReset();
  endSession.mockResolvedValue({ id: 'sess-1' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerSessionHandlers · session:end', () => {
  it('registers exactly the session:end listener', () => {
    const socket = newFakeSocket();
    registerSessionHandlers({} as never, socket as never);

    expect(Array.from(socket.handlers.keys())).toEqual(['session:end']);
  });

  it('happy path: ends the session and ack(true)', async () => {
    const socket = newFakeSocket();
    registerSessionHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('session:end')!({ sessionId: 'sess-1' }, ack);

    expect(endSession).toHaveBeenCalledWith('sess-1');
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('uses middleware-bound session identity when payload sessionId is omitted', async () => {
    const socket = newFakeSocket();
    socket.data = { sessionId: 'sess-handshake' };
    registerSessionHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('session:end')!({}, ack);

    expect(endSession).toHaveBeenCalledWith('sess-handshake');
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('schema invalid (missing sessionId) -> ack(false), no write', async () => {
    const socket = newFakeSocket();
    registerSessionHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('session:end')!({}, ack);

    expect(endSession).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('session:end:error', {
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
    });
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('endSession throws -> ack(false)', async () => {
    const socket = newFakeSocket();
    registerSessionHandlers({} as never, socket as never);
    endSession.mockRejectedValueOnce(new Error('missing'));
    const ack = vi.fn();

    await socket.handlers.get('session:end')!({ sessionId: 'sess-1' }, ack);

    expect(endSession).toHaveBeenCalledWith('sess-1');
    expect(socket.emit).toHaveBeenCalledWith('session:end:error', {
      code: 'PERSIST_FAILED',
      message: 'missing',
    });
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerSessionHandlers({} as never, socket as never);

    await expect(
      socket.handlers.get('session:end')!({ sessionId: 'sess-1' }),
    ).resolves.toBeUndefined();
    expect(endSession).toHaveBeenCalledWith('sess-1');
  });
});
