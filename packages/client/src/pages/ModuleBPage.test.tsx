/**
 * ModuleBPage integration tests — Task 7.6.
 *
 * Covers the orchestrator's contract:
 *   - Stage 1 → 2 → 3 → 4 → complete progression
 *   - 5 socket emits (planning:submit, file_change, standards:submit,
 *     audit:submit, visibility_change)
 *   - test_result listener folds passRate into final submission
 *   - visibility listener only active during Stage 2
 *   - groundTruth-safe violationExamples flow into the audit panel
 *   - bare prop bypasses ModuleShell
 *   - onSubmit + setSubmission + advance flow on completion
 *
 * Heavy children (Monaco, xterm, react-resizable-panels) are stubbed because
 * jsdom doesn't ship the browser primitives they need; their own suites cover
 * the inner behaviors. The seam we test here is the orchestration only.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

// ─────────────────── jsdom-incompatible deps mocked first ───────────────────

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
      data-testid={`monaco-stub-${path}`}
      data-path={path}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
  useMonaco: () => null,
}));

// MBTerminalPanel pulls xterm / matchMedia. Stub to a button that emits
// run_test through the same socket helper the real component uses.
vi.mock('../components/mb/MBTerminalPanel.js', async () => {
  const React = await import('react');
  const socketMod = await import('../lib/socket.js');
  return {
    MBTerminalPanel: ({ sessionId, disabled }: { sessionId: string; disabled?: boolean }) =>
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

// ─────────────────── fake socket installed via getSocket mock ───────────────────

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

vi.mock('../lib/socket.js', () => ({
  getSocket: () => mockSocket,
}));

import { ModuleBPage } from './ModuleBPage.js';
import { useSessionStore } from '../stores/session.store.js';
import { useModuleStore } from '../stores/module.store.js';
import type { MBMockModule } from './moduleB/mock.js';

// Minimal module fixture — small enough to keep tests fast, just enough
// content for the rules parser + audit panel to render 1 example.
const FIXTURE: MBMockModule = {
  featureRequirement: {
    description: 'implement filter_orders(orders, min_amount)',
    acceptanceCriteria: ['preserve order', 'pure function'],
  },
  scaffold: {
    files: [
      { path: 'main.py', content: 'def filter_orders(o, m): pass\n', language: 'python' },
      { path: 'util.py', content: 'def util(): pass\n', language: 'python' },
    ],
    dependencyOrder: ['util.py', 'main.py'],
  },
  violationExamples: [
    { code: 'def f(): return []', aiClaimedReason: 'pure' },
    { code: 'def f(): x.sort()', aiClaimedReason: 'in-place' },
  ],
};

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

beforeEach(() => {
  mockSocket = newMockSocket();
  useSessionStore.setState({ sessionId: 'sess-test' });
  useModuleStore.getState().reset();
  useModuleStore.getState().setSuite('full_stack', [...ORDER]);
  useModuleStore.getState().advance(); // phase0
  useModuleStore.getState().advance(); // moduleA
  useModuleStore.getState().advance(); // mb
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────── Stage 1 — planning ───────────────────

describe('ModuleBPage · Stage 1 (planning)', () => {
  it('starts at the planning stage with the planning panel mounted', () => {
    render(<ModuleBPage module={FIXTURE} />);
    expect(screen.getByTestId('mb-page-root')).toBeInTheDocument();
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('Stage 1');
    expect(screen.getByTestId('mb-planning-root')).toBeInTheDocument();
  });

  it('planning submit emits v5:mb:planning:submit and advances to Stage 2', () => {
    render(<ModuleBPage module={FIXTURE} />);
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: '1. parse\n2. filter' },
    });
    fireEvent.click(screen.getByTestId('mb-planning-submit'));

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:planning:submit',
      expect.objectContaining({
        sessionId: 'sess-test',
        planning: expect.objectContaining({
          decomposition: '1. parse\n2. filter',
          skipped: false,
        }),
      }),
    );
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('Stage 2');
    expect(screen.getByTestId('mb-execution-wrap')).toBeInTheDocument();
  });

  it('skipping planning still advances to Stage 2 with skipped=true', () => {
    render(<ModuleBPage module={FIXTURE} />);
    fireEvent.click(screen.getByTestId('mb-planning-skip'));
    fireEvent.click(screen.getByTestId('mb-planning-skip-confirm'));
    const call = mockSocket.emit.mock.calls.find(
      ([ev]) => ev === 'v5:mb:planning:submit',
    );
    expect(call?.[1].planning.skipped).toBe(true);
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('Stage 2');
  });
});

// ─────────────────── Stage 2 — execution ───────────────────

async function advanceToExecution() {
  fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
    target: { value: 'plan' },
  });
  fireEvent.click(screen.getByTestId('mb-planning-submit'));
}

describe('ModuleBPage · Stage 2 (execution)', () => {
  it('mounts CursorModeLayout with the scaffold files and a finish button', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToExecution();
    expect(screen.getByTestId('mb-cursor-layout')).toBeInTheDocument();
    expect(screen.getByTestId('mb-execution-finish')).toBeInTheDocument();
    // monaco stub renders one textarea per active file (only the active one is shown).
    expect(screen.getByTestId('monaco-stub-main.py')).toBeInTheDocument();
  });

  it('manual edit emits v5:mb:file_change with source=manual_edit', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToExecution();
    mockSocket.emit.mockClear();
    fireEvent.change(screen.getByTestId('monaco-stub-main.py'), {
      target: { value: 'def filter_orders(o, m): return []' },
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:file_change',
      expect.objectContaining({
        sessionId: 'sess-test',
        filePath: 'main.py',
        content: 'def filter_orders(o, m): return []',
        source: 'manual_edit',
      }),
    );
  });

  it('subscribes to v5:mb:test_result and folds passRate into the final submission', async () => {
    const onSubmit = vi.fn();
    render(<ModuleBPage module={FIXTURE} onSubmit={onSubmit} />);
    await advanceToExecution();
    expect(mockSocket.on).toHaveBeenCalledWith('v5:mb:test_result', expect.any(Function));
    act(() => {
      mockSocket.fire('v5:mb:test_result', {
        stdout: '',
        stderr: '',
        exitCode: 0,
        passRate: 0.75,
        durationMs: 100,
      });
    });
    fireEvent.click(screen.getByTestId('mb-execution-finish'));
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- 纯函数' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    // mark all violations compliant so submit is allowed
    const exampleCount = FIXTURE.violationExamples.length;
    for (let i = 0; i < exampleCount; i++) {
      fireEvent.change(screen.getByTestId(`mb-violation-toggle-${i}`), {
        target: { value: 'compliant' },
      });
    }
    fireEvent.click(screen.getByTestId('mb-audit-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].finalTestPassRate).toBe(0.75);
  });

  it('emits v5:mb:visibility_change when document visibility flips during Stage 2', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToExecution();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:visibility_change',
      expect.objectContaining({
        sessionId: 'sess-test',
        hidden: true,
      }),
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    mockSocket.emit.mockClear();
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:visibility_change',
      expect.objectContaining({ hidden: false }),
    );
  });

  it('does NOT emit visibility_change after leaving Stage 2', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToExecution();
    fireEvent.click(screen.getByTestId('mb-execution-finish'));
    mockSocket.emit.mockClear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const visibilityCalls = mockSocket.emit.mock.calls.filter(
      ([ev]) => ev === 'v5:mb:visibility_change',
    );
    expect(visibilityCalls).toHaveLength(0);
  });

  it('finish button advances to Stage 3 (standards)', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToExecution();
    fireEvent.click(screen.getByTestId('mb-execution-finish'));
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('Stage 3');
    expect(screen.getByTestId('mb-standards-root')).toBeInTheDocument();
  });
});

// ─────────────────── Stage 3 — standards ───────────────────

describe('ModuleBPage · Stage 3 (standards)', () => {
  async function advanceToStandards() {
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: 'plan' },
    });
    fireEvent.click(screen.getByTestId('mb-planning-submit'));
    fireEvent.click(screen.getByTestId('mb-execution-finish'));
  }

  it('emits v5:mb:standards:submit and advances to Stage 4', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToStandards();
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- 不准修改入参\n- 列表推导优先' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:standards:submit',
      expect.objectContaining({
        sessionId: 'sess-test',
        rulesContent: '- 不准修改入参\n- 列表推导优先',
      }),
    );
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('Stage 4');
    expect(screen.getByTestId('mb-audit-root')).toBeInTheDocument();
  });

  it('passes the rulesContent down to the audit panel for parsing', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToStandards();
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- rule one\n- rule two\n- rule three' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
    // The rule <select> only renders once a card is marked as violation.
    fireEvent.change(screen.getByTestId('mb-violation-toggle-0'), {
      target: { value: 'violation' },
    });
    const ruleSelect = screen.getByTestId('mb-violation-rule-select-0') as HTMLSelectElement;
    const optionTexts = Array.from(ruleSelect.options).map((o) => o.textContent);
    expect(optionTexts).toEqual(
      expect.arrayContaining(['rule one', 'rule two', 'rule three']),
    );
  });
});

// ─────────────────── Stage 4 — audit + complete ───────────────────

describe('ModuleBPage · Stage 4 (audit) + complete', () => {
  async function advanceToAudit() {
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: 'plan' },
    });
    fireEvent.click(screen.getByTestId('mb-planning-submit'));
    fireEvent.click(screen.getByTestId('mb-execution-finish'));
    fireEvent.change(screen.getByTestId('mb-standards-rules'), {
      target: { value: '- 纯函数\n- 不修改入参' },
    });
    fireEvent.click(screen.getByTestId('mb-standards-submit'));
  }

  it('emits v5:mb:audit:submit and shows the complete card', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToAudit();
    for (let i = 0; i < FIXTURE.violationExamples.length; i++) {
      fireEvent.change(screen.getByTestId(`mb-violation-toggle-${i}`), {
        target: { value: 'compliant' },
      });
    }
    fireEvent.click(screen.getByTestId('mb-audit-submit'));

    expect(mockSocket.emit).toHaveBeenCalledWith(
      'v5:mb:audit:submit',
      expect.objectContaining({
        sessionId: 'sess-test',
        violations: expect.any(Array),
      }),
    );
    expect(screen.getByTestId('mb-complete')).toBeInTheDocument();
    expect(screen.getByTestId('mb-stage-label')).toHaveTextContent('已完成');
  });

  it('composes the final submission with planning, standards, audit, files, and passRate', async () => {
    const onSubmit = vi.fn();
    render(<ModuleBPage module={FIXTURE} onSubmit={onSubmit} />);
    await advanceToAudit();
    for (let i = 0; i < FIXTURE.violationExamples.length; i++) {
      fireEvent.change(screen.getByTestId(`mb-violation-toggle-${i}`), {
        target: { value: 'compliant' },
      });
    }
    fireEvent.click(screen.getByTestId('mb-audit-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submission = onSubmit.mock.calls[0][0];
    expect(submission.planning?.decomposition).toBe('plan');
    expect(submission.standards?.rulesContent).toBe('- 纯函数\n- 不修改入参');
    expect(submission.audit?.violations).toHaveLength(FIXTURE.violationExamples.length);
    expect(submission.finalFiles).toEqual(
      FIXTURE.scaffold.files.map((f) => ({ path: f.path, content: f.content })),
    );
    expect(submission.finalTestPassRate).toBe(0);
    // editorBehavior is empty arrays — server-authoritative.
    expect(submission.editorBehavior.aiCompletionEvents).toEqual([]);
    expect(submission.editorBehavior.testRuns).toEqual([]);
  });

  it('clicking advance on the complete card advances the module store', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToAudit();
    for (let i = 0; i < FIXTURE.violationExamples.length; i++) {
      fireEvent.change(screen.getByTestId(`mb-violation-toggle-${i}`), {
        target: { value: 'compliant' },
      });
    }
    fireEvent.click(screen.getByTestId('mb-audit-submit'));

    expect(useModuleStore.getState().currentModule).toBe('mb');
    fireEvent.click(screen.getByTestId('mb-advance'));
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');
  });

  it('writes the submission into the session store under key "mb"', async () => {
    render(<ModuleBPage module={FIXTURE} />);
    await advanceToAudit();
    for (let i = 0; i < FIXTURE.violationExamples.length; i++) {
      fireEvent.change(screen.getByTestId(`mb-violation-toggle-${i}`), {
        target: { value: 'compliant' },
      });
    }
    fireEvent.click(screen.getByTestId('mb-audit-submit'));
    const stored = useSessionStore.getState().submissions.mb;
    expect(stored).toBeDefined();
    expect(stored?.audit?.violations).toHaveLength(FIXTURE.violationExamples.length);
  });
});

// ─────────────────── prop / shell behavior ───────────────────

describe('ModuleBPage · prop & shell behavior', () => {
  it('falls back to MB_MOCK_FIXTURE when no module prop is provided', () => {
    render(<ModuleBPage />);
    expect(screen.getByTestId('mb-planning-feature-description')).toHaveTextContent(
      'filter_orders',
    );
  });

  it('bare={true} skips ModuleShell wrapping', () => {
    const { container } = render(<ModuleBPage module={FIXTURE} bare />);
    expect(container.querySelector('[data-testid="module-shell"]')).toBeNull();
    expect(screen.getByTestId('mb-page-root')).toBeInTheDocument();
  });

  it('falls back to a placeholder sessionId when session store is empty', () => {
    useSessionStore.setState({ sessionId: null });
    render(<ModuleBPage module={FIXTURE} />);
    fireEvent.change(screen.getByTestId('mb-planning-decomposition'), {
      target: { value: 'plan' },
    });
    fireEvent.click(screen.getByTestId('mb-planning-submit'));
    const planningCall = mockSocket.emit.mock.calls.find(
      ([ev]) => ev === 'v5:mb:planning:submit',
    );
    expect(planningCall?.[1].sessionId).toBe('mb-pending');
  });
});
