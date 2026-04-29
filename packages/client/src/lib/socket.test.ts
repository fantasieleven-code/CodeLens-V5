import { beforeEach, describe, expect, it, vi } from 'vitest';

const io = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io }));

describe('lib/socket', () => {
  beforeEach(() => {
    vi.resetModules();
    io.mockReset();
    io.mockReturnValue({
      auth: undefined,
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
});
