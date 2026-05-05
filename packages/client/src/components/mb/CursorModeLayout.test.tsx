/**
 * CursorModeLayout tests — focus on the integration surface the shell owns:
 * - all three panels (editor, chat, terminal) mount side by side
 * - chat.onDiffReady routes into MultiFileEditor.pendingDiff and flips the
 *   editor to readOnly while the diff is pending
 * - accept/reject diff flows call onFileChange / clear pending state
 * - disabled prop propagates to leaf panels
 *
 * Monaco is stubbed (jsdom can't boot workers). The leaf components' own
 * suites cover their internal behaviors — we stay on the seams here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// react-resizable-panels installs a ResizeObserver at mount which jsdom
// doesn't ship. Replace Group/Panel/Separator with pass-through divs — the
// layout library's internals aren't what we're testing here.
// xterm.js pulls in matchMedia + ResizeObserver that jsdom doesn't ship.
// Replace MBTerminalPanel with a minimal stub that preserves the socket
// emit + testids the layout tests care about.
vi.mock('./MBTerminalPanel.js', async () => {
  const React = await import('react');
  const socketMod = await import('../../lib/socket.js');
  return {
    MBTerminalPanel: ({
      sessionId,
      disabled,
    }: {
      sessionId: string;
      disabled?: boolean;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'mb-terminal-root' },
        React.createElement(
          'button',
          {
            'data-testid': 'mb-terminal-run',
            disabled,
            onClick: () => {
              socketMod.getSocket().emit('v5:mb:run_test', { sessionId });
            },
          },
          '运行测试',
        ),
      ),
  };
});

vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Panel: ({
    children,
    'data-testid': testId,
  }: {
    children?: React.ReactNode;
    'data-testid'?: string;
  }) => <div data-testid={testId}>{children}</div>,
  Separator: ({ 'data-testid': testId }: { 'data-testid'?: string }) => (
    <div data-testid={testId} />
  ),
}));

vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({
    value,
    path,
    onChange,
  }: {
    value?: string;
    path?: string;
    language?: string;
    onChange?: (val: string | undefined) => void;
  }) => (
    <textarea
      data-testid="monaco-stub"
      data-path={path}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  useMonaco: () => null,
}));

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

import { CursorModeLayout } from './CursorModeLayout.js';
import type { MultiFileEditorFile } from '../editors/MultiFileEditor.js';

const FILES: MultiFileEditorFile[] = [
  { path: 'main.py', content: 'print("hi")', language: 'python' },
  { path: 'util.py', content: 'def f(): pass', language: 'python' },
];

// Minimal unified diff that parseUnifiedDiff accepts — replaces main.py line 1.
const DIFF = [
  '--- a/main.py',
  '+++ b/main.py',
  '@@ -1,1 +1,1 @@',
  '-print("hi")',
  '+print("bye")',
].join('\n');

beforeEach(() => {
  mockSocket = newMockSocket();
});

afterEach(() => {
  cleanup();
});

describe('CursorModeLayout', () => {
  it('mounts editor, terminal, and chat panels', () => {
    render(
      <CursorModeLayout sessionId="s1" files={FILES} onFileChange={vi.fn()} />,
    );
    expect(screen.getByTestId('mb-cursor-layout')).toBeInTheDocument();
    expect(screen.getByTestId('mb-layout-editor-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mb-layout-terminal-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mb-layout-chat-panel')).toBeInTheDocument();
    expect(screen.getByTestId('mb-terminal-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-editor-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-chat-root')).toBeInTheDocument();
  });

  it('renders resize handles between panels', () => {
    render(
      <CursorModeLayout sessionId="s1" files={FILES} onFileChange={vi.fn()} />,
    );
    expect(screen.getByTestId('mb-layout-resize-horz')).toBeInTheDocument();
    expect(screen.getByTestId('mb-layout-resize-vert')).toBeInTheDocument();
  });

  it('chat diff ready → editor shows pending diff and becomes readOnly', () => {
    render(
      <CursorModeLayout sessionId="s1" files={FILES} onFileChange={vi.fn()} />,
    );
    // Sanity: editor is editable before any diff.
    expect(screen.getByTestId('monaco-stub')).not.toHaveAttribute('readonly');

    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: DIFF });
    });

    // DiffOverlay replaces the Monaco region when a diff is pending.
    expect(screen.getByTestId('mb-diff-overlay')).toBeInTheDocument();
  });

  it('accepting a diff calls onFileChange with the new content and clears overlay', () => {
    const onFileChange = vi.fn();
    const track = vi.fn();
    render(
      <CursorModeLayout
        sessionId="s1"
        files={FILES}
        onFileChange={onFileChange}
        behaviorTracker={{ track }}
      />,
    );
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: DIFF });
    });
    expect(screen.getByTestId('mb-diff-overlay')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mb-diff-accept-btn'));
    expect(onFileChange).toHaveBeenCalledWith('main.py', 'print("bye")');
    expect(track).toHaveBeenCalledWith('diff_accepted', {
      accepted: true,
      linesAdded: 1,
      linesRemoved: 1,
    });
    expect(screen.queryByTestId('mb-diff-overlay')).not.toBeInTheDocument();
  });

  it('rejecting a diff clears overlay without calling onFileChange', () => {
    const onFileChange = vi.fn();
    const track = vi.fn();
    render(
      <CursorModeLayout
        sessionId="s1"
        files={FILES}
        onFileChange={onFileChange}
        behaviorTracker={{ track }}
      />,
    );
    act(() => {
      mockSocket.fire('v5:mb:chat_complete', { diff: DIFF });
    });
    fireEvent.click(screen.getByTestId('mb-diff-reject-btn'));
    expect(onFileChange).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('diff_rejected', {
      accepted: false,
      linesAdded: 1,
      linesRemoved: 1,
    });
    expect(screen.queryByTestId('mb-diff-overlay')).not.toBeInTheDocument();
  });

  it('disabled prop locks terminal and chat panels', () => {
    render(
      <CursorModeLayout
        sessionId="s1"
        files={FILES}
        onFileChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByTestId('mb-terminal-run')).toBeDisabled();
    expect(screen.getByTestId('mb-chat-send')).toBeDisabled();
  });

  it('run test from terminal pane emits v5:mb:run_test with sessionId', () => {
    render(
      <CursorModeLayout sessionId="abc" files={FILES} onFileChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    expect(mockSocket.emit).toHaveBeenCalledWith('v5:mb:run_test', { sessionId: 'abc' });
  });
});
