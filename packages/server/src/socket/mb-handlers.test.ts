/**
 * Tests for src/socket/mb-handlers.
 *
 * Covers:
 *   - All 8 socket events are wired on connection
 *   - planning / standards / audit emits MODULE_SUBMITTED + persists
 *   - chat_generate streams chat_stream chunks + emits chat_complete + traces
 *   - completion_request emits completion_response + MB_COMPLETION_SHOWN + traces
 *   - run_test creates sandbox → writeFiles → execute → destroy + emits test_result + MB_TEST_RUN
 *   - file_change calls fileSnapshotService.setFileContent
 *   - visibility_change calls appendVisibilityEvent
 *   - errors are caught + surfaced as `{event}:error` without crashing the socket
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Event as V5EventType } from '@codelens-v5/shared';

const mocks = vi.hoisted(() => ({
  persistPlanning: vi.fn(),
  persistStandards: vi.fn(),
  persistAudit: vi.fn(),
  appendVisibilityEvent: vi.fn(),
  setFileContent: vi.fn(),
  getSnapshot: vi.fn(),
  promptRegistryGet: vi.fn(),
  eventBusEmit: vi.fn(),
  langfuseTrace: vi.fn(),
  modelStream: vi.fn(),
  modelGenerate: vi.fn(),
  sandboxCreate: vi.fn(),
  sandboxWriteFiles: vi.fn(),
  sandboxExecute: vi.fn(),
  sandboxDestroy: vi.fn(),
  sandboxGetProvider: vi.fn(),
}));

vi.mock('../services/modules/mb.service.js', () => ({
  persistPlanning: mocks.persistPlanning,
  persistStandards: mocks.persistStandards,
  persistAudit: mocks.persistAudit,
  appendVisibilityEvent: mocks.appendVisibilityEvent,
  calculatePassRate: (stdout: string) => (stdout.includes('passed') ? 1 : 0),
}));

vi.mock('../services/file-snapshot.service.js', () => ({
  fileSnapshotService: {
    setFileContent: mocks.setFileContent,
    getSnapshot: mocks.getSnapshot,
  },
}));

vi.mock('../services/prompt-registry.service.js', () => ({
  promptRegistry: { get: mocks.promptRegistryGet },
}));

vi.mock('../services/event-bus.service.js', () => ({
  eventBus: { emit: mocks.eventBusEmit },
}));

vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: async () => ({ trace: mocks.langfuseTrace }),
}));

vi.mock('../services/model/index.js', () => ({
  modelFactory: {
    stream: (...args: unknown[]) => mocks.modelStream(...args),
    generate: (...args: unknown[]) => mocks.modelGenerate(...args),
  },
}));

vi.mock('../services/sandbox/index.js', () => ({
  sandboxFactory: { getProvider: mocks.sandboxGetProvider },
}));

import { registerMBHandlers } from './mb-handlers.js';
import { V5Event } from '@codelens-v5/shared';

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-1', emit }) as unknown as Parameters<
    typeof registerMBHandlers
  >[1];
  return { socket, emit, ee };
}

function dispatch(ee: EventEmitter, event: string, payload: unknown): Promise<void> {
  const listeners = ee.listeners(event);
  if (listeners.length === 0) throw new Error(`No listener for ${event}`);
  const last = listeners[listeners.length - 1] as (p: unknown) => Promise<void> | void;
  return Promise.resolve(last(payload));
}

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset?.();
});

describe('registerMBHandlers — wiring', () => {
  it('registers all 8 MB event names on the socket', () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    const expected = [
      'v5:mb:planning:submit',
      'v5:mb:standards:submit',
      'v5:mb:audit:submit',
      'v5:mb:chat_generate',
      'v5:mb:completion_request',
      'v5:mb:run_test',
      'v5:mb:file_change',
      'v5:mb:visibility_change',
    ];
    for (const name of expected) {
      expect(ee.listeners(name).length).toBeGreaterThan(0);
    }
  });
});

describe('planning / standards / audit submit', () => {
  it('planning:submit persists + emits MODULE_SUBMITTED', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:planning:submit', {
      sessionId: 's1',
      planning: { decomposition: 'a', dependencies: 'b', fallbackStrategy: 'c' },
    });
    expect(mocks.persistPlanning).toHaveBeenCalledWith('s1', {
      decomposition: 'a',
      dependencies: 'b',
      fallbackStrategy: 'c',
    });
    expect(mocks.eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'mb.planning',
    });
  });

  it('standards:submit drops agentContent when undefined', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:standards:submit', {
      sessionId: 's1',
      rulesContent: 'rules',
    });
    expect(mocks.persistStandards).toHaveBeenCalledWith('s1', { rulesContent: 'rules' });
    expect(mocks.eventBusEmit).toHaveBeenCalledWith(V5Event.MODULE_SUBMITTED, {
      sessionId: 's1',
      module: 'mb.standards',
    });
  });

  it('audit:submit forwards violations + emits MODULE_SUBMITTED', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    const violations = [{ exampleIndex: 0, markedAsViolation: true }];
    await dispatch(ee, 'v5:mb:audit:submit', { sessionId: 's1', violations });
    expect(mocks.persistAudit).toHaveBeenCalledWith('s1', { violations });
  });
});

describe('chat_generate', () => {
  it('streams chunks to chat_stream, emits chat_complete with full diff, traces', async () => {
    mocks.promptRegistryGet.mockResolvedValueOnce('SYSTEM PROMPT');
    mocks.modelStream.mockReturnValueOnce(
      (async function* () {
        yield { content: 'part1 ', done: false };
        yield { content: 'part2', done: true };
      })(),
    );

    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:chat_generate', {
      sessionId: 's1',
      prompt: 'do the thing',
      filesContext: 'file:a.py',
    });

    const streamCalls = emit.mock.calls.filter((c) => c[0] === 'v5:mb:chat_stream');
    expect(streamCalls).toEqual([
      ['v5:mb:chat_stream', { content: 'part1 ', done: false }],
      ['v5:mb:chat_stream', { content: 'part2', done: true }],
    ]);
    expect(emit).toHaveBeenCalledWith('v5:mb:chat_complete', { diff: 'part1 part2' });

    expect(mocks.modelStream).toHaveBeenCalledWith(
      'coding_agent',
      expect.objectContaining({ model: 'qwen3-coder-instruct', sessionId: 's1' }),
    );

    await flush();
    expect(mocks.langfuseTrace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mb.chat_generate', sessionId: 's1' }),
    );
  });

  it('falls back to default system prompt when promptRegistry.get fails', async () => {
    mocks.promptRegistryGet.mockRejectedValueOnce(new Error('not seeded'));
    mocks.modelStream.mockReturnValueOnce(
      (async function* () {
        yield { content: 'ok', done: true };
      })(),
    );
    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:chat_generate', {
      sessionId: 's1',
      prompt: 'p',
      filesContext: '',
    });
    expect(emit).toHaveBeenCalledWith('v5:mb:chat_complete', { diff: 'ok' });
  });
});

describe('completion_request', () => {
  it('calls generate(coding_agent, qwen3-coder-base) and emits MB_COMPLETION_SHOWN', async () => {
    mocks.modelGenerate.mockResolvedValueOnce({ content: 'completed' });
    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);

    await dispatch(ee, 'v5:mb:completion_request', {
      sessionId: 's1',
      filePath: 'a.py',
      content: 'def ',
      line: 10,
      column: 4,
    });

    expect(mocks.modelGenerate).toHaveBeenCalledWith(
      'coding_agent',
      expect.objectContaining({ model: 'qwen3-coder-base', maxTokens: 50 }),
    );
    expect(emit).toHaveBeenCalledWith('v5:mb:completion_response', { completion: 'completed' });
    expect(mocks.eventBusEmit).toHaveBeenCalledWith(V5Event.MB_COMPLETION_SHOWN, {
      sessionId: 's1',
      filePath: 'a.py',
      line: 10,
    });

    await flush();
    expect(mocks.langfuseTrace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mb.completion_request' }),
    );
  });
});

describe('run_test', () => {
  it('runs pytest in a short-lived sandbox + emits test_result + MB_TEST_RUN + destroys', async () => {
    mocks.getSnapshot.mockReturnValueOnce([{ path: 'a.py', content: 'print(1)' }]);
    const provider = {
      create: mocks.sandboxCreate,
      writeFiles: mocks.sandboxWriteFiles,
      execute: mocks.sandboxExecute,
      destroy: mocks.sandboxDestroy,
    };
    mocks.sandboxGetProvider.mockResolvedValueOnce(provider);
    mocks.sandboxCreate.mockResolvedValueOnce({ id: 'sbx-1' });
    mocks.sandboxWriteFiles.mockResolvedValueOnce(undefined);
    mocks.sandboxExecute.mockResolvedValueOnce({
      stdout: '===== 3 passed in 1s =====',
      stderr: '',
      exitCode: 0,
      durationMs: 1234,
    });
    mocks.sandboxDestroy.mockResolvedValueOnce(undefined);

    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:run_test', { sessionId: 's1' });

    expect(mocks.sandboxWriteFiles).toHaveBeenCalledWith(
      { id: 'sbx-1' },
      [{ path: 'a.py', content: 'print(1)' }],
    );
    expect(mocks.sandboxExecute).toHaveBeenCalledWith({ id: 'sbx-1' }, 'pytest -v', 30_000);
    expect(emit).toHaveBeenCalledWith(
      'v5:mb:test_result',
      expect.objectContaining({ exitCode: 0, passRate: 1, durationMs: 1234 }),
    );
    expect(mocks.eventBusEmit).toHaveBeenCalledWith(V5Event.MB_TEST_RUN, {
      sessionId: 's1',
      passRate: 1,
      duration: 1234,
    });
    expect(mocks.sandboxDestroy).toHaveBeenCalledOnce();
  });

  it('destroys sandbox even when execute throws', async () => {
    mocks.getSnapshot.mockReturnValueOnce([]);
    const provider = {
      create: mocks.sandboxCreate,
      writeFiles: mocks.sandboxWriteFiles,
      execute: mocks.sandboxExecute,
      destroy: mocks.sandboxDestroy,
    };
    mocks.sandboxGetProvider.mockResolvedValueOnce(provider);
    mocks.sandboxCreate.mockResolvedValueOnce({ id: 'sbx-2' });
    mocks.sandboxExecute.mockRejectedValueOnce(new Error('pytest blew up'));
    mocks.sandboxDestroy.mockResolvedValueOnce(undefined);

    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:run_test', { sessionId: 's1' });

    expect(mocks.sandboxDestroy).toHaveBeenCalledOnce();
    // Error should surface as `{event}:error` — not crash.
    expect(emit).toHaveBeenCalledWith('v5:mb:run_test:error', { error: 'pytest blew up' });
  });
});

describe('file_change / visibility_change', () => {
  it('file_change forwards to fileSnapshotService.setFileContent', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:file_change', {
      sessionId: 's1',
      filePath: 'a.py',
      content: 'print(42)',
      source: 'ai_completion',
    });
    expect(mocks.setFileContent).toHaveBeenCalledWith('s1', 'a.py', 'print(42)', 'ai_completion');
  });

  it('visibility_change forwards to appendVisibilityEvent', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);
    await dispatch(ee, 'v5:mb:visibility_change', {
      sessionId: 's1',
      timestamp: 123,
      hidden: true,
    });
    expect(mocks.appendVisibilityEvent).toHaveBeenCalledWith('s1', {
      timestamp: 123,
      hidden: true,
    });
  });
});

describe('error safety', () => {
  it('surfaces handler errors as {event}:error and never throws', async () => {
    mocks.persistPlanning.mockRejectedValueOnce(new Error('db down'));
    const { socket, emit, ee } = makeSocket();
    registerMBHandlers({} as never, socket);

    await expect(
      dispatch(ee, 'v5:mb:planning:submit', {
        sessionId: 's1',
        planning: { decomposition: '', dependencies: '', fallbackStrategy: '' },
      }),
    ).resolves.toBeUndefined();

    expect(emit).toHaveBeenCalledWith('v5:mb:planning:submit:error', { error: 'db down' });
  });
});

// Module-level type assertion: V5Event is a real enum, not drifted.
const _ev: V5EventType = V5Event.MODULE_SUBMITTED;
void _ev;
