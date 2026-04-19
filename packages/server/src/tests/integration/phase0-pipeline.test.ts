/**
 * Task 25 / Pattern H v2.2 4th gate — Cluster C-P0 end-to-end:
 *   (i)  phase0:submit (V5-native envelope) → handler → persist → all 5 P0
 *        signals (sBaselineReading, sTechProfile, sDecisionStyle,
 *        sAiClaimDetection, sAiCalibration) compute non-null with monotone
 *        Liam-archetype scores.
 *   (ii) cross-Task regression defense — seed Task 22 aiCompletionEvents +
 *        Task 23 finalTestPassRate / finalFiles + Task 24 selfAssess into
 *        metadata, fire phase0:submit, assert ALL sibling state intact.
 *        This is the 4th Pattern H gate after Cluster A ingest, Cluster B
 *        persistToMetadata, and Cluster D self-assess; first to prove a P0
 *        writer respects MB + SE namespaces simultaneously.
 *
 * Why integration: 5 distinct P0 signals each read different submission
 * sub-paths (codeReading.l1Answer, aiOutputJudgment[i].choice,
 * aiClaimVerification.response, decision.choice/reasoning). Unit tests for
 * the persist layer and per-signal layers are isolated; only this test
 * proves the full ws → persist → 5-signal pipeline keeps field names
 * aligned. A future drift in the persist's strict field-pick would surface
 * as some-but-not-all signals returning null here, not in production
 * silence.
 *
 * Mock surface: prisma (in-memory metadata) + event-bus only. Real code
 * under test: registerPhase0Handlers + persistPhase0Submission + 5 P0
 * signals.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  P0ModuleSpecific,
  SignalInput,
  V5Phase0Submission,
  V5Submissions,
} from '@codelens-v5/shared';

const store = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
}));

vi.mock('../../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => ({ metadata: store.metadata })),
      update: vi.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
        store.metadata = data.metadata;
        return { metadata: store.metadata };
      }),
    },
  },
}));

vi.mock('../../services/event-bus.service.js', () => ({
  eventBus: { emit: vi.fn() },
}));

import { registerPhase0Handlers } from '../../socket/phase0-handlers.js';
import { sBaselineReading } from '../../signals/p0/s-baseline-reading.js';
import { sTechProfile } from '../../signals/p0/s-tech-profile.js';
import { sDecisionStyle } from '../../signals/p0/s-decision-style.js';
import { sAiClaimDetection } from '../../signals/p0/s-ai-claim-detection.js';
import { sAiCalibration } from '../../signals/p0/s-ai-calibration.js';

// ─── Liam fixture (mirrors p0-signals.test.ts so the calibration band carries over) ───

const P0_EXAM: P0ModuleSpecific = {
  systemCode: 'const lockKey = `sku:${skuId}`;\nredis.set(lockKey, uuid, "NX", "EX", 30);\n/* ... */\n',
  codeReadingQuestions: {
    l1: {
      question: '这段代码的核心职责是什么?',
      options: ['Redis 互斥锁防止同 SKU 并发下单', '记录日志', '发送邮件', '计算价格'],
      correctIndex: 0,
    },
    l2: { question: '关键设计决策是什么?' },
    l3: { question: 'QPS 涨到 10k 时哪里先成为瓶颈?' },
  },
  aiOutputJudgment: [
    {
      codeA: 'async function pay(order) { await redis.set(...); /* tx */ }',
      codeB: 'async function pay(order) { /* no lock */ await db.insert(...); }',
      context: '两版支付代码哪个更稳',
      groundTruth: 'A',
    },
    {
      codeA: 'function x() { return cache.get(k); }',
      codeB: 'function x() { const v = await cache.get(k); if (!v) v = await db.query(); return v; }',
      context: '读缓存的两种写法',
      groundTruth: 'B',
    },
  ],
  decision: {
    scenario: '线上订单支付失败率从 1% 涨到 30%,你先做什么?',
    options: [
      { id: 'A', label: '全量回滚', description: '回滚到昨天版本' },
      { id: 'B', label: '查日志', description: '先查错误日志' },
      { id: 'C', label: '止血 + 排查', description: '先限流保住核心,再排查' },
    ],
  },
  aiClaimDetection: {
    code: 'redis.set(lockKey, uuid, "NX", "EX", 30)\n/* no MULTI, no WATCH */',
    aiExplanation: '这段代码使用了 Redis WATCH/MULTI 实现乐观锁,SET 设置 TTL 为 30s',
    claimedFeatures: ['WATCH', 'MULTI', 'SET NX', 'TTL'],
    actualFeatures: ['SET', 'NX', 'TTL', 'EX'],
    deceptivePoint: {
      claimedFeature: 'MULTI',
      realityGap: '代码里只有 SET NX,没有 MULTI/EXEC',
    },
  },
};

