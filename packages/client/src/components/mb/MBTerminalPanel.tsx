/**
 * MBTerminalPanel — MB Cursor-mode terminal output surface.
 *
 * Task 7.6 support component per frontend-agent-tasks.md Section 7.6 L770-781
 * (终端面板 · xterm.js 简单集成) + design-reference-full.md Section 15 Stage 2
 * 三流内循环 (Test flow).
 *
 * Responsibilities:
 *   - Render an xterm.js instance in a React-managed container.
 *   - Expose a "运行测试" button that emits `v5:mb:run_test { sessionId }`.
 *   - Subscribe to `v5:mb:test_result` and write stdout + stderr into the
 *     terminal; update a small banner with passRate + duration + exitCode.
 *   - Expose a "清空" button to clear the terminal buffer.
 *   - Surface `v5:mb:run_test:error` frames (safe()-wrapper convention) by
 *     writing a red line to the terminal and dropping the running state.
 *
 * Why headless-wrapper instead of hooks:
 *   xterm.js owns its own DOM subtree and disposes need explicit teardown.
 *   A component gives us a single mount/unmount lifecycle to attach/detach
 *   cleanly without polluting hook-call order in ModuleBPage.
 *
 * Why the banner is separate from the buffer:
 *   xterm's scrollback is a write-once log — we can't update a prior line
 *   without ANSI tricks. A banner outside the terminal region makes
 *   "last run result" glanceable without the candidate hunting the buffer.
 *
 * Deliberately not in scope:
 *   - Interactive PTY / stdin (Cursor mode Stage 2 never gives the candidate
 *     a shell; test execution is one-shot `pytest -v` in the sandbox).
 *   - Streaming test output — server runs pytest to completion then emits
 *     one `v5:mb:test_result`. V5.1 may stream chunks.
 *   - Visibility tracking — Round 2 Part 3 调整 4 only tracks chat / inline
 *     completion visibility, not test-result reading.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { V5MBTestResultPayload } from '@codelens-v5/shared';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getSocket } from '../../lib/socket.js';
import type { UseBehaviorTrackerReturn } from '../../hooks/useBehaviorTracker.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

type RunState = 'idle' | 'running';

export interface MBTerminalPanelProps {
  sessionId: string;
  disabled?: boolean;
  /** Injectable for tests (defaults to `getSocket()`). */
  socket?: ReturnType<typeof getSocket>;
  behaviorTracker?: Pick<UseBehaviorTrackerReturn, 'track'>;
  /** Injectable terminal factory — tests pass a stub that doesn't require canvas. */
  terminalFactory?: () => TerminalLike;
}

/**
 * Minimal structural type the panel uses from xterm. Makes test injection
 * possible without pulling canvas polyfills into jsdom.
 */
export interface TerminalLike {
  open(container: HTMLElement): void;
  write(data: string): void;
  writeln(data: string): void;
  clear(): void;
  dispose(): void;
  loadAddon?(addon: unknown): void;
}

