/**
 * MBTerminalPanel tests — use the `terminalFactory` injection to replace the
 * real xterm Terminal with a spy. jsdom doesn't fully support xterm's canvas
 * rendering, and the component's socket-wiring is the interesting surface
 * to test anyway.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EventEmitter } from 'node:events';

import { MBTerminalPanel, type TerminalLike } from './MBTerminalPanel.js';

interface FakeSocket {
  emit: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (data: unknown) => void) => void;
  off: (event: string, handler: (data: unknown) => void) => void;
  fire: (event: string, data: unknown) => void;
}

function makeFakeSocket(): FakeSocket {
  const emitter = new EventEmitter();
  return {
    emit: vi.fn(),
    on: (event, handler) => emitter.on(event, handler as (d: unknown) => void),
    off: (event, handler) => emitter.off(event, handler as (d: unknown) => void),
    fire: (event, data) => emitter.emit(event, data),
  };
}

function makeFakeTerminal(): TerminalLike & {
  writes: string[];
  cleared: number;
  disposed: boolean;
} {
  const writes: string[] = [];
  let cleared = 0;
  let disposed = false;
  return {
    open: vi.fn(),
    write: (s) => {
      writes.push(s);
    },
    writeln: (s) => {
      writes.push(s + '\n');
    },
    clear: () => {
      cleared += 1;
    },
    dispose: () => {
      disposed = true;
    },
    get writes() {
      return writes;
    },
    get cleared() {
      return cleared;
    },
    get disposed() {
      return disposed;
    },
  };
}

afterEach(() => {
  cleanup();
});

describe('MBTerminalPanel', () => {
  let socket: FakeSocket;
  let terminal: ReturnType<typeof makeFakeTerminal>;
  let factory: () => TerminalLike;

  beforeEach(() => {
    socket = makeFakeSocket();
    terminal = makeFakeTerminal();
    factory = () => terminal;
  });

  it('mounts and shows the idle banner', () => {
    render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    expect(screen.getByTestId('mb-terminal-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-terminal-banner')).toHaveTextContent('尚未运行');
    expect(screen.getByTestId('mb-terminal-run')).not.toBeDisabled();
  });

  it('run button emits v5:mb:run_test with sessionId', () => {
    render(
      <MBTerminalPanel
        sessionId="sess-123"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    expect(socket.emit).toHaveBeenCalledWith('v5:mb:run_test', { sessionId: 'sess-123' });
    // During run state button text flips.
    expect(screen.getByTestId('mb-terminal-run')).toHaveTextContent('运行中…');
    expect(screen.getByTestId('mb-terminal-run')).toBeDisabled();
  });

  it('writes stdout + stderr + exit line when v5:mb:test_result arrives', () => {
    render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    act(() => {
      socket.fire('v5:mb:test_result', {
        stdout: 'PASSED test_one\n',
        stderr: 'warn: slow test\n',
        exitCode: 0,
        passRate: 1,
        durationMs: 842,
      });
    });
    const allWrites = terminal.writes.join('');
    expect(allWrites).toContain('PASSED test_one');
    expect(allWrites).toContain('warn: slow test');
    expect(allWrites).toContain('exit=0');
    expect(allWrites).toContain('passRate=100%');
    expect(allWrites).toContain('842ms');
    expect(screen.getByTestId('mb-terminal-banner')).toHaveTextContent('exit=0');
    expect(screen.getByTestId('mb-terminal-banner')).toHaveTextContent('pass=100%');
    expect(screen.getByTestId('mb-terminal-run')).not.toBeDisabled();
  });

  it('v5:mb:run_test:error sets error banner and re-enables run', () => {
    render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    act(() => {
      socket.fire('v5:mb:run_test:error', { message: 'sandbox unavailable' });
    });
    expect(screen.getByTestId('mb-terminal-banner')).toHaveTextContent('sandbox unavailable');
    expect(screen.getByTestId('mb-terminal-run')).not.toBeDisabled();
  });

  it('clear button calls terminal.clear and resets the banner', () => {
    render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    act(() => {
      socket.fire('v5:mb:test_result', {
        stdout: 'ok\n',
        stderr: '',
        exitCode: 0,
        passRate: 1,
        durationMs: 100,
      });
    });
    expect(terminal.cleared).toBe(0);
    fireEvent.click(screen.getByTestId('mb-terminal-clear'));
    expect(terminal.cleared).toBe(1);
    expect(screen.getByTestId('mb-terminal-banner')).toHaveTextContent('尚未运行');
  });

  it('disabled prop locks run and clear buttons', () => {
    render(
      <MBTerminalPanel
        sessionId="s1"
        disabled
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    expect(screen.getByTestId('mb-terminal-run')).toBeDisabled();
    expect(screen.getByTestId('mb-terminal-clear')).toBeDisabled();
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('behaviorTracker receives mb_test_run and mb_test_result events', () => {
    const track = vi.fn();
    render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
        behaviorTracker={{ track }}
      />,
    );
    fireEvent.click(screen.getByTestId('mb-terminal-run'));
    act(() => {
      socket.fire('v5:mb:test_result', {
        stdout: '',
        stderr: '',
        exitCode: 1,
        passRate: 0.5,
        durationMs: 500,
      });
    });
    expect(track).toHaveBeenCalledWith('mb_test_run', { sessionId: 's1' });
    expect(track).toHaveBeenCalledWith('mb_test_result', {
      exitCode: 1,
      passRate: 0.5,
      durationMs: 500,
    });
  });

  it('unmounts cleanly disposing the terminal', () => {
    const { unmount } = render(
      <MBTerminalPanel
        sessionId="s1"
        socket={socket as never}
        terminalFactory={factory}
      />,
    );
    expect(terminal.disposed).toBe(false);
    unmount();
    expect(terminal.disposed).toBe(true);
  });
});