const LIAM_SUBMISSION: V5Phase0Submission = {
  codeReading: {
    l1Answer: P0_EXAM.codeReadingQuestions.l1.options[0],
    l2Answer:
      '关键决策是用 Redis SET NX 作为互斥锁,避免同一用户对同一 SKU 的并发下单。锁的 TTL 30s 既足够完成事务又能在崩溃时自动释放,cost 是锁住的 SKU 在其他流程看不到。',
    l3Answer:
      'QPS 涨到 10k 时,首要瓶颈是 Redis 单机 set/del 的 P99 延迟——现在 function 里每单至少 2 次 round-trip。其次,finally 里的 GET + DEL 不是原子的,多实例下存在误删别人锁的风险,应换成 Lua 脚本比较并删;第三,cryptoRandom 在分布式下熵不够,应改用 UUID。',
    confidence: 0.8,
  },
  aiOutputJudgment: [
    { choice: 'A', reasoning: 'A 版显式做了 Redis 互斥锁 + 事务提交,B 版裸写数据库不保证幂等,并发下订单会重复。' },
    { choice: 'B', reasoning: 'B 版用 cache-aside 模式,缓存不命中回源数据库,A 版直接拿 cache 会返回 null。' },
  ],
  aiClaimVerification: {
    response:
      'AI 说用了 WATCH/MULTI 实现乐观锁,但代码里我没看到 MULTI 和 EXEC,只有一个 SET NX 互斥锁(line 2)。actualFeatures 里的 NX+TTL 是悲观锁写法,不是乐观锁。',
    submittedAt: 1700000000000,
  },
  decision: {
    choice: 'C',
    reasoning: '我会先启动限流止血,30 秒内把失败订单率压回 5% 以下,然后基于日志排查 root cause,因为 rollback 会丢掉已经成功的 70% 订单。',
  },
};

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-cluster-c-p0', emit }) as unknown as Parameters<
    typeof registerPhase0Handlers
  >[1];
  return { socket, emit, ee };
}

function dispatchWithAck(
  ee: EventEmitter,
  event: string,
  payload: unknown,
  ack: (ok: boolean) => void,
): Promise<void> {
  const last = ee.listeners(event).at(-1) as (
    p: unknown,
    a: (ok: boolean) => void,
  ) => Promise<void> | void;
  return Promise.resolve(last(payload, ack));
}

beforeEach(() => {
  store.metadata = {};
});

