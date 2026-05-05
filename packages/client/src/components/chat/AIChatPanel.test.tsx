import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';

/**
 * Bidirectional socket double — lets the test simulate server→client events
 * by invoking captured handlers, and asserts client→server emit payloads.
 * Declared as a module-level `let` so vi.mock can close over it (vi.mock
 * factories can only reference variables prefixed `mock*`).
 */
let mockSocket: {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  handlers: Record<string, ((...args: unknown[]) => void)[]>;
  fire: (event: string, ...args: unknown[]) => void;
};

function newMockSocket(): typeof mockSocket {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    handlers,
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const arr = handlers[event];
      if (arr) handlers[event] = arr.filter((h) => h !== handler);
    }),
    fire(event: string, ...args: unknown[]) {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };
}

vi.mock('../../lib/socket.js', () => ({
  getSocket: () => mockSocket,
  setSocketSessionId: vi.fn(),
}));

import { AIChatPanel, type ChatFile } from './AIChatPanel.js';

const FILES: ChatFile[] = [
  { path: 'src/main.ts', content: 'const x = 1;', language: 'typescript' },
  { path: 'src/util.ts', content: 'export const k = 0;', language: 'typescript' },
];

beforeEach(() => {
  mockSocket = newMockSocket();
});

afterEach(() => {
  cleanup();
});

