/**
 * Tests for src/socket/behavior-handlers.
 *
 * Covers:
 *   - registers `behavior:batch` on connect
 *   - persists ai_completion_responded events with full field mapping
 *   - drops non-completion event types (logged + no persist)
 *   - rejects invalid envelope (missing sessionId / events) without throwing
 *   - tolerates persist errors (no socket crash)
 *   - lineNumber accepts both `line` and `lineNumber` payload keys
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendAiCompletionEvents: vi.fn(),
}));

vi.mock('../services/modules/mb.service.js', () => ({
  appendAiCompletionEvents: mocks.appendAiCompletionEvents,
}));

import { registerBehaviorHandlers } from './behavior-handlers.js';

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-1', emit }) as unknown as Parameters<
    typeof registerBehaviorHandlers
  >[1];
  return { socket, emit, ee };
}

function dispatch(ee: EventEmitter, event: string, payload: unknown): Promise<void> {
  const listeners = ee.listeners(event);
  if (listeners.length === 0) throw new Error(`No listener for ${event}`);
  const last = listeners[listeners.length - 1] as (p: unknown) => Promise<void> | void;
  return Promise.resolve(last(payload));
}

beforeEach(() => {
  mocks.appendAiCompletionEvents.mockReset();
  mocks.appendAiCompletionEvents.mockResolvedValue(undefined);
});

describe('registerBehaviorHandlers — wiring', () => {
  it('registers behavior:batch on the socket', () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);
    expect(ee.listeners('behavior:batch').length).toBeGreaterThan(0);
  });
});

describe('behavior:batch — ai_completion_responded persistence', () => {
  it('maps client envelope to AiCompletionEvent + calls appendAiCompletionEvents', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'ai_completion_responded',
          timestamp: '2026-04-19T10:00:00.500Z',
          payload: {
            module: 'mb',
            filePath: 'src/foo.ts',
            line: 42,
            completionLength: 18,
            accepted: true,
            shown: true,
            rejected: false,
            shownAt: 1745059200000,
            respondedAt: 1745059201500,
            documentVisibleMs: 1500,
          },
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents).toHaveBeenCalledOnce();
    const [sessionId, events] = mocks.appendAiCompletionEvents.mock.calls[0];
    expect(sessionId).toBe('sess-1');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      timestamp: Date.parse('2026-04-19T10:00:00.500Z'),
      accepted: true,
      lineNumber: 42,
      completionLength: 18,
      shown: true,
      rejected: false,
      shownAt: 1745059200000,
      respondedAt: 1745059201500,
      documentVisibleMs: 1500,
    });
  });

  it('accepts payload.lineNumber as alias for payload.line', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'ai_completion_responded',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { lineNumber: 9, completionLength: 5, accepted: false },
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents.mock.calls[0][1][0].lineNumber).toBe(9);
  });

  it('skips events missing required fields without dropping the whole batch', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'ai_completion_responded',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { line: 1, completionLength: 5 }, // missing accepted
        },
        {
          type: 'ai_completion_responded',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: { line: 2, completionLength: 5, accepted: true },
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents).toHaveBeenCalledOnce();
    expect(mocks.appendAiCompletionEvents.mock.calls[0][1]).toHaveLength(1);
    expect(mocks.appendAiCompletionEvents.mock.calls[0][1][0].lineNumber).toBe(2);
  });

  it('does not call appendAiCompletionEvents when batch has no completion events', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'chat_prompt_sent',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { promptLength: 100 },
        },
        {
          type: 'file_opened',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: { path: 'a.ts' },
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents).not.toHaveBeenCalled();
  });
});

describe('behavior:batch — envelope validation', () => {
  it('drops batch with missing sessionId', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', { events: [] });
    expect(mocks.appendAiCompletionEvents).not.toHaveBeenCalled();
  });

  it('drops batch with empty sessionId string', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', { sessionId: '', events: [] });
    expect(mocks.appendAiCompletionEvents).not.toHaveBeenCalled();
  });

  it('drops batch with non-array events', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', { sessionId: 'sess-1', events: 'oops' });
    expect(mocks.appendAiCompletionEvents).not.toHaveBeenCalled();
  });

  it('does not crash when persist throws', async () => {
    mocks.appendAiCompletionEvents.mockRejectedValueOnce(new Error('db blew up'));
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await expect(
      dispatch(ee, 'behavior:batch', {
        sessionId: 'sess-1',
        events: [
          {
            type: 'ai_completion_responded',
            timestamp: '2026-04-19T10:00:00.000Z',
            payload: { line: 1, completionLength: 5, accepted: true },
          },
        ],
      }),
    ).resolves.toBeUndefined();
  });
});
