/**
 * Tests for src/socket/behavior-handlers.
 *
 * Covers:
 *   - registers `behavior:batch` on connect
 *   - persists ai_completion_responded events with full field mapping (Task 22)
 *   - dispatches chat / diff / file / edit-session events (Task 30a)
 *   - drops unmapped event types (cursor_move, key_press, etc.)
 *   - rejects invalid envelope (missing sessionId / events) without throwing
 *   - tolerates persist errors (no socket crash)
 *   - lineNumber accepts both `line` and `lineNumber` payload keys
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appendAiCompletionEvents: vi.fn(),
  appendChatEvents: vi.fn(),
  appendDiffEvents: vi.fn(),
  appendFileNavigation: vi.fn(),
  appendEditSessions: vi.fn(),
}));

vi.mock('../services/modules/mb.service.js', () => ({
  appendAiCompletionEvents: mocks.appendAiCompletionEvents,
  appendChatEvents: mocks.appendChatEvents,
  appendDiffEvents: mocks.appendDiffEvents,
  appendFileNavigation: mocks.appendFileNavigation,
  appendEditSessions: mocks.appendEditSessions,
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
  for (const m of Object.values(mocks)) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
});

describe('registerBehaviorHandlers — wiring', () => {
  it('registers behavior:batch on the socket', () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);
    expect(ee.listeners('behavior:batch').length).toBeGreaterThan(0);
  });
});

describe('behavior:batch — ai_completion_responded persistence (Task 22)', () => {
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
          type: 'cursor_move',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { x: 1, y: 2 },
        },
        {
          type: 'key_press',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: {},
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents).not.toHaveBeenCalled();
  });
});

describe('behavior:batch — chat dispatch (Task 30a)', () => {
  it('maps chat_prompt_sent / chat_response_received → appendChatEvents', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'chat_prompt_sent',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { prompt: 'fix the inventory race', responseLength: 0, duration: 0 },
        },
        {
          type: 'chat_response_received',
          timestamp: '2026-04-19T10:00:05.000Z',
          payload: {
            prompt: 'fix the inventory race',
            responseLength: 320,
            duration: 5000,
            diffShownAt: 1700000000005,
            diffRespondedAt: 1700000000010,
            documentVisibleMs: 5,
          },
        },
      ],
    });

    expect(mocks.appendChatEvents).toHaveBeenCalledOnce();
    const [, events] = mocks.appendChatEvents.mock.calls[0];
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ prompt: 'fix the inventory race', responseLength: 0, duration: 0 });
    expect(events[1]).toMatchObject({
      prompt: 'fix the inventory race',
      responseLength: 320,
      duration: 5000,
      diffShownAt: 1700000000005,
    });
  });

  it('drops chat event with malformed payload (missing prompt)', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'chat_prompt_sent',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { promptLength: 100 }, // legacy AIChatPanel emit shape
        },
      ],
    });

    expect(mocks.appendChatEvents).not.toHaveBeenCalled();
  });
});

describe('behavior:batch — diff dispatch (Task 30a)', () => {
  it('maps diff_accepted / diff_rejected → appendDiffEvents and infers accepted from event type', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'diff_accepted',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { linesAdded: 5, linesRemoved: 2 },
        },
        {
          type: 'diff_rejected',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: { linesAdded: 12, linesRemoved: 0 },
        },
      ],
    });

    expect(mocks.appendDiffEvents).toHaveBeenCalledOnce();
    const [, events] = mocks.appendDiffEvents.mock.calls[0];
    expect(events).toEqual([
      { timestamp: Date.parse('2026-04-19T10:00:00.000Z'), accepted: true, linesAdded: 5, linesRemoved: 2 },
      { timestamp: Date.parse('2026-04-19T10:00:01.000Z'), accepted: false, linesAdded: 12, linesRemoved: 0 },
    ]);
  });
});

describe('behavior:batch — file navigation dispatch (Task 30a)', () => {
  it('maps file_opened / file_switched / file_closed → appendFileNavigation and infers action from event type', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'file_opened',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { filePath: 'src/repo.py' },
        },
        {
          type: 'file_switched',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: { path: 'src/service.py' },
        },
        {
          type: 'file_closed',
          timestamp: '2026-04-19T10:00:02.000Z',
          payload: { filePath: 'src/repo.py', duration: 2000 },
        },
      ],
    });

    expect(mocks.appendFileNavigation).toHaveBeenCalledOnce();
    const [, events] = mocks.appendFileNavigation.mock.calls[0];
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({
      timestamp: Date.parse('2026-04-19T10:00:00.000Z'),
      filePath: 'src/repo.py',
      action: 'open',
    });
    expect(events[1].action).toBe('switch');
    expect(events[1].filePath).toBe('src/service.py');
    expect(events[2].action).toBe('close');
    expect(events[2].duration).toBe(2000);
  });
});

describe('behavior:batch — edit session dispatch (Task 30a placeholder for 30b)', () => {
  it('maps edit_session_completed → appendEditSessions', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'edit_session_completed',
          timestamp: '2026-04-19T10:00:30.000Z',
          payload: {
            filePath: 'src/repo.py',
            startTime: 1700000000000,
            endTime: 1700000030000,
            keystrokeCount: 87,
          },
        },
      ],
    });

    expect(mocks.appendEditSessions).toHaveBeenCalledOnce();
    expect(mocks.appendEditSessions.mock.calls[0][1]).toEqual([
      {
        filePath: 'src/repo.py',
        startTime: 1700000000000,
        endTime: 1700000030000,
        keystrokeCount: 87,
      },
    ]);
  });
});

describe('behavior:batch — multi-pipeline dispatch in one batch', () => {
  it('routes a heterogeneous batch to all 5 appendXxx methods', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await dispatch(ee, 'behavior:batch', {
      sessionId: 'sess-1',
      events: [
        {
          type: 'ai_completion_responded',
          timestamp: '2026-04-19T10:00:00.000Z',
          payload: { line: 1, completionLength: 5, accepted: true },
        },
        {
          type: 'chat_prompt_sent',
          timestamp: '2026-04-19T10:00:01.000Z',
          payload: { prompt: 'q', responseLength: 0, duration: 0 },
        },
        {
          type: 'diff_accepted',
          timestamp: '2026-04-19T10:00:02.000Z',
          payload: { linesAdded: 1, linesRemoved: 0 },
        },
        {
          type: 'file_opened',
          timestamp: '2026-04-19T10:00:03.000Z',
          payload: { filePath: 'a.py' },
        },
        {
          type: 'edit_session_completed',
          timestamp: '2026-04-19T10:00:04.000Z',
          payload: { filePath: 'a.py', startTime: 1, endTime: 2, keystrokeCount: 5 },
        },
        {
          type: 'cursor_move', // unmapped — silent drop
          timestamp: '2026-04-19T10:00:05.000Z',
          payload: { x: 1 },
        },
      ],
    });

    expect(mocks.appendAiCompletionEvents).toHaveBeenCalledOnce();
    expect(mocks.appendChatEvents).toHaveBeenCalledOnce();
    expect(mocks.appendDiffEvents).toHaveBeenCalledOnce();
    expect(mocks.appendFileNavigation).toHaveBeenCalledOnce();
    expect(mocks.appendEditSessions).toHaveBeenCalledOnce();
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

  it('does not crash when one persist throws — other pipelines still run', async () => {
    mocks.appendChatEvents.mockRejectedValueOnce(new Error('db blew up'));
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    await expect(
      dispatch(ee, 'behavior:batch', {
        sessionId: 'sess-1',
        events: [
          {
            type: 'chat_prompt_sent',
            timestamp: '2026-04-19T10:00:00.000Z',
            payload: { prompt: 'q', responseLength: 0, duration: 0 },
          },
          {
            type: 'diff_accepted',
            timestamp: '2026-04-19T10:00:01.000Z',
            payload: { linesAdded: 1, linesRemoved: 0 },
          },
        ],
      }),
    ).resolves.toBeUndefined();

    // Chat threw, but diff still ran.
    expect(mocks.appendDiffEvents).toHaveBeenCalledOnce();
  });
});