describe('AIChatPanel', () => {
  it('mounts with empty history and prompt input', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} />);
    expect(screen.getByTestId('mb-chat-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-chat-input')).toBeInTheDocument();
    expect(screen.getByTestId('mb-chat-send')).toBeDisabled();
  });

  it('subscribes to chat_stream and chat_complete on mount', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} />);
    expect(mockSocket.handlers['v5:mb:chat_stream']?.length).toBe(1);
    expect(mockSocket.handlers['v5:mb:chat_complete']?.length).toBe(1);
  });

  it('emits v5:mb:chat_generate with sessionId + prompt + filesContext on send', () => {
    render(<AIChatPanel sessionId="sess-42" files={FILES} onDiffReady={vi.fn()} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), {
      target: { value: 'rename x to counter' },
    });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:chat_generate',
      expect.objectContaining({
        sessionId: 'sess-42',
        prompt: 'rename x to counter',
        filesContext: expect.stringContaining('src/main.ts'),
      }),
    );
  });

  it('accumulates chat_stream chunks into the assistant message', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    act(() => {
      mockSocket.fire('v5:mb:chat_stream', { content: 'Hello', done: false });
      mockSocket.fire('v5:mb:chat_stream', { content: ' world', done: true });
    });
    const assistantMsg = screen.getByTestId('mb-chat-message-1');
    expect(assistantMsg).toHaveAttribute('data-role', 'assistant');
    expect(assistantMsg).toHaveTextContent('Hello world');
  });

  it('calls onDiffReady with the parsed diff on chat_complete with valid unified diff', () => {
    const onDiffReady = vi.fn();
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={onDiffReady} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'bump x' } });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    const validDiff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1;',
      '+const x = 2;',
    ].join('\n');
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: validDiff });
    });
    expect(onDiffReady).toHaveBeenCalledWith({
      path: 'src/main.ts',
      oldContent: 'const x = 1;',
      newContent: 'const x = 2;',
    });
  });

  it('tracks chat_response_received with server-ingestable prompt telemetry', () => {
    const behaviorTracker = { track: vi.fn() };
    render(
      <AIChatPanel
        sessionId="s1"
        files={FILES}
        onDiffReady={vi.fn()}
        behaviorTracker={behaviorTracker}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-chat-input'), {
      target: { value: 'verify src/main.ts edge case because x changes' },
    });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    const validDiff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1;',
      '+const x = 2;',
    ].join('\n');
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: validDiff });
    });

    expect(behaviorTracker.track).toHaveBeenCalledWith(
      'chat_response_received',
      expect.objectContaining({
        prompt: 'verify src/main.ts edge case because x changes',
        responseLength: validDiff.length,
        duration: expect.any(Number),
      }),
    );
    expect(behaviorTracker.track).not.toHaveBeenCalledWith(
      'chat_prompt_sent',
      expect.objectContaining({ promptLength: expect.any(Number) }),
    );
  });

  it('surfaces a parse error and does NOT call onDiffReady on malformed diff', () => {
    const onDiffReady = vi.fn();
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={onDiffReady} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: 'not a diff' });
    });
    expect(onDiffReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('mb-chat-error')).toHaveTextContent(/parse failed/i);
  });

  it('opens the @ selector when the prompt ends with a bare "@"', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'look at @' } });
    expect(screen.getByTestId('mb-at-selector')).toBeInTheDocument();
    expect(screen.getByTestId('mb-at-files-list')).toBeInTheDocument();
    for (const f of FILES) {
      expect(screen.getByTestId(`mb-at-file-item-${f.path}`)).toBeInTheDocument();
    }
  });

  it('inserts a fenced code block when a @ file is selected', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} />);
    const textarea = screen.getByTestId('mb-chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Check @' } });
    fireEvent.click(screen.getByTestId('mb-at-file-item-src/main.ts'));
    expect(textarea.value).toContain('```typescript src/main.ts');
    expect(textarea.value).toContain('const x = 1;');
    expect(screen.queryByTestId('mb-at-selector')).not.toBeInTheDocument();
  });

  it('disables the input while a diff is pending', () => {
    const onDiffReady = vi.fn();
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={onDiffReady} />);
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'bump x' } });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    const validDiff = [
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,1 +1,1 @@',
      '-const x = 1;',
      '+const x = 2;',
    ].join('\n');
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: validDiff });
    });
    expect(screen.getByTestId('mb-chat-input')).toBeDisabled();
  });

  it('respects the disabled prop independently of internal state', () => {
    render(<AIChatPanel sessionId="s1" files={FILES} onDiffReady={vi.fn()} disabled />);
    expect(screen.getByTestId('mb-chat-input')).toBeDisabled();
    expect(screen.getByTestId('mb-chat-send')).toBeDisabled();
  });

  it('tracks diff_responded with visibility timing once the parent flips disabled back off', () => {
    const behaviorTracker = { track: vi.fn() };
    const onDiffReady = vi.fn();
    const { rerender } = render(
      <AIChatPanel
        sessionId="s1"
        files={FILES}
        onDiffReady={onDiffReady}
        behaviorTracker={behaviorTracker}
      />,
    );
    fireEvent.change(screen.getByTestId('mb-chat-input'), { target: { value: 'bump x' } });
    fireEvent.click(screen.getByTestId('mb-chat-send'));
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', {
        diff: [
          '--- a/src/main.ts',
          '+++ b/src/main.ts',
          '@@ -1,1 +1,1 @@',
          '-const x = 1;',
          '+const x = 2;',
        ].join('\n'),
      });
    });
    // Parent flags it's processing the diff: disabled=true.
    rerender(
      <AIChatPanel
        sessionId="s1"
        files={FILES}
        onDiffReady={onDiffReady}
        behaviorTracker={behaviorTracker}
        disabled
      />,
    );
    expect(behaviorTracker.track).not.toHaveBeenCalledWith('diff_responded', expect.any(Object));
    // Parent resolves the diff (accept/reject in MultiFileEditor), clears its
    // pendingDiff, and flips disabled back off — the true→false transition
    // fires diff_responded with accumulated visibility ms.
    rerender(
      <AIChatPanel
        sessionId="s1"
        files={FILES}
        onDiffReady={onDiffReady}
        behaviorTracker={behaviorTracker}
      />,
    );
    expect(behaviorTracker.track).toHaveBeenCalledWith(
      'diff_responded',
      expect.objectContaining({
        shownAt: expect.any(Number),
        respondedAt: expect.any(Number),
        documentVisibleMs: expect.any(Number),
      }),
    );
  });
});