describe('Pattern H v2.2 — Cluster C-P0 pipeline (Task 25)', () => {
  it('(i) V5 envelope → handler → persist → all 5 P0 signals compute non-null', async () => {
    const { socket, ee } = makeSocket();
    registerPhase0Handlers({} as never, socket);

    const sessionId = 'sess-cluster-c-p0-i';
    const ack = vi.fn();

    await dispatchWithAck(
      ee,
      'phase0:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(true);

    // Persisted V5 shape under metadata.phase0.* (top-level, not metadata.submissions.*).
    const persisted = store.metadata as { phase0?: V5Phase0Submission };
    expect(persisted.phase0).toBeDefined();
    expect(persisted.phase0?.codeReading).toEqual(LIAM_SUBMISSION.codeReading);
    expect(persisted.phase0?.aiOutputJudgment).toEqual(LIAM_SUBMISSION.aiOutputJudgment);
    expect(persisted.phase0?.aiClaimVerification).toEqual(LIAM_SUBMISSION.aiClaimVerification);
    expect(persisted.phase0?.decision).toEqual(LIAM_SUBMISSION.decision);

    // All 5 P0 signals compute against the persisted snapshot.
    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: { P0: P0_EXAM as unknown as Record<string, unknown> },
      participatingModules: ['phase0'],
    };

    const [baseline, tech, decision, claim, calib] = await Promise.all([
      sBaselineReading.compute(input),
      sTechProfile.compute(input),
      sDecisionStyle.compute(input),
      sAiClaimDetection.compute(input),
      sAiCalibration.compute(input),
    ]);

    // Non-null for all 5 — proves the persist layer's field names line up
    // with each signal's read paths. A drift in any field → null here.
    expect(baseline.value, 'sBaselineReading').not.toBeNull();
    expect(tech.value, 'sTechProfile').not.toBeNull();
    expect(decision.value, 'sDecisionStyle').not.toBeNull();
    expect(claim.value, 'sAiClaimDetection').not.toBeNull();
    expect(calib.value, 'sAiCalibration').not.toBeNull();

    // Liam should land in the upper band — sanity check that signal reads see
    // substantive answers, not field-mismatched zeros. Loose bounds because
    // exact thresholds are owned by p0-signals.test.ts; we only care that the
    // pipeline doesn't silently flatten Liam to Max-tier.
    expect(baseline.value as number).toBeGreaterThanOrEqual(0.5);
    expect(claim.value as number).toBeGreaterThanOrEqual(0.8);
    expect(calib.value as number).toBeGreaterThanOrEqual(0.5);
  });

  it('(ii) cross-Task regression defense — Task 22/23 mb.* + Task 24 selfAssess survive a P0 write', async () => {
    // Seed Task 22 + Task 23 + Task 24 state (those pipelines have their own
    // gates; here we only assert the P0 writer respects existing siblings).
    store.metadata = {
      mb: {
        editorBehavior: {
          aiCompletionEvents: [
            { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12, shown: true, shownAt: 100, respondedAt: 800, documentVisibleMs: 700 },
            { timestamp: 2, accepted: false, lineNumber: 6, completionLength: 8, shown: true, shownAt: 200, respondedAt: 1400, documentVisibleMs: 1200 },
          ],
          documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
          testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
        },
        finalTestPassRate: 0.8,
        finalFiles: [{ path: 'src/main.py', content: 'print("hello")' }],
        planning: { decomposition: 'a', dependencies: 'b', fallbackStrategy: 'c' },
        standards: { rulesContent: 'rule x' },
      },
      selfAssess: { confidence: 0.7, reasoning: '反思' },
      moduleC: [{ round: 1 }],
    };

    const { socket, ee } = makeSocket();
    registerPhase0Handlers({} as never, socket);

    const sessionId = 'sess-cluster-c-p0-ii';
    const ack = vi.fn();
    await dispatchWithAck(
      ee,
      'phase0:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    // Task 22 / 23 / 24 state intact post-P0 write.
    const persisted = store.metadata as {
      mb?: {
        editorBehavior?: {
          aiCompletionEvents?: unknown[];
          documentVisibilityEvents?: unknown[];
          testRuns?: unknown[];
        };
        finalTestPassRate?: number;
        finalFiles?: unknown[];
        planning?: unknown;
        standards?: unknown;
      };
      selfAssess?: { confidence?: number; reasoning?: string };
      moduleC?: unknown;
      phase0?: V5Phase0Submission;
    };
    expect(persisted.mb?.editorBehavior?.aiCompletionEvents).toHaveLength(2);
    expect(persisted.mb?.editorBehavior?.documentVisibilityEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.testRuns).toHaveLength(1);
    expect(persisted.mb?.finalTestPassRate).toBe(0.8);
    expect(persisted.mb?.finalFiles).toEqual([{ path: 'src/main.py', content: 'print("hello")' }]);
    expect(persisted.mb?.planning).toEqual({
      decomposition: 'a',
      dependencies: 'b',
      fallbackStrategy: 'c',
    });
    expect(persisted.mb?.standards).toEqual({ rulesContent: 'rule x' });
    expect(persisted.selfAssess).toEqual({ confidence: 0.7, reasoning: '反思' });
    expect(persisted.moduleC).toEqual([{ round: 1 }]);

    // P0 state landed at the right namespace (top-level, not nested).
    expect(persisted.phase0?.decision).toEqual(LIAM_SUBMISSION.decision);
    expect(persisted.phase0?.codeReading.l1Answer).toBe(LIAM_SUBMISSION.codeReading.l1Answer);
  });
});
