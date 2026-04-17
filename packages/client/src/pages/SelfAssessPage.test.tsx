/**
 * SelfAssessPage tests — covers the Task 9 additions:
 *   - DecisionSummary renders above the reflection textarea and reflects
 *     submissions from session.store (ma / mb / md)
 *   - existing slider + textarea behavior still works (submit gating at 10 chars)
 *   - submit path: setModuleSubmissionLocal('selfAssess', …) + emit
 *     self-assess:submit + advance() on ack=true
 *   - submit gating: stays disabled when reasoning < 10 chars
 *   - ack=false surfaces the error banner without advancing
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { V5MBSubmission, V5ModuleASubmission, V5ModuleDSubmission } from '@codelens-v5/shared';

let mockSocket: {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

vi.mock('../lib/socket.js', () => ({
  getSocket: () => mockSocket,
}));

import { SelfAssessPage } from './SelfAssessPage.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'moduleC'] as const;

const MA_SUB: V5ModuleASubmission = {
  round1: {
    schemeId: 'C',
    reasoning: '令牌桶把串行化从 lock 转到 LPOP 上',
    structuredForm: {
      scenario: 'x',
      tradeoff: 'x',
      decision: 'x',
      verification: 'x',
    },
    challengeResponse: 'x',
  },
  round2: { markedDefects: [] },
  round3: { correctVersionChoice: 'success', diffAnalysis: 'x', diagnosisText: 'x' },
  round4: { response: 'x', submittedAt: Date.now(), timeSpentSec: 1 },
};

const MB_SUB: V5MBSubmission = {
  planning: {
    decomposition: '第一步:拆出 filter_orders\n第二步:写测试',
    dependencies: 'x',
    fallbackStrategy: 'x',
  },
  editorBehavior: {
    aiCompletionEvents: [],
    chatEvents: [],
    diffEvents: [],
    fileNavigationHistory: [],
    editSessions: [],
    testRuns: [],
  },
  finalFiles: [],
  finalTestPassRate: 0.8,
};

const MD_SUB: V5ModuleDSubmission = {
  subModules: [
    { name: 'a', responsibility: 'a' },
    { name: 'b', responsibility: 'b' },
  ],
  interfaceDefinitions: [],
  dataFlowDescription: 'x',
  constraintsSelected: ['性能', '一致性'],
  tradeoffText: 'x',
  aiOrchestrationPrompts: [],
};

function seed() {
  useModuleStore.getState().reset();
  useSessionStore.getState().reset();
  useModuleStore.getState().setSuite('full_stack', [...ORDER]);
  // advance → phase0 → moduleA → mb → moduleD → selfAssess
  for (let i = 0; i < 5; i++) useModuleStore.getState().advance();
}

function newMockSocket() {
  mockSocket = {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  };
}

beforeEach(() => {
  newMockSocket();
  seed();
});

afterEach(() => cleanup());

describe('<SelfAssessPage />', () => {
  it('renders the container + DecisionSummary root', () => {
    render(<SelfAssessPage />);
    expect(screen.getByTestId('selfassess-root')).toBeInTheDocument();
    expect(screen.getByTestId('decision-summary-root')).toBeInTheDocument();
  });

  it('renders prior-module cards only for submitted modules', () => {
    useSessionStore.getState().setModuleSubmissionLocal('moduleA', MA_SUB);
    useSessionStore.getState().setModuleSubmissionLocal('mb', MB_SUB);
    // moduleD intentionally omitted

    render(<SelfAssessPage />);

    expect(screen.getByTestId('decision-summary-ma')).toBeInTheDocument();
    expect(screen.getByTestId('decision-summary-mb')).toBeInTheDocument();
    expect(screen.queryByTestId('decision-summary-md')).not.toBeInTheDocument();

    expect(screen.getByTestId('decision-summary-ma').textContent).toContain('方案');
    expect(screen.getByTestId('decision-summary-ma').textContent).toContain('C');
  });

  it('submit stays disabled until reasoning ≥ 10 chars', () => {
    render(<SelfAssessPage />);
    const submit = screen.getByTestId('selfassess-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('selfassess-reasoning'), {
      target: { value: 'too short' }, // 9 chars
    });
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('selfassess-reasoning'), {
      target: { value: '我觉得 Phase 0 可能选错了' }, // 16 chars
    });
    expect(submit.disabled).toBe(false);
  });

  it('submit writes V5SelfAssessSubmission, emits socket, advances on ack=true', () => {
    render(<SelfAssessPage />);

    fireEvent.change(screen.getByTestId('selfassess-slider'), {
      target: { value: '75' },
    });
    fireEvent.change(screen.getByTestId('selfassess-reasoning'), {
      target: { value: '我觉得 Phase 0 的判断题可能选错了' },
    });
    fireEvent.click(screen.getByTestId('selfassess-submit'));

    // session.store hit with canonical V5SelfAssessSubmission shape.
    const stored = useSessionStore.getState().submissions.selfAssess;
    expect(stored).toEqual({
      confidence: 75,
      reasoning: '我觉得 Phase 0 的判断题可能选错了',
    });

    // Socket emit fired with legacy-prefixed event + V4-compatible payload.
    // Find the self-assess:submit call (behavior:batch may also have fired).
    const selfAssessCall = mockSocket.emit.mock.calls.find(
      ([event]) => event === 'self-assess:submit',
    );
    expect(selfAssessCall).toBeDefined();
    const [, payload, ack] = selfAssessCall!;
    expect(payload).toMatchObject({
      selfConfidence: 75,
      selfIdentifiedRisk: '我觉得 Phase 0 的判断题可能选错了',
    });
    expect(typeof (payload as { responseTimeMs: number }).responseTimeMs).toBe('number');

    // Before ack fires, currentModule is still selfAssess.
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');

    // Simulate server ack=true — wrap in act because the ack fires outside React.
    act(() => (ack as (ok: boolean) => void)(true));
    expect(useModuleStore.getState().currentModule).toBe('moduleC');
  });

  it('submit with ack=false surfaces error and does NOT advance', () => {
    render(<SelfAssessPage />);
    fireEvent.change(screen.getByTestId('selfassess-reasoning'), {
      target: { value: '我觉得我表现还行但 Phase 0 不确定' },
    });
    fireEvent.click(screen.getByTestId('selfassess-submit'));

    const selfAssessCall = mockSocket.emit.mock.calls.find(
      ([event]) => event === 'self-assess:submit',
    );
    const ack = selfAssessCall![2] as (ok: boolean) => void;
    act(() => ack(false));

    expect(screen.getByText(/提交失败/)).toBeInTheDocument();
    expect(useModuleStore.getState().currentModule).toBe('selfAssess');
    // But session.store submission is still set — we only rollback on re-submit.
    expect(useSessionStore.getState().submissions.selfAssess).toBeDefined();
  });

  it('DecisionSummary renders MD summary with submodule + constraint counts', () => {
    useSessionStore.getState().setModuleSubmissionLocal('moduleD', MD_SUB);
    render(<SelfAssessPage />);

    const card = screen.getByTestId('decision-summary-md');
    expect(card.textContent).toContain('2 个模块');
    expect(card.textContent).toContain('2 类关键约束');
  });
});
