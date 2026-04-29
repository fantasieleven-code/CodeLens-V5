import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const saveRoundAnswer = vi.hoisted(() => vi.fn());

vi.mock('../services/modules/mc.service.js', () => ({
  saveRoundAnswer,
}));

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { registerModuleCHandlers } from './moduleC-handlers.js';

interface FakeSocket {
  id: string;
  handlers: Map<string, (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>>;
  on: (event: string, handler: (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>) => void;
}

function newFakeSocket(): FakeSocket {
  const handlers = new Map<
    string,
    (raw: unknown, ack?: (ok: boolean) => void) => Promise<void>
  >();
  return {
    id: 'sock-1',
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
}

const VALID_PAYLOAD = {
  sessionId: 'sess-1',
  round: 2,
  question: 'Emma question',
  answer: 'Candidate answer',
  probeStrategy: 'contradiction',
};

beforeEach(() => {
  saveRoundAnswer.mockReset();
  saveRoundAnswer.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerModuleCHandlers · v5:modulec:answer', () => {
  it('registers exactly the v5:modulec:answer listener', () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);

    expect(Array.from(socket.handlers.keys())).toEqual(['v5:modulec:answer']);
  });

  it('happy path: persists one round answer and ack(true)', async () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('v5:modulec:answer')!(VALID_PAYLOAD, ack);

    expect(saveRoundAnswer).toHaveBeenCalledWith(
      'sess-1',
      2,
      'Candidate answer',
      'Emma question',
      'contradiction',
    );
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('schema invalid (missing sessionId) -> ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('v5:modulec:answer')!(
      { round: 1, question: 'q', answer: 'a', probeStrategy: 'baseline' },
      ack,
    );

    expect(saveRoundAnswer).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (bad probeStrategy) -> ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('v5:modulec:answer')!(
      { ...VALID_PAYLOAD, probeStrategy: 'text-mode' },
      ack,
    );

    expect(saveRoundAnswer).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('persist throws -> ack(false)', async () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);
    saveRoundAnswer.mockRejectedValueOnce(new Error('db down'));
    const ack = vi.fn();

    await socket.handlers.get('v5:modulec:answer')!(VALID_PAYLOAD, ack);

    expect(saveRoundAnswer).toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerModuleCHandlers({} as never, socket as never);

    await expect(socket.handlers.get('v5:modulec:answer')!(VALID_PAYLOAD)).resolves.toBeUndefined();
    expect(saveRoundAnswer).toHaveBeenCalled();
  });
});
