import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, within } from '@testing-library/react';
import type { V5ModuleASubmission } from '@codelens-v5/shared';

let mockSocket: {
  emit: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

vi.mock('../lib/socket.js', () => ({
  getSocket: () => mockSocket,
}));

import { ModuleAPage } from './ModuleAPage.js';
import { MA_MOCK_FIXTURE } from './moduleA/mock.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';

const ORDER = ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'] as const;

const R1_REASONING =
  '选 C 方案 — 20k QPS 下锁竞争(A)和 CAS 重试风暴(B)都顶不住,令牌桶把串行化从 lock 转到 LPOP 上,天然扩展。';
const R1_SCENARIO = '秒杀峰值 20k QPS 打同一 SKU,单 Redis 实例,p99 < 300ms。';
const R1_TRADEOFF = '吞吐极限 vs 运维复杂度;LPOP 串行 vs 令牌回收复杂度。';
const R1_DECISION = '选 C;给定 20k QPS + p99 硬指标,A/B 都撑不住。';
const R1_VERIFICATION = '压测 50k QPS 模拟活动峰值,看令牌耗尽边界行为。';
const R1_CHALLENGE_RESPONSE =
  '第一点成立,空跑 LPOP 的成本我承认不低,但用 BRPOP + timeout 0 可以把空跑变阻塞;第二点我打算用 MQ 做异步扣减补偿,失败则 retry + DLQ。';

const R2_COMMENT = 'SET NX 缺 EX 参数,进程崩溃锁永驻,热点 SKU 会卡死整个抢购流量。';
const R2_FIX = '改为 redis.set(lockKey, userId, "NX", "EX", 30) 加 30s TTL。';

const R3_DIFF =
  'success 用 Lua eval 把 check-and-decrement 原子化 + 释放前比对 owner;failed GET 后 DECRBY 分两步,高并发下窗口漏,且 del 无 owner 校验。';
const R3_DIAG =
  'failed 在 10k QPS 压测下出现 0.3% 库存负数,根因是 GET→DECRBY 间窗漏 check-then-act;修复用 Lua 原子或 WATCH/MULTI 事务。';

const R4_RESPONSE =
  '底层原则依然成立 — 都是"高并发下的互斥分配 + 原子扣减"。我 R1 选了 C 令牌桶,这里同样适用;但参数要调整:(1)规模差 25x,需要把令牌池分到 3 个 Redis 分片,LPOP 并行化;(2)延迟预算宽了 6 倍,可以用 BRPOP 阻塞替代空跑;(3)容错宽松,异步扣减失败日志兜底即可,不需要强补偿。';

function seedModuleA() {
  useModuleStore.getState().reset();
  useSessionStore.getState().reset();
  useModuleStore.getState().setSuite('full_stack', [...ORDER]);
  useModuleStore.getState().advance(); // → phase0
  useModuleStore.getState().advance(); // → moduleA
}

function fillR1() {
  fireEvent.click(screen.getByTestId('ma-r1-scheme-c'));
  fireEvent.change(screen.getByTestId('ma-r1-reasoning'), {
    target: { value: R1_REASONING },
  });
  fireEvent.change(screen.getByTestId('ma-r1-structured-scenario'), {
    target: { value: R1_SCENARIO },
  });
  fireEvent.change(screen.getByTestId('ma-r1-structured-tradeoff'), {
    target: { value: R1_TRADEOFF },
  });
  fireEvent.change(screen.getByTestId('ma-r1-structured-decision'), {
    target: { value: R1_DECISION },
  });
  fireEvent.change(screen.getByTestId('ma-r1-structured-verification'), {
    target: { value: R1_VERIFICATION },
  });
  fireEvent.change(screen.getByTestId('ma-r1-challenge-response'), {
    target: { value: R1_CHALLENGE_RESPONSE },
  });
  fireEvent.click(screen.getByTestId('ma-r1-submit'));
}

function fillR2() {
  fireEvent.click(screen.getByTestId('ma-r2-review-line-4'));
  fireEvent.change(screen.getByTestId('ma-r2-review-comment'), {
    target: { value: R2_COMMENT },
  });
  fireEvent.change(screen.getByTestId('ma-r2-review-fix'), {
    target: { value: R2_FIX },
  });
  fireEvent.click(screen.getByText('保存评论'));
  fireEvent.click(screen.getByTestId('ma-r2-submit'));
}

function fillR3(choice: 'success' | 'failed' = 'success') {
  fireEvent.click(screen.getByTestId(`ma-r3-correct-choice-${choice}`));
  fireEvent.change(screen.getByTestId('ma-r3-diff-analysis'), {
    target: { value: R3_DIFF },
  });
  fireEvent.change(screen.getByTestId('ma-r3-diagnosis'), {
    target: { value: R3_DIAG },
  });
  fireEvent.click(screen.getByTestId('ma-r3-submit'));
}

function fillR4() {
  fireEvent.change(screen.getByTestId('ma-r4-response'), {
    target: { value: R4_RESPONSE },
  });
}

describe('<ModuleAPage />', () => {
  beforeEach(() => {
    mockSocket = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    seedModuleA();
  });

  describe('canonical data-testids', () => {
    it('renders R1 testids on initial mount', () => {
      render(<ModuleAPage />);
      expect(screen.getByTestId('moduleA-container')).toBeInTheDocument();
      expect(screen.getByTestId('moduleA-round-header')).toBeInTheDocument();
      expect(screen.getByTestId('moduleA-r1')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-scheme-a')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-scheme-b')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-scheme-c')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-submit')).toBeInTheDocument();
    });

    it('reveals structured form after scheme + reasoning, then challenge', () => {
      render(<ModuleAPage />);
      expect(screen.queryByTestId('ma-r1-reasoning')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('ma-r1-scheme-c'));
      expect(screen.getByTestId('ma-r1-reasoning')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-structured-scenario')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-structured-tradeoff')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-structured-decision')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-structured-verification')).toBeInTheDocument();
      expect(screen.queryByTestId('ma-r1-challenge-text')).not.toBeInTheDocument();

      fireEvent.change(screen.getByTestId('ma-r1-reasoning'), {
        target: { value: R1_REASONING },
      });
      expect(screen.getByTestId('ma-r1-challenge-text')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r1-challenge-response')).toBeInTheDocument();
    });
  });

  describe('round progression', () => {
    it('hides R2/R3/R4 until R1 is submitted', () => {
      render(<ModuleAPage />);
      expect(screen.queryByTestId('moduleA-r2')).not.toBeInTheDocument();
      expect(screen.queryByTestId('moduleA-r3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('moduleA-r4')).not.toBeInTheDocument();
    });

    it('reveals R2 after R1 submit, R3 after R2, R4 after R3', () => {
      render(<ModuleAPage />);

      fillR1();
      expect(screen.getByTestId('moduleA-r2')).toBeInTheDocument();
      expect(screen.queryByTestId('moduleA-r3')).not.toBeInTheDocument();

      fillR2();
      expect(screen.getByTestId('moduleA-r3')).toBeInTheDocument();
      expect(screen.queryByTestId('moduleA-r4')).not.toBeInTheDocument();

      fillR3();
      expect(screen.getByTestId('moduleA-r4')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r4-scenario-display')).toBeInTheDocument();
      expect(screen.getByTestId('ma-r4-reference-r1')).toBeInTheDocument();
    });
  });

  describe('R1 submit guarding', () => {
    it('leaves ma-r1-submit disabled until every R1 substep is met', () => {
      render(<ModuleAPage />);
      fireEvent.click(screen.getByTestId('ma-r1-scheme-c'));
      const submit = screen.getByTestId('ma-r1-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.change(screen.getByTestId('ma-r1-reasoning'), {
        target: { value: R1_REASONING },
      });
      expect(submit.disabled).toBe(true); // structured + challenge still missing

      fireEvent.change(screen.getByTestId('ma-r1-structured-scenario'), {
        target: { value: R1_SCENARIO },
      });
      fireEvent.change(screen.getByTestId('ma-r1-structured-tradeoff'), {
        target: { value: R1_TRADEOFF },
      });
      fireEvent.change(screen.getByTestId('ma-r1-structured-decision'), {
        target: { value: R1_DECISION },
      });
      fireEvent.change(screen.getByTestId('ma-r1-structured-verification'), {
        target: { value: R1_VERIFICATION },
      });
      expect(submit.disabled).toBe(true); // challenge still missing

      fireEvent.change(screen.getByTestId('ma-r1-challenge-response'), {
        target: { value: R1_CHALLENGE_RESPONSE },
      });
      expect(submit.disabled).toBe(false);
    });

    it('renders counter-arguments in ma-r1-challenge-text based on chosen scheme', () => {
      render(<ModuleAPage />);
      fireEvent.click(screen.getByTestId('ma-r1-scheme-c'));
      fireEvent.change(screen.getByTestId('ma-r1-reasoning'), {
        target: { value: R1_REASONING },
      });
      const challenge = screen.getByTestId('ma-r1-challenge-text');
      // Scheme C counter-arguments are in the fixture.
      expect(challenge.textContent).toContain('LPOP');
    });
  });

  describe('R2 code review', () => {
    it('requires at least one marked review before ma-r2-submit enables', () => {
      render(<ModuleAPage />);
      fillR1();
      const submit = screen.getByTestId('ma-r2-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.click(screen.getByTestId('ma-r2-review-line-4'));
      fireEvent.change(screen.getByTestId('ma-r2-review-comment'), {
        target: { value: R2_COMMENT },
      });
      fireEvent.click(screen.getByText('保存评论'));
      expect(submit.disabled).toBe(false);
    });

    it('renders the code with line numbers in ma-r2-code-display', () => {
      render(<ModuleAPage />);
      fillR1();
      const code = screen.getByTestId('ma-r2-code-display');
      expect(code.textContent).toContain('reserveInventory');
      expect(code.textContent).toContain('NX');
    });
  });

  describe('R3 version compare', () => {
    it('renders both code versions and requires correct-choice + 40-char diff + 40-char diagnosis', () => {
      render(<ModuleAPage />);
      fillR1();
      fillR2();

      expect(screen.getByTestId('ma-r3-code-success').textContent).toContain('Lua');
      expect(screen.getByTestId('ma-r3-code-failed').textContent).toContain('GET');

      const submit = screen.getByTestId('ma-r3-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.click(screen.getByTestId('ma-r3-correct-choice-success'));
      fireEvent.change(screen.getByTestId('ma-r3-diff-analysis'), {
        target: { value: R3_DIFF },
      });
      fireEvent.change(screen.getByTestId('ma-r3-diagnosis'), {
        target: { value: R3_DIAG },
      });
      expect(submit.disabled).toBe(false);
    });
  });

  describe('R4 migration validation', () => {
    it('shows the new scenario + R1 reference + prompt, gates submit on 80 chars', () => {
      render(<ModuleAPage />);
      fillR1();
      fillR2();
      fillR3();

      const scenario = screen.getByTestId('ma-r4-scenario-display');
      expect(scenario.textContent).toContain('抢红包');
      expect(within(scenario).getByText('共享维度:')).toBeInTheDocument();
      expect(within(scenario).getByText('差异维度:')).toBeInTheDocument();

      const ref = screen.getByTestId('ma-r4-reference-r1');
      expect(ref.textContent).toContain('方案');
      // R1 snippet should include the scheme id and some of the reasoning.
      expect(ref.textContent).toContain('C');

      const submit = screen.getByTestId('ma-r4-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);

      fireEvent.change(screen.getByTestId('ma-r4-response'), {
        target: { value: 'too short' },
      });
      expect(submit.disabled).toBe(true);

      fireEvent.change(screen.getByTestId('ma-r4-response'), {
        target: { value: R4_RESPONSE },
      });
      expect(submit.disabled).toBe(false);
    });
  });

  describe('submit payload shape', () => {
    it('constructs a V5ModuleASubmission with canonical round4', () => {
      const captured: { s: V5ModuleASubmission | null } = { s: null };
      render(<ModuleAPage onSubmit={(s) => (captured.s = s)} />);

      fillR1();
      fillR2();
      fillR3('success');
      fillR4();
      fireEvent.click(screen.getByTestId('ma-r4-submit'));

      const s = captured.s;
      expect(s).not.toBeNull();

      expect(s?.round1.schemeId).toBe('C');
      expect(s?.round1.reasoning).toBe(R1_REASONING);
      expect(s?.round1.structuredForm).toEqual({
        scenario: R1_SCENARIO,
        tradeoff: R1_TRADEOFF,
        decision: R1_DECISION,
        verification: R1_VERIFICATION,
      });
      expect(s?.round1.challengeResponse).toBe(R1_CHALLENGE_RESPONSE);

      expect(s?.round2.markedDefects).toHaveLength(1);
      // Candidate-safe MA content never exposes the canonical defect answer
      // key. The page submits the reviewed line; server persistence normalizes
      // line 4 to canonical d1 from DB examData.
      expect(s?.round2.markedDefects[0]).toEqual({
        defectId: 'line-4',
        line: 4,
        commentType: 'bug',
        comment: R2_COMMENT,
        fixSuggestion: R2_FIX,
      });

      expect(s?.round3).toEqual({
        correctVersionChoice: 'success',
        diffAnalysis: R3_DIFF,
        diagnosisText: R3_DIAG,
      });

      // R4 canonical per Round 3 Part 3 调整 2 L358-372 — lives at top-level
      // round4, NOT inputBehavior.
      expect(s?.round4.response).toBe(R4_RESPONSE);
      expect(typeof s?.round4.submittedAt).toBe('number');
      expect(typeof s?.round4.timeSpentSec).toBe('number');
    });

    it('writes the submission into session.store and advances to mb', () => {
      render(<ModuleAPage />);
      fillR1();
      fillR2();
      fillR3('success');
      fillR4();
      fireEvent.click(screen.getByTestId('ma-r4-submit'));

      const stored = useSessionStore.getState().submissions.moduleA;
      expect(stored).toBeDefined();
      expect(stored?.round1.schemeId).toBe('C');
      expect(stored?.round4.response).toBe(R4_RESPONSE);
      expect(useModuleStore.getState().currentModule).toBe('mb');
    });
  });

  describe('socket emit (Task 26)', () => {
    function fillAll() {
      fillR1();
      fillR2();
      fillR3('success');
      fillR4();
    }

    it('emits moduleA:submit with sessionId + V5ModuleASubmission on R4 submit', () => {
      useSessionStore.setState({ sessionId: 'sess-task26-test' });
      render(<ModuleAPage />);
      fillAll();

      fireEvent.click(screen.getByTestId('ma-r4-submit'));

      const call = mockSocket.emit.mock.calls.find(([event]) => event === 'moduleA:submit');
      expect(call).toBeDefined();
      const [, payload, ack] = call!;
      expect(payload).toMatchObject({
        sessionId: 'sess-task26-test',
        submission: {
          round1: {
            schemeId: 'C',
            reasoning: R1_REASONING,
            structuredForm: {
              scenario: R1_SCENARIO,
              tradeoff: R1_TRADEOFF,
              decision: R1_DECISION,
              verification: R1_VERIFICATION,
            },
            challengeResponse: R1_CHALLENGE_RESPONSE,
          },
          round2: {
            markedDefects: [
              expect.objectContaining({
                commentType: 'bug',
                comment: R2_COMMENT,
                fixSuggestion: R2_FIX,
              }),
            ],
          },
          round3: {
            correctVersionChoice: 'success',
            diffAnalysis: R3_DIFF,
            diagnosisText: R3_DIAG,
          },
          round4: {
            response: R4_RESPONSE,
            submittedAt: expect.any(Number),
            timeSpentSec: expect.any(Number),
          },
        },
      });
      expect(typeof ack).toBe('function');
    });

    it('falls back to moduleA-pending sessionId when store has none, and ack=false does not undo advance/local persist', () => {
      render(<ModuleAPage />);
      fillAll();
      fireEvent.click(screen.getByTestId('ma-r4-submit'));

      const call = mockSocket.emit.mock.calls.find(([event]) => event === 'moduleA:submit');
      const [, payload, ack] = call!;
      expect((payload as { sessionId: string }).sessionId).toBe('moduleA-pending');

      // Local persist + advance happen synchronously (fire-and-forget emit).
      expect(useSessionStore.getState().submissions.moduleA).toBeDefined();
      expect(useModuleStore.getState().currentModule).toBe('mb');

      // Server-rejected ack must not crash the no-op callback nor revert state.
      expect(() => act(() => (ack as (ok: boolean) => void)(false))).not.toThrow();
      expect(useSessionStore.getState().submissions.moduleA).toBeDefined();
      expect(useModuleStore.getState().currentModule).toBe('mb');
    });
  });

  describe('mock fixture integrity', () => {
    it('provides 3 schemes, 3 defects, 2 decoys, and a migrationScenario', () => {
      expect(MA_MOCK_FIXTURE.schemes).toHaveLength(3);
      expect(MA_MOCK_FIXTURE.defects).toHaveLength(3);
      expect(MA_MOCK_FIXTURE.decoys).toHaveLength(2);
      expect(MA_MOCK_FIXTURE.migrationScenario.newBusinessContext.length).toBeGreaterThan(100);
      // Prompt text references the R1 choice template.
      expect(MA_MOCK_FIXTURE.migrationScenario.promptText.length).toBeGreaterThan(80);
    });
  });
});
