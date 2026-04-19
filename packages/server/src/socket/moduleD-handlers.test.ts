/**
 * Tests for socket/moduleD-handlers.
 *
 * Covers:
 *   - registers exactly the moduleD:submit listener
 *   - happy path: V5ModuleDSubmission persisted as-is, MODULE_SUBMITTED with
 *     module:'moduleD' emitted, ack(true)
 *   - schema invalid (missing sessionId / wrong subModules shape /
 *     constraintsSelected non-array / missing tradeoffText) → ack(false), no persist
 *   - persist throws → ack(false), no MODULE_SUBMITTED emit
 *   - ack omitted → does not throw
 *   - subModules[].interfaces optional: present and absent both pass through
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';

const persistMock = vi.hoisted(() => vi.fn());
const eventBusEmit = vi.hoisted(() => vi.fn());

vi.mock('../services/modules/md.service.js', () => ({
  persistModuleDSubmission: persistMock,
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: eventBusEmit },
}));

import { registerModuleDHandlers } from './moduleD-handlers.js';
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
    id: 'sock-md-1',
    handlers,
    on: (event, handler) => {
      handlers.set(event, handler);
    },
  };
}

const VALID_SUBMISSION: V5ModuleDSubmission = {
  subModules: [
    { name: 'gateway', responsibility: '入口鉴权 + 限流', interfaces: ['POST /v1/orders'] },
    { name: 'inventory', responsibility: '库存扣减原子化' },
  ],
  interfaceDefinitions: ['POST /v1/orders { skuId, qty } → { orderId }'],
  dataFlowDescription: 'gateway → inventory(Redis Lua) → MQ → fulfillment',
  constraintsSelected: ['high_throughput', 'eventual_consistency'],
  tradeoffText: '吞吐换强一致:Lua + 异步对账,代价是对账延迟 30s',
  aiOrchestrationPrompts: [
    '帮我列出秒杀场景下需要原子操作的步骤',
    '审视这个数据流是否有死锁风险',
  ],
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

describe('registerModuleDHandlers · moduleD:submit', () => {
  it('registers exactly the moduleD:submit listener', () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    expect(Array.from(socket.handlers.keys())).toEqual(['moduleD:submit']);
  });

  it('happy path: persists V5 submission as-is, emits MODULE_SUBMITTED, ack(true)', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleD:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalledWith('s1', VALID_SUBMISSION);
    expect(eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'moduleD',
    });
    expect(ack).toHaveBeenCalledWith(true);
  });

  it('subModules[].interfaces present: passed through unchanged', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);

    await socket.handlers.get('moduleD:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          subModules: [{ name: 'svc', responsibility: 'r', interfaces: ['POST /a'] }],
        },
      },
      vi.fn(),
    );

    const arg = persistMock.mock.calls[0][1] as V5ModuleDSubmission;
    expect(arg.subModules[0].interfaces).toEqual(['POST /a']);
  });

  it('subModules[].interfaces absent: passed through without the field', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);

    await socket.handlers.get('moduleD:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          subModules: [{ name: 'svc', responsibility: 'r' }],
        },
      },
      vi.fn(),
    );

    const arg = persistMock.mock.calls[0][1] as V5ModuleDSubmission;
    expect(Object.prototype.hasOwnProperty.call(arg.subModules[0], 'interfaces')).toBe(false);
  });

  it('schema invalid (missing sessionId) → ack(false), no persist, no emit', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleD:submit')!({ submission: VALID_SUBMISSION }, ack);

    expect(persistMock).not.toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (subModules[0] missing required name) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleD:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          subModules: [{ responsibility: 'r' } as unknown as { name: string; responsibility: string }],
        },
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (constraintsSelected non-array) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    const ack = vi.fn();

    await socket.handlers.get('moduleD:submit')!(
      {
        sessionId: 's1',
        submission: {
          ...VALID_SUBMISSION,
          constraintsSelected: 'not-an-array' as unknown as string[],
        },
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('schema invalid (tradeoffText missing) → ack(false), no persist', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    const ack = vi.fn();

    const { tradeoffText: _t, ...withoutTradeoff } = VALID_SUBMISSION;
    void _t;

    await socket.handlers.get('moduleD:submit')!(
      {
        sessionId: 's1',
        submission: withoutTradeoff as unknown as V5ModuleDSubmission,
      },
      ack,
    );

    expect(persistMock).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('persist throws → ack(false), no MODULE_SUBMITTED emit', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);
    persistMock.mockRejectedValueOnce(new Error('db down'));
    const ack = vi.fn();

    await socket.handlers.get('moduleD:submit')!(
      { sessionId: 's1', submission: VALID_SUBMISSION },
      ack,
    );

    expect(persistMock).toHaveBeenCalled();
    expect(eventBusEmit).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(false);
  });

  it('ack omitted: handler does not throw', async () => {
    const socket = newFakeSocket();
    registerModuleDHandlers({} as never, socket as never);

    await expect(
      socket.handlers.get('moduleD:submit')!({ sessionId: 's1', submission: VALID_SUBMISSION }),
    ).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalled();
  });
});
