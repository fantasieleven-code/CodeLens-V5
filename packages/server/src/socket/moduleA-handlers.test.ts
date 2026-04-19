/**
 * Tests for socket/moduleA-handlers.
 *
 * Covers:
 *   - happy path: V5ModuleASubmission persisted as-is, MODULE_SUBMITTED with
 *     module:'moduleA' emitted, ack(true)
 *   - schema invalid (missing sessionId / wrong scheme enum / wrong commentType
 *     enum / missing round4 field) → ack(false), no persist
 *   - persist throws → ack(false), no MODULE_SUBMITTED emit
 *   - ack omitted → does not throw
 *   - inputBehavior optional on round2: present and absent both pass through
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5ModuleASubmission } from '@codelens-v5/shared';

const persistMock = vi.hoisted(() => vi.fn());
const eventBusEmit = vi.hoisted(() => vi.fn());

vi.mock('../services/modules/ma.service.js', () => ({
  persistModuleASubmission: persistMock,
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: eventBusEmit },
}));

import { registerModuleAHandlers } from './moduleA-handlers.js';
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
    id: 'sock-ma-1',
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
}

const VALID_SUBMISSION: V5ModuleASubmission = {
  round1: {
    schemeId: 'C',
    reasoning: 'C scheme reasoning',
    structuredForm: {
      scenario: 'scenario',
      tradeoff: 'tradeoff',
      decision: 'decision',
      verification: 'verification',
    },
    challengeResponse: 'challenge response',
  },
  round2: {
    markedDefects: [
      { defectId: 'cand-1', commentType: 'bug', comment: 'SET NX missing EX', fixSuggestion: 'add 30s TTL' },
    ],
  },
  round3: {
    correctVersionChoice: 'success',
    diffAnalysis: 'Lua atomic check-and-decrement',
    diagnosisText: 'failed has check-then-act window',
  },
  round4: {
    response: '底层原则成立,参数调整',
    submittedAt: 1700000000000,
    timeSpentSec: 60,
  },
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

describe('registerModuleAHandlers · moduleA:submit', () => {
  it('registers exactly the moduleA:submit listener', () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    expect(Array.from(socket.handlers.keys())).toEqual(['moduleA:submit']);
  });

  it('happy path: persists V5 submission as-is, emits MODULE_SUBMITTED, ack(true)', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleA:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalledWith('s1', VALID_SUBMISSION);
    expect(eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'moduleA',
    });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('round2.inputBehavior present: passed through unchanged', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);

    await socket.handlers.get('moduleA:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          round2: {
            ...VALID_SUBMISSION.round2,
            inputBehavior: { keystrokes: 240, pasteCount: 1 },
          },
        },
      },
      vi.fn(),
    );

    expect(persistMock).toHaveBeenCalledWith('s1', {
      ...VALID_SUBMISSION,
      round2: {
        ...VALID_SUBMISSION.round2,
        inputBehavior: { keystrokes: 240, pasteCount: 1 },
      },
    });
  });

  it('schema invalid (missing sessionId) → ack(false), no persist, no emit', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleA:submit')!({ submission: VALID_SUBMISSION }, ack);

    expect(persistMock).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (bad scheme enum) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleA:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          round1: { ...VALID_SUBMISSION.round1, schemeId: 'D' as unknown as 'A' },
        },
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (commentType "style" rejected — V5.0 enum is bug|suggestion|question|nit) → ack(false)', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleA:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          round2: {
            markedDefects: [
              {
                defectId: 'cand-1',
                commentType: 'style' as unknown as 'bug',
                comment: 'naming is off',
              },
            ],
          },
        },
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (round4 missing) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    const ack = vi.fn();

    const { round4: _round4, ...withoutRound4 } = VALID_SUBMISSION;
    void _round4;

    await socket.handlers.get('moduleA:submit')!(
      {
        sessionId: 's1',
        submission: withoutRound4 as unknown as V5ModuleASubmission,
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('persist throws → ack(false), no MODULE_SUBMITTED emit', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);
    persistMock.mockRejectedValueOnce(new Error('db down'));
    const ack = vi.fn();

    await socket.handlers.get('moduleA:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerModuleAHandlers({} as never, socket as never);

    await expect(
      socket.handlers.get('moduleA:submit')!({ sessionId: 's1', submission: VALID_SUBMISSION }),
    ).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalled();
  });
});
