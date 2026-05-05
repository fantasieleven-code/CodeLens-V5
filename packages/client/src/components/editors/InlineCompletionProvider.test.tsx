import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type * as Monaco from 'monaco-editor';

/**
 * Socket double — bidirectional, supporting `once` semantics used by the
 * completion request/response pattern.
 */
let mockSocket: {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  onceHandlers: Record<string, ((...args: unknown[]) => void)[]>;
  fireOnce: (event: string, ...args: unknown[]) => void;
};

function newMockSocket(): typeof mockSocket {
  const onceHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    emit: vi.fn(),
    on: vi.fn(),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (onceHandlers[event] ??= []).push(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const arr = onceHandlers[event];
      if (arr) onceHandlers[event] = arr.filter((h) => h !== handler);
    }),
    onceHandlers,
    fireOnce(event: string, ...args: unknown[]) {
      const arr = onceHandlers[event] ?? [];
      onceHandlers[event] = [];
      arr.forEach((h) => h(...args));
    },
  };
}

vi.mock('../../lib/socket.js', () => ({
  getSocket: () => mockSocket,
  setSocketSessionId: vi.fn(),
}));

import { InlineCompletionProvider } from './InlineCompletionProvider.js';

const REASON_KIND = { Accepted: 0, Rejected: 1, Ignored: 2 } as const;

interface RegisteredProvider {
  language: string;
  provider: Monaco.languages.InlineCompletionsProvider;
  disposed: boolean;
}

function makeMonacoMock(): {
  monaco: typeof Monaco;
  registered: RegisteredProvider[];
} {
  const registered: RegisteredProvider[] = [];
  const monaco = {
    languages: {
      registerInlineCompletionsProvider: vi.fn((language: string, provider: unknown) => {
        const entry: RegisteredProvider = {
          language,
          provider: provider as Monaco.languages.InlineCompletionsProvider,
          disposed: false,
        };
        registered.push(entry);
        return {
          dispose: () => {
            entry.disposed = true;
          },
        };
      }),
      InlineCompletionEndOfLifeReasonKind: REASON_KIND,
    },
  } as unknown as typeof Monaco;
  return { monaco, registered };
}

function makeModel(content: string): Monaco.editor.ITextModel {
  return { getValue: () => content } as unknown as Monaco.editor.ITextModel;
}

function makeToken(cancelled = false): Monaco.CancellationToken {
  return { isCancellationRequested: cancelled } as unknown as Monaco.CancellationToken;
}

function makePosition(line: number, column: number): Monaco.Position {
  return { lineNumber: line, column } as unknown as Monaco.Position;
}

/** Instant-resolve sleep — makes debounce non-blocking for most tests. */
const noSleep = (_ms: number, signal: AbortSignal) =>
  signal.aborted ? Promise.reject(new Error('aborted')) : Promise.resolve();

/** Visibility options that report "always visible" — keeps tests deterministic. */
const alwaysVisible = {
  now: () => 1000,
  isHidden: () => false,
  onVisibilityChange: () => () => {},
};

