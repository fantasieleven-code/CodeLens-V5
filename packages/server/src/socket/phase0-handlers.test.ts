/**
 * Tests for socket/phase0-handlers.
 *
 * Covers:
 *   - happy path: V5Phase0Submission persisted as-is, MODULE_SUBMITTED emitted, ack(true)
 *   - schema invalid (missing sessionId / wrong choice enum) → ack(false), no persist
 *   - persist throws → ack(false), no MODULE_SUBMITTED emit
 *   - ack omitted → does not throw
 *   - inputBehavior optional: present and absent both pass through
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Phase0Submission } from '@codelens-v5/shared';

const persistMock = vi.hoisted(() => vi.fn());
const eventBusEmit = vi.hoisted(() => vi.fn());

vi.mock('../services/modules/p0.service.js', () => ({
  persistPhase0Submission: persistMock,
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: eventBusEmit },
}));

import { registerPhase0Handlers } from './phase0-handlers.js';
import { V5Event } from '@codelens-v5/shared';

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

const VALID_SUBMISSION: V5Phase0Submission = {
  codeReading: { l1Answer: 'L1', l2Answer: 'L2', l3Answer: 'L3', confidence: 0.6 },
  aiOutputJudgment: [
    { choice: 'A', reasoning: 'why A' },
    { choice: 'both_bad', reasoning: 'why bad' },
  ],
  aiClaimVerification: { response: 'mismatch', submittedAt: 1700000000000 },
  decision: { choice: 'C', reasoning: 'rollback first' },
};

beforeEach(() => {
  persistMock.mockReset();
  eventBusEmit.mockReset();
  persistMock.mockResolvedValue(undefined);
  eventBusEmit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerPhase0Handlers · phase0:submit', () => {
  it('registers exactly the phase0:submit listener', () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);
    expect(Array.from(socket.handlers.keys())).toEqual(['phase0:submit']);
  });

  it('happy path: persists V5 submission as-is, emits MODULE_SUBMITTED, ack(true)', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('phase0:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalledWith('s1', VALID_SUBMISSION);
    expect(eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'phase0',
    });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('inputBehavior present: passed through unchanged', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);

    await socket.handlers.get('phase0:submit')!(
      {
        sessionId: 's1',
        submission: { ...VALID_SUBMISSION, inputBehavior: { keystrokes: 12 } },
      },
      vi.fn(),
    );

    expect(persistMock).toHaveBeenCalledWith('s1', {
      ...VALID_SUBMISSION,
      inputBehavior: { keystrokes: 12 },
    });
  });

  it('schema invalid (missing sessionId) → ack(false), no persist, no emit', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('phase0:submit')!({ submission: VALID_SUBMISSION }, ack);

    expect(persistMock).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (bad judgment choice enum) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('phase0:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          aiOutputJudgment: [{ choice: 'X' as unknown as 'A', reasoning: 'r' }],
        },
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('persist throws → ack(false), no MODULE_SUBMITTED emit', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);
    persistMock.mockRejectedValueOnce(new Error('db down'));
    const ack = vi.fn();

    await socket.handlers.get('phase0:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerPhase0Handlers({} as never, socket as never);

    await expect(
      socket.handlers.get('phase0:submit')!({ sessionId: 's1', submission: VALID_SUBMISSION }),
    ).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalled();
  });
});
