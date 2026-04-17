import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { V5Phase0Submission } from '@codelens-v5/shared';
import { Phase0Page } from './Phase0Page.js';
import { P0_MOCK_FIXTURE } from './phase0/mock.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

/**
 * Monaco is too heavy for jsdom (web workers + dynamic imports). Replace
 * it with a textarea-equivalent that preserves the value prop so the
 * `phase0-code-display` wrapper still holds the expected content.
 */
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => (
    <pre data-testid="monaco-stub">{value}</pre>
  ),
}));

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

function seedPhase0() {
  useModuleStore.getState().reset();
  useSessionStore.getState().reset();
  useModuleStore.getState().setSuite('full_stack', [...ORDER]);
  useModuleStore.getState().advance(); // → phase0
}

const L2_TEXT =
  '关键决策是用 Redis SET NX 作为互斥锁来避免同一用户对同一 SKU 并发下单,代价是锁住的 SKU 在其他流程看不到。';

const L3_TEXT =
  '两个地方:第一,cryptoRandom 在分布式下不够安全,应改用真正的 UUID;第二,finally 里的 GET + DEL 不是原子的,多实例下存在误删别人锁的风险,应换成 Lua 脚本比较并删。';

const REASON_TEXT = '相同的功能但 A 版显式做了事务和去重记录,B 版只靠缓存命中。';
const DECISION_REASON =
  '我会先 rollback 到昨天,先止血再排查,避免继续累积失败订单。';
const AI_CLAIM_RESPONSE =
  'AI 说用了 WATCH/MULTI,但代码里我没看到 MULTI 和 EXEC,只有一个 SET NX 互斥锁。';

function fillL1() {
  fireEvent.click(screen.getByTestId('phase0-l1-option-0'));
}

function fillL2(text = L2_TEXT) {
  fireEvent.change(screen.getByTestId('phase0-l2-answer'), {
    target: { value: text },
  });
}

function fillL3(text = L3_TEXT) {
  fireEvent.change(screen.getByTestId('phase0-l3-answer'), {
    target: { value: text },
  });
}

function fillJudgment(idx: 1 | 2, choice: 'A' | 'B' | 'both_good' | 'both_bad' = 'A') {
  fireEvent.click(screen.getByTestId(`phase0-ai-judgment-${idx}-choice-${choice}`));
  fireEvent.change(screen.getByTestId(`phase0-ai-judgment-${idx}-reason`), {
    target: { value: REASON_TEXT },
  });
}

function fillDecision(id: string = 'C') {
  fireEvent.click(screen.getByTestId(`phase0-decision-choice-${id}`));
  fireEvent.change(screen.getByTestId('phase0-decision-reason'), {
    target: { value: DECISION_REASON },
  });
}

function fillAiClaim(text = AI_CLAIM_RESPONSE) {
  fireEvent.change(screen.getByTestId('phase0-ai-claim-response'), {
    target: { value: text },
  });
}

