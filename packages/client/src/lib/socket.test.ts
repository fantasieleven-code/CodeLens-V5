import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io }));

describe('lib/socket', () => {
  beforeEach(() => {
    vi.resetModules();
    io.mockReset();
    io.mockReturnValue({
      auth: undefined,
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  it('connects to the /interview namespace automatically for direct page emits', async () => {
    const { getSocket } = await import('./socket.js');

    getSocket();

    expect(io).toHaveBeenCalledWith(
      '/interview',
      expect.objectContaining({ autoConnect: true }),
    );
  });

  it('reuses the singleton socket across getSocket calls', async () => {
    const { getSocket } = await import('./socket.js');

    const first = getSocket();
    const second = getSocket();

    expect(first).toBe(second);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('sets auth before connecting when connectSocket is the first caller', async () => {
    const socket = {
      auth: undefined as unknown,
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket);
    const { connectSocket } = await import('./socket.js');

    connectSocket('candidate-token');

    expect(io).toHaveBeenCalledWith(
      '/interview',
      expect.objectContaining({ autoConnect: false }),
    );
    expect(socket.auth).toEqual({ token: 'candidate-token' });
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('adds sessionId to the initial handshake auth before socket creation', async () => {
    const { getSocket, setSocketSessionId } = await import('./socket.js');

    setSocketSessionId('sess-1');
    getSocket();

    expect(io).toHaveBeenCalledWith(
      '/interview',
      expect.objectContaining({ auth: { sessionId: 'sess-1' } }),
    );
  });

  it('preserves token auth when binding sessionId to an existing socket', async () => {
    const socket = {
      auth: { token: 'candidate-token' } as unknown,
      connected: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket);
    const { connectSocket, setSocketSessionId } = await import('./socket.js');

    connectSocket('candidate-token');
    setSocketSessionId('sess-2');

    expect(socket.auth).toEqual({ token: 'candidate-token', sessionId: 'sess-2' });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('reconnects an already-connected socket when sessionId changes', async () => {
    const socket = {
      auth: undefined as unknown,
      connected: true,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    io.mockReturnValueOnce(socket);
    const { getSocket, setSocketSessionId } = await import('./socket.js');

    getSocket();
    setSocketSessionId('sess-3');

    expect(socket.auth).toEqual({ sessionId: 'sess-3' });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });
});
