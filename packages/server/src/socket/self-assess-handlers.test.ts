/**
 * Tests for socket/self-assess-handlers.
 *
 * Covers:
 *   - V4 → V5 normalize: selfConfidence/100 → confidence (clamp01),
 *     selfIdentifiedRisk → reasoning, reviewedDecisions undefined,
 *     responseTimeMs dropped
 *   - clamp01 boundaries: selfConfidence > 100 → 1, < 0 → 0, NaN → 0
 *   - schema invalid (missing sessionId) → ack(false), no persist
 *   - persist throws → ack(false), no MODULE_SUBMITTED emit
 *   - happy path → ack(true) + MODULE_SUBMITTED emit
 *   - ack omitted → does not throw
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const persistSelfAssessMock = vi.hoisted(() => vi.fn());
const eventBusEmit = vi.hoisted(() => vi.fn());

vi.mock('../services/modules/se.service.js', () => ({
  persistSelfAssess: persistSelfAssessMock,
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: eventBusEmit },
}));

import { registerSelfAssessHandlers } from './self-assess-handlers.js';
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

beforeEach(() => {
  persistSelfAssessMock.mockReset();
  eventBusEmit.mockReset();
  persistSelfAssessMock.mockResolvedValue(undefined);
  eventBusEmit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerSelfAssessHandlers · self-assess:submit', () => {
  it('registers exactly the self-assess:submit listener', () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    expect(Array.from(socket.handlers.keys())).toEqual(['self-assess:submit']);
  });

  it('happy path: V4 payload normalized to V5, persisted, MODULE_SUBMITTED emitted, ack(true)', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('self-assess:submit')!(
      {
        sessionId: 's1',
        selfConfidence: 75,
        selfIdentifiedRisk: '我觉得 Phase 0 选错了',
        responseTimeMs: 12345,
      },
      ack,
    );

    expect(persistSelfAssessMock).toHaveBeenCalledWith('s1', {
      confidence: 0.75,
      reasoning: '我觉得 Phase 0 选错了',
    });
    expect(eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'selfAssess',
    });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('selfConfidence > 100 clamps to 1; < 0 clamps to 0', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    const handler = socket.handlers.get('self-assess:submit')!;

    await handler(
      { sessionId: 's1', selfConfidence: 250, selfIdentifiedRisk: 'r', responseTimeMs: 0 },
      vi.fn(),
    );
    expect(persistSelfAssessMock).toHaveBeenLastCalledWith('s1', {
      confidence: 1,
      reasoning: 'r',
    });

    await handler(
      { sessionId: 's2', selfConfidence: -10, responseTimeMs: 0 },
      vi.fn(),
    );
    expect(persistSelfAssessMock).toHaveBeenLastCalledWith('s2', {
      confidence: 0,
      reasoning: '',
    });
  });

  it('NaN selfConfidence rejected by zod schema → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('self-assess:submit')!(
      { sessionId: 's1', selfConfidence: Number.NaN, responseTimeMs: 0 },
      ack,
    );

    expect(persistSelfAssessMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('selfIdentifiedRisk omitted → reasoning is empty string (V5 type requires field)', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('self-assess:submit')!(
      { sessionId: 's1', selfConfidence: 50, responseTimeMs: 100 },
      ack,
    );

    expect(persistSelfAssessMock).toHaveBeenCalledWith('s1', {
      confidence: 0.5,
      reasoning: '',
    });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('schema invalid (missing sessionId) → ack(false), no persist, no emit', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('self-assess:submit')!(
      { selfConfidence: 75, responseTimeMs: 100 },
      ack,
    );

    expect(persistSelfAssessMock).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('persist throws → ack(false), no MODULE_SUBMITTED emit', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);
    persistSelfAssessMock.mockRejectedValueOnce(new Error('db down'));
    const ack = vi.fn();

    await socket.handlers.get('self-assess:submit')!(
      { sessionId: 's1', selfConfidence: 75, responseTimeMs: 100 },
      ack,
    );

    expect(persistSelfAssessMock).toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerSelfAssessHandlers({} as never, socket as never);

    await expect(
      socket.handlers.get('self-assess:submit')!({
        sessionId: 's1',
        selfConfidence: 75,
        responseTimeMs: 100,
      }),
    ).resolves.toBeUndefined();
    expect(persistSelfAssessMock).toHaveBeenCalled();
  });
});