beforeEach(() => {
  mockSocket = newMockSocket();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InlineCompletionProvider', () => {
  it('registers one provider per language when enabled', () => {
    const { monaco, registered } = makeMonacoMock();
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript', 'python']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
      />,
    );
    expect(registered).toHaveLength(2);
    expect(registered[0].language).toBe('typescript');
    expect(registered[1].language).toBe('python');
  });

  it('does NOT register when enabled=false', () => {
    const { monaco, registered } = makeMonacoMock();
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        enabled={false}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
      />,
    );
    expect(registered).toHaveLength(0);
  });

  it('emits completion_request with sessionId + filePath + line/column after debounce', async () => {
    const { monaco, registered } = makeMonacoMock();
    render(
      <InlineCompletionProvider
        sessionId="sess-42"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('const x ='),
      makePosition(1, 10),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    // Fire the response after the request has been emitted.
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: ' 1;' });
    await pending;
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:completion_request',
      expect.objectContaining({
        sessionId: 'sess-42',
        filePath: 'src/main.ts',
        content: 'const x =',
        line: 1,
        column: 10,
      }),
    );
  });

  it('aborts the first in-flight request when a superseding call fires', async () => {
    const { monaco, registered } = makeMonacoMock();
    // Sleep that only resolves when abort fires — simulates "still waiting in debounce".
    const hangUntilAbort = (_ms: number, signal: AbortSignal) =>
      new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { unmount } = render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={hangUntilAbort}
        visibilityOptions={alwaysVisible}
      />,
    );
    const provider = registered[0].provider;
    const firstPending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(1, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    // Superseding call — component calls abortRef.abort() on the first one.
    provider.provideInlineCompletions(
      makeModel('xy'),
      makePosition(1, 3),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    const first = await firstPending;
    expect(first).toEqual({ items: [] });
    // Neither call has reached the socket yet (both still in debounce).
    expect(mockSocket.emit).not.toHaveBeenCalled();
    // Unmount aborts the second one so the test doesn't hang.
    unmount();
  });

  it('returns empty items when the backend sends an empty completion', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(1, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: '' });
    const result = await pending;
    expect(result).toEqual({ items: [] });
    // No "shown" emitted for an empty completion.
    expect(tracker.track).not.toHaveBeenCalledWith('ai_completion_shown', expect.any(Object));
  });

  it('tracks ai_completion_shown and returns items on a non-empty response', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('const x = '),
      makePosition(3, 11),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: '42;' });
    const result = await pending;
    expect(result?.items).toHaveLength(1);
    expect(result?.items[0].insertText).toBe('42;');
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_shown',
      expect.objectContaining({
        filePath: 'src/main.ts',
        line: 3,
        completionLength: 3,
      }),
    );
  });

  it('fires ai_completion_accepted + ai_completion_responded (accepted:true) on Accepted end-of-lifetime', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    // Advance the clock between shown and responded so documentVisibleMs is non-zero.
    let clock = 1000;
    const clockVisibility = {
      now: () => clock,
      isHidden: () => false,
      onVisibilityChange: () => () => {},
    };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={clockVisibility}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(2, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: 'ABC' });
    const result = await pending;
    const item = result!.items[0];
    clock = 1750;
    const completions = { items: [item] } as unknown as Monaco.languages.InlineCompletions;
    provider.handleEndOfLifetime!(
      completions,
      item,
      { kind: REASON_KIND.Accepted } as never,
      {} as never,
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_accepted',
      expect.objectContaining({
        filePath: 'src/main.ts',
        line: 2,
        completionLength: 3,
        accepted: true,
      }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_responded',
      expect.objectContaining({
        accepted: true,
        shown: true,
        rejected: false,
        shownAt: 1000,
        respondedAt: 1750,
        documentVisibleMs: 750,
      }),
    );
  });

  it('fires ai_completion_rejected + responded (accepted:false) on Rejected end-of-lifetime', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(1, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: 'XYZ' });
    const result = await pending;
    const item = result!.items[0];
    const completions = { items: [item] } as unknown as Monaco.languages.InlineCompletions;
    provider.handleEndOfLifetime!(
      completions,
      item,
      { kind: REASON_KIND.Rejected } as never,
      {} as never,
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_rejected',
      expect.objectContaining({ accepted: false }),
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_responded',
      expect.objectContaining({ accepted: false, rejected: true }),
    );
  });

  it('folds Ignored end-of-lifetime into accepted:false (V5.0 contract)', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(1, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: 'Q' });
    const result = await pending;
    const item = result!.items[0];
    const completions = { items: [item] } as unknown as Monaco.languages.InlineCompletions;
    provider.handleEndOfLifetime!(
      completions,
      item,
      { kind: REASON_KIND.Ignored, userTypingDisagreed: true } as never,
      {} as never,
    );
    expect(tracker.track).toHaveBeenCalledWith(
      'ai_completion_rejected',
      expect.objectContaining({ accepted: false }),
    );
  });

  it('accumulates documentVisibleMs only while the tab is foregrounded', async () => {
    const { monaco, registered } = makeMonacoMock();
    const tracker = { track: vi.fn() };
    let clock = 1000;
    let hidden = false;
    const listeners: Array<() => void> = [];
    const visibility = {
      now: () => clock,
      isHidden: () => hidden,
      onVisibilityChange: (h: () => void) => {
        listeners.push(h);
        return () => {
          const i = listeners.indexOf(h);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
    };
    render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={visibility}
        behaviorTracker={tracker}
      />,
    );
    const provider = registered[0].provider;
    const pending = provider.provideInlineCompletions(
      makeModel('x'),
      makePosition(1, 2),
      {} as Monaco.languages.InlineCompletionContext,
      makeToken(),
    );
    await Promise.resolve();
    mockSocket.fireOnce('v5:mb:completion_response', { completion: 'Q' });
    const result = await pending;
    const item = result!.items[0];
    // 200ms visible.
    clock = 1200;
    // Tab away for 500ms.
    hidden = true;
    listeners.forEach((h) => h());
    clock = 1700;
    // Tab back for another 100ms.
    hidden = false;
    listeners.forEach((h) => h());
    clock = 1800;
    provider.handleEndOfLifetime!(
      { items: [item] } as unknown as Monaco.languages.InlineCompletions,
      item,
      { kind: REASON_KIND.Accepted } as never,
      {} as never,
    );
    const respondedCall = tracker.track.mock.calls.find((c) => c[0] === 'ai_completion_responded');
    expect(respondedCall).toBeTruthy();
    expect(respondedCall![1]).toMatchObject({
      shownAt: 1000,
      respondedAt: 1800,
      documentVisibleMs: 300, // 200 + 100, excludes the 500ms hidden
    });
  });

  it('disposes the provider on unmount', () => {
    const { monaco, registered } = makeMonacoMock();
    const { unmount } = render(
      <InlineCompletionProvider
        sessionId="s1"
        monacoInstance={monaco}
        languageIds={['typescript']}
        getCurrentFilePath={() => 'src/main.ts'}
        sleep={noSleep}
        visibilityOptions={alwaysVisible}
      />,
    );
    expect(registered[0].disposed).toBe(false);
    unmount();
    expect(registered[0].disposed).toBe(true);
  });
});
