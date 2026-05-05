import { describe, expect, it, vi } from 'vitest';

import {
  ackBoolean,
  describeSocketError,
  emitSocketError,
  failSocketRequest,
} from './socket-contract.js';

describe('socket-contract helpers', () => {
  it('ackBoolean calls boolean ack with the requested outcome', () => {
    const ack = vi.fn();
    ackBoolean(ack, true);
    ackBoolean(ack, false);
    expect(ack).toHaveBeenNthCalledWith(1, true);
    expect(ack).toHaveBeenNthCalledWith(2, false);
  });

  it('ackBoolean tolerates omitted or throwing ack callbacks', () => {
    expect(() => ackBoolean(undefined, true)).not.toThrow();
    expect(() =>
      ackBoolean(() => {
        throw new Error('client callback failed');
      }, false),
    ).not.toThrow();
  });

  it('emitSocketError emits a stable {event}:error frame', () => {
    const socket = { emit: vi.fn() };
    emitSocketError(socket, 'phase0:submit', 'VALIDATION_ERROR', 'bad payload');

    expect(socket.emit).toHaveBeenCalledWith('phase0:submit:error', {
      code: 'VALIDATION_ERROR',
      message: 'bad payload',
    });
  });

  it('failSocketRequest emits a typed error frame and ack(false)', () => {
    const socket = { emit: vi.fn() };
    const ack = vi.fn();

    failSocketRequest(socket, 'moduleA:submit', 'PERSIST_FAILED', 'db down', ack);

    expect(socket.emit).toHaveBeenCalledWith('moduleA:submit:error', {
      code: 'PERSIST_FAILED',
      message: 'db down',
    });
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('describeSocketError preserves Error messages and stringifies non-Errors', () => {
    expect(describeSocketError(new Error('persist failed'))).toBe('persist failed');
    expect(describeSocketError('plain failure')).toBe('plain failure');
    expect(describeSocketError(null)).toBe('null');
  });
});