export const MBTerminalPanel: React.FC<MBTerminalPanelProps> = ({
  sessionId,
  disabled = false,
  socket: injectedSocket,
  behaviorTracker,
  terminalFactory,
}) => {
  const [runState, setRunState] = useState<RunState>('idle');
  const [lastResult, setLastResult] = useState<V5MBTestResultPayload | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<TerminalLike | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const socket = useMemo(() => injectedSocket ?? getSocket(), [injectedSocket]);

  useEffect(() => {
    if (!containerRef.current) return;

    let terminal: TerminalLike;
    let fitAddon: FitAddon | null = null;
    if (terminalFactory) {
      terminal = terminalFactory();
    } else {
      const real = new Terminal({
        convertEol: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        theme: {
          background: colors.crust,
          foreground: colors.text,
          cursor: colors.subtext1,
          selectionBackground: colors.surface1,
          red: colors.red,
          green: colors.green,
          yellow: colors.yellow,
          blue: colors.blue,
        },
        scrollback: 2000,
        disableStdin: true,
        cursorStyle: 'bar',
      });
      fitAddon = new FitAddon();
      real.loadAddon(fitAddon);
      terminal = real;
    }

    terminal.open(containerRef.current);
    fitAddon?.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.writeln(ansi('等待 `运行测试` 启动 pytest -v …', colors.overlay2));

    const onResize = () => {
      try {
        fitAddon?.fit();
      } catch {
        /* noop — container detached */
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      try {
        terminal.dispose();
      } catch {
        /* noop */
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalFactory]);

  useEffect(() => {
    const onResult = (data: V5MBTestResultPayload) => {
      setLastResult(data);
      setLastError(null);
      setRunState('idle');

      const term = terminalRef.current;
      if (!term) return;
      term.writeln('');
      term.writeln(ansi('── pytest -v ──────────────────', colors.overlay2));
      if (data.stdout) term.write(data.stdout.endsWith('\n') ? data.stdout : data.stdout + '\n');
      if (data.stderr) term.write(ansiColor(data.stderr, colors.red));
      term.writeln(
        ansi(
          `exit=${data.exitCode}  passRate=${(data.passRate * 100).toFixed(0)}%  ${data.durationMs}ms`,
          data.exitCode === 0 ? colors.green : colors.red,
        ),
      );

      behaviorTracker?.track('mb_test_result', {
        exitCode: data.exitCode,
        passRate: data.passRate,
        durationMs: data.durationMs,
      });
    };

    const onError = (err: { message?: string } | undefined) => {
      const message = err?.message ?? 'run_test failed';
      setLastError(message);
      setRunState('idle');
      const term = terminalRef.current;
      if (term) {
        term.writeln('');
        term.writeln(ansiColor(`✗ ${message}`, colors.red));
      }
      behaviorTracker?.track('mb_test_error', { message });
    };

    socket.on('v5:mb:test_result', onResult);
    // safe()-wrapper error event, not statically typed in ServerToClientEvents.
    (socket as unknown as { on: (e: string, h: (d: unknown) => void) => void }).on(
      'v5:mb:run_test:error',
      onError as (d: unknown) => void,
    );

    return () => {
      socket.off('v5:mb:test_result', onResult);
      (socket as unknown as { off: (e: string, h: (d: unknown) => void) => void }).off(
        'v5:mb:run_test:error',
        onError as (d: unknown) => void,
      );
    };
  }, [socket, behaviorTracker]);

  const handleRun = useCallback(() => {
    if (disabled || runState === 'running') return;
    setRunState('running');
    setLastError(null);
    const term = terminalRef.current;
    if (term) {
      term.writeln('');
      term.writeln(ansi('$ pytest -v …', colors.blue));
    }
    socket.emit('v5:mb:run_test', { sessionId });
    behaviorTracker?.track('mb_test_run', { sessionId });
  }, [disabled, runState, socket, sessionId, behaviorTracker]);

  const handleClear = useCallback(() => {
    terminalRef.current?.clear();
    setLastResult(null);
    setLastError(null);
  }, []);

  const bannerText = useMemo(() => {
    if (lastError) return lastError;
    if (!lastResult) return '尚未运行';
    const pct = (lastResult.passRate * 100).toFixed(0);
    return `exit=${lastResult.exitCode} · pass=${pct}% · ${lastResult.durationMs}ms`;
  }, [lastError, lastResult]);

  const bannerColor = lastError
    ? colors.red
    : !lastResult
      ? colors.overlay1
      : lastResult.exitCode === 0
        ? colors.green
        : colors.peach;

  return (
    <div style={styles.root} data-testid="mb-terminal-root">
      <div style={styles.toolbar}>
        <button
          type="button"
          style={{
            ...styles.btnPrimary,
            ...(disabled || runState === 'running' ? styles.btnDisabled : null),
          }}
          onClick={handleRun}
          disabled={disabled || runState === 'running'}
          data-testid="mb-terminal-run"
        >
          {runState === 'running' ? '运行中…' : '运行测试'}
        </button>
        <button
          type="button"
          style={styles.btnSecondary}
          onClick={handleClear}
          disabled={disabled}
          data-testid="mb-terminal-clear"
        >
          清空
        </button>
        <span
          style={{ ...styles.banner, color: bannerColor }}
          data-testid="mb-terminal-banner"
        >
          {bannerText}
        </span>
      </div>
      <div
        ref={containerRef}
        style={styles.terminalHost}
        data-testid="mb-terminal-host"
      />
    </div>
  );
};

function ansi(text: string, hex: string): string {
  return ansiColor(text, hex) + '\x1b[0m';
}

function ansiColor(text: string, hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    backgroundColor: colors.crust,
    borderTop: `1px solid ${colors.surface0}`,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.mantle,
    borderBottom: `1px solid ${colors.surface0}`,
  },
  btnPrimary: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: colors.blue,
    color: colors.crust,
    border: 'none',
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
  },
  btnDisabled: {
    backgroundColor: colors.surface1,
    color: colors.overlay1,
    cursor: 'not-allowed',
  },
  btnSecondary: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: 'transparent',
    color: colors.subtext0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    cursor: 'pointer',
  },
  banner: {
    marginLeft: 'auto',
    fontSize: fontSizes.xs,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
  terminalHost: {
    flex: 1,
    minHeight: 0,
    padding: spacing.xs,
    overflow: 'hidden',
  },
};