describe('<Phase0Page />', () => {
  beforeEach(() => {
    seedPhase0();
  });

  describe('canonical data-testids', () => {
    it('renders every testid listed in frontend-agent-tasks.md L377-386', () => {
      render(<Phase0Page />);
      // Initial section (always visible): code display + L1
      expect(screen.getByTestId('phase0-code-display')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-l1-question')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-l1-answer')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-submit')).toBeInTheDocument();
    });
  });

  describe('progressive reveal', () => {
    it('hides L2/L3/judgments/decision/aiclaim until L1 is answered', () => {
      render(<Phase0Page />);
      expect(screen.queryByTestId('phase0-l2-answer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('phase0-l3-answer')).not.toBeInTheDocument();
      expect(screen.queryByTestId('phase0-ai-judgment-1-choice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('phase0-decision-choice')).not.toBeInTheDocument();
      expect(screen.queryByTestId('phase0-ai-claim-response')).not.toBeInTheDocument();
    });

    it('reveals L2 after L1, then L3 after L2, then the rest after L3', () => {
      render(<Phase0Page />);

      fillL1();
      expect(screen.getByTestId('phase0-l2-answer')).toBeInTheDocument();
      expect(screen.queryByTestId('phase0-l3-answer')).not.toBeInTheDocument();

      fillL2();
      expect(screen.getByTestId('phase0-l3-answer')).toBeInTheDocument();
      expect(
        screen.queryByTestId('phase0-ai-judgment-1-choice'),
      ).not.toBeInTheDocument();

      fillL3();
      expect(screen.getByTestId('phase0-ai-judgment-1-choice')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-ai-judgment-2-choice')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-decision-choice')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-ai-claim-response')).toBeInTheDocument();
    });
  });

  describe('submit guarding', () => {
    it('leaves submit disabled until every field is filled', () => {
      render(<Phase0Page />);
      const submit = screen.getByTestId('phase0-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fillL1();
      fillL2();
      fillL3();
      expect(submit.disabled).toBe(true);

      fillJudgment(1);
      fillJudgment(2);
      expect(submit.disabled).toBe(true);

      fillDecision();
      expect(submit.disabled).toBe(true);

      fillAiClaim();
      expect(submit.disabled).toBe(false);
    });

    it('does not advance when submit is disabled and clicked', () => {
      render(<Phase0Page />);
      // currentModule starts at phase0
      expect(useModuleStore.getState().currentModule).toBe('phase0');
      fireEvent.click(screen.getByTestId('phase0-submit'));
      expect(useModuleStore.getState().currentModule).toBe('phase0');
    });
  });

  describe('AI output judgment', () => {
    it('renders both code blocks and keeps choice + reason in sync', () => {
      render(<Phase0Page />);
      fillL1();
      fillL2();
      fillL3();

      expect(screen.getByTestId('phase0-ai-judgment-1-code-a')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-ai-judgment-1-code-b')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-ai-judgment-2-code-a')).toBeInTheDocument();
      expect(screen.getByTestId('phase0-ai-judgment-2-code-b')).toBeInTheDocument();

      const choice1 = screen.getByTestId('phase0-ai-judgment-1-choice-both_bad');
      fireEvent.click(choice1);
      expect(choice1).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('submit payload shape', () => {
    it('constructs V5Phase0Submission + bridges AI claim via inputBehavior', () => {
      const captured: { s: V5Phase0Submission | null } = { s: null };
      render(<Phase0Page onSubmit={(s) => (captured.s = s)} />);

      fillL1();
      fillL2();
      fillL3();
      fillJudgment(1, 'A');
      fillJudgment(2, 'A');
      fillDecision('C');
      fillAiClaim();

      fireEvent.click(screen.getByTestId('phase0-submit'));

      const s = captured.s;
      expect(s).not.toBeNull();
      expect(s?.codeReading.l1Answer).toBe(
        P0_MOCK_FIXTURE.codeReadingQuestions.l1.options[0],
      );
      expect(s?.codeReading.l2Answer).toBe(L2_TEXT);
      expect(s?.codeReading.l3Answer).toBe(L3_TEXT);
      expect(typeof s?.codeReading.confidence).toBe('number');

      expect(s?.aiOutputJudgment).toHaveLength(2);
      expect(s?.aiOutputJudgment[0]).toEqual({ choice: 'A', reasoning: REASON_TEXT });
      expect(s?.aiOutputJudgment[1]).toEqual({ choice: 'A', reasoning: REASON_TEXT });

      expect(s?.decision).toEqual({ choice: 'C', reasoning: DECISION_REASON });

      // Round 3 Part 3 adjustment 1 bridge — the AI claim response is
      // stored under inputBehavior.aiClaimVerification until Task 11 promotes
      // it to a top-level field in V5Phase0Submission.
      const bridge = (s?.inputBehavior?.aiClaimVerification as {
        response: string;
        submittedAt: number;
      });
      expect(bridge.response).toBe(AI_CLAIM_RESPONSE);
      expect(typeof bridge.submittedAt).toBe('number');
    });

    it('writes the submission into session.store and advances to moduleA', () => {
      render(<Phase0Page />);
      fillL1();
      fillL2();
      fillL3();
      fillJudgment(1);
      fillJudgment(2);
      fillDecision();
      fillAiClaim();

      fireEvent.click(screen.getByTestId('phase0-submit'));

      const stored = useSessionStore.getState().submissions.phase0;
      expect(stored).toBeDefined();
      expect(stored?.aiOutputJudgment).toHaveLength(2);

      expect(useModuleStore.getState().currentModule).toBe('moduleA');
    });
  });

  describe('AI claim verification section', () => {
    it('shows the AI explanation card with an AI badge', () => {
      render(<Phase0Page />);
      fillL1();
      fillL2();
      fillL3();

      const explanation = screen.getByTestId('phase0-ai-claim-explanation');
      expect(explanation).toBeInTheDocument();
      expect(within(explanation).getByText('AI')).toBeInTheDocument();
    });

    it('shows the deceptivePoint code block for the candidate to audit', () => {
      render(<Phase0Page />);
      fillL1();
      fillL2();
      fillL3();

      const codeBlock = screen.getByTestId('phase0-ai-claim-code');
      // Mock fixture uses `redis.set(..., 'NX')` but no MULTI/EXEC — this is the deception.
      expect(codeBlock.textContent).toContain("'NX'");
      expect(codeBlock.textContent).not.toContain('MULTI');
    });
  });
});
