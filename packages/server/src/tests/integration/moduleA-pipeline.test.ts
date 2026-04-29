/**
 * Task 26 / Pattern H v2.2 5th gate — Cluster C-MA end-to-end:
 *   (i)   moduleA:submit (V5-native envelope) → handler → persist → all 10 MA
 *         signals (sSchemeJudgment / sReasoningDepth / sContextQuality /
 *         sCriticalThinking / sArgumentResilience TJ ×5 + sCodeReviewQuality /
 *         sHiddenBugFound / sReviewPrioritization CQ ×3 + sDiagnosisAccuracy
 *         TJ + sPrincipleAbstraction TJ) compute non-null with monotone
 *         Liam-archetype scores.
 *   (ii)  cross-Task regression defense — seed Task 22 aiCompletionEvents +
 *         Task 23 finalTestPassRate / finalFiles + Task 24 selfAssess +
 *         Task 25 phase0.* into metadata, fire moduleA:submit, assert ALL
 *         sibling state intact across 4 sibling namespaces (mb, selfAssess,
 *         phase0, moduleC). This is the 5th Pattern H gate after Cluster A
 *         ingest (Task 22), Cluster B persistToMetadata (Task 23), Cluster D
 *         self-assess (Task 24), and Cluster C-P0 (Task 25); first to prove
 *         an MA writer respects all four prior namespaces simultaneously.
 *   (iii) last-write-wins — a second moduleA:submit replaces the first.
 *
 * Why integration: 10 distinct MA signals each read different submission
 * sub-paths (round1.schemeId, round1.structuredForm.{scenario,tradeoff,
 * verification}, round1.reasoning, round1.challengeResponse,
 * round2.markedDefects[].{commentType,comment}, round3.{correctVersionChoice,
 * diffAnalysis, diagnosisText}, round4.response). Unit tests for the persist
 * layer and per-signal layers are isolated; only this test proves the full
 * ws → persist → 10-signal pipeline keeps field names aligned. A future drift
 * in the persist's strict field-pick would surface as some-but-not-all
 * signals returning null here, not in production silence.
 *
 * Mock surface: prisma (in-memory metadata) + event-bus only. Real code
 * under test: registerModuleAHandlers + persistModuleASubmission + 10 MA
 * signals.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MAModuleSpecific,
  SignalInput,
  V5ModuleASubmission,
  V5Submissions,
} from '@codelens-v5/shared';

const store = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  maExam: null as MAModuleSpecific | null,
}));

vi.mock('../../config/db.js', () => ({
  prisma: {
    examModule: {
      findUnique: vi.fn(async () =>
        store.maExam ? { moduleSpecific: store.maExam } : null,
      ),
    },
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

import { registerModuleAHandlers } from '../../socket/moduleA-handlers.js';
import { sSchemeJudgment } from '../../signals/ma/s-scheme-judgment.js';
import { sReasoningDepth } from '../../signals/ma/s-reasoning-depth.js';
import { sContextQuality } from '../../signals/ma/s-context-quality.js';
import { sCriticalThinking } from '../../signals/ma/s-critical-thinking.js';
import { sArgumentResilience } from '../../signals/ma/s-argument-resilience.js';
import { sCodeReviewQuality } from '../../signals/ma/s-code-review-quality.js';
import { sHiddenBugFound } from '../../signals/ma/s-hidden-bug-found.js';
import { sReviewPrioritization } from '../../signals/ma/s-review-prioritization.js';
import { sDiagnosisAccuracy } from '../../signals/ma/s-diagnosis-accuracy.js';
import { sPrincipleAbstraction } from '../../signals/ma/s-principle-abstraction.js';

// ─── MA exam fixture (mirrors ma-signals.test.ts so the calibration carries over) ───

const MA_EXAM: MAModuleSpecific = {
  requirement:
    '设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值。需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。',
  schemes: [
    {
      id: 'A',
      name: 'Redis 预扣 + MySQL 异步落库',
      description: '库存预扣 Redis,订单异步写 MySQL',
      pros: ['延迟低 10ms', '吞吐高 QPS 20k', 'Redis 原子减'],
      cons: ['一致性弱', 'Redis 崩溃丢数据', '对账复杂'],
      performance: 'QPS 20k P99 10ms',
      cost: '单机 Redis 成本低',
    },
    {
      id: 'B',
      name: 'MySQL 悲观锁',
      description: 'SELECT FOR UPDATE 扣减',
      pros: ['强一致', '简单'],
      cons: ['QPS 低 500', '锁等待', '死锁风险'],
      performance: 'QPS 500 P99 100ms',
      cost: '低',
    },
    {
      id: 'C',
      name: 'MQ 异步扣减',
      description: 'Kafka 异步处理',
      pros: ['削峰', '解耦'],
      cons: ['延迟高', '消息顺序', '最终一致'],
      performance: 'QPS 10k 延迟秒级',
      cost: '中',
    },
  ],
  counterArguments: {
    A: ['Redis 宕机后库存如何恢复?', '如果 MySQL 落库失败,前端看到扣减但订单没生成怎么办?'],
    B: ['500 QPS 根本扛不住秒杀场景', '锁等待会让 P99 延迟飙到秒级'],
    C: ['用户下单后多久能看到结果?体验差', 'MQ 消息丢失如何补偿'],
  },
  defects: [
    { defectId: 'd1', line: 12, content: 'redis.decr 未检查返回值', severity: 'critical', category: 'correctness' },
    { defectId: 'd2', line: 25, content: 'MySQL 写入无重试', severity: 'major', category: 'reliability' },
    { defectId: 'd3', line: 40, content: '缺少日志', severity: 'minor', category: 'observability' },
  ],
  decoys: [
    { line: 8, content: 'const key = lockKey; // 看起来像 bug 但不是' },
    { line: 33, content: 'return null; // 故意误导' },
  ],
  codeForReview: `// line 12
redis.decr("stock:" + skuId);
// ...
// line 25
await mysql.insert(order);
// line 40
// ...
`,
  failureScenario: {
    successCode: `redis.decr(key);
if (result < 0) { await redis.incr(key); throw new Error("oversold"); }
await mysql.insert(order);`,
    failedCode: `redis.decr(key);
await mysql.insert(order);`,
    diffPoints: [
      { line: 2, description: 'missing oversold check after decr' },
      { line: 3, description: 'no rollback on mysql failure' },
    ],
    rootCause:
      '失败版本缺少 Redis decr 返回值检查,高并发下会超卖;同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误。',
  },
  migrationScenario: {
    newBusinessContext:
      '双 11 抢红包场景 — 活动整点开放 2 分钟,预生成红包池共 50,000 个(金额随机 1-50 元),预估 500,000 用户同时点击"抢"。',
    relatedDimension: '高并发下的互斥分配与原子扣减',
    differingDimension: '规模差 25× · 延迟预算更松 · 容错要求更宽',
    promptText: '在抢红包的新场景下,你在 R1 为秒杀下单选的方案还成立吗?',
  },
};

const LIAM_SUBMISSION: V5ModuleASubmission = {
  round1: {
    schemeId: 'A',
    reasoning:
      '我选 A(Redis 预扣 + MySQL 异步落库)。核心原因是秒杀场景的首要瓶颈是瞬时 QPS 20k,MySQL 单机悲观锁只有 500 QPS,远不够。Redis 原子减 decr 的 P99 延迟 10ms,能扛住峰值。异步落库的一致性弱点可以通过幂等订单号 + 对账任务补齐,代价可控。',
    structuredForm: {
      scenario: '10000 QPS 秒杀系统的库存扣减模块,Redis 和 MySQL 一致性',
      tradeoff:
        'A 方案延迟低 10ms 吞吐高 QPS 20k,但一致性弱、Redis 崩溃丢数据;B 方案强一致但 QPS 500 扛不住;C 方案削峰但延迟秒级体验差。',
      decision: 'A 方案,因为 QPS 是首要约束,一致性弱点可通过幂等 + 对账缓解',
      verification:
        '压测 20k QPS,监控 Redis 与 MySQL 差异,确认 5 分钟内对账完成。注意 Redis 宕机恢复机制需要做快照 + AOF。',
    },
    challengeResponse:
      '保持选 A。即使 Redis 宕机,我会用 AOF + 每 5 秒快照把 RTO 压到 30 秒以内。对比 B 方案 500 QPS 直接崩溃的代价,A 的风险在可控范围。关键指标是 P99 < 20ms + RTO < 30s,这两个 B 都做不到。因为我们的业务场景就是 10000 QPS 的秒杀,不是一般 CRUD,所以选 A 的 tradeoff 合理。',
  },
  round2: {
    markedDefects: [
      {
        defectId: 'd1',
        line: 12,
        commentType: 'bug',
        comment: 'redis.decr 返回值未检查,高并发会超卖 — critical',
        fixSuggestion: '检查 result < 0 时回滚 incr',
      },
      {
        defectId: 'd2',
        line: 25,
        commentType: 'bug',
        comment: 'MySQL insert 无重试,一次失败永久丢单 — 需要 retry + DLQ',
        fixSuggestion: '加 retry 3 次 + 死信队列',
      },
      {
        defectId: 'd3',
        line: 40,
        commentType: 'suggestion',
        comment: '建议加关键路径日志,方便后续对账',
        fixSuggestion: '加 logger.info 在 decr 前后',
      },
    ],
  },
  round3: {
    correctVersionChoice: 'success',
    diffAnalysis:
      '失败版本在 line 2 缺少 decr 返回值检查,line 3 的 mysql.insert 没有配合 Redis 回滚。成功版本多了 if (result < 0) incr + throw 的保护。',
    diagnosisText:
      '失败版本缺少 Redis decr 返回值检查,在高并发场景下会出现超卖;同时 MySQL 写入失败不会回滚 Redis,造成库存永久错误。根本原因是双写一致性保护缺失。',
  },
  round4: {
    response:
      '核心原则不变 — 高并发场景下,Redis 预扣 + 异步落库仍然是正确选择,关键是原子性保护 + 补偿机制。但具体参数需要调整:红包抢购的并发量比秒杀更高,需要更短的 TTL;考虑到红包金额不能超发,幂等性校验要放在 Redis 层而不是 MySQL 层;阈值也要变,因为红包的扣减是按金额不是按件数。这和之前 R1 选 A 的逻辑一致。',
    submittedAt: 1700000000000,
    timeSpentSec: 180,
  },
};

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-cluster-c-ma', emit }) as unknown as Parameters<
    typeof registerModuleAHandlers
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
  store.metadata = { examInstanceId: 'exam-ma-integration' };
  store.maExam = MA_EXAM;
});

describe('Pattern H v2.2 — Cluster C-MA pipeline (Task 26)', () => {
  it('(i) V5 envelope → handler → persist → all 10 MA signals compute non-null', async () => {
    const { socket, ee } = makeSocket();
    registerModuleAHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-ma-i';
    const ack = vi.fn();

    await dispatchWithAck(
      ee,
      'moduleA:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(true);

    // Persisted V5 shape under metadata.moduleA.* (top-level, not metadata.submissions.*).
    const persisted = store.metadata as { moduleA?: V5ModuleASubmission };
    expect(persisted.moduleA).toBeDefined();
    expect(persisted.moduleA?.round1).toEqual(LIAM_SUBMISSION.round1);
    expect(persisted.moduleA?.round2).toEqual({ markedDefects: LIAM_SUBMISSION.round2.markedDefects });
    expect(persisted.moduleA?.round3).toEqual(LIAM_SUBMISSION.round3);
    expect(persisted.moduleA?.round4).toEqual(LIAM_SUBMISSION.round4);

    // All 10 MA signals compute against the persisted snapshot.
    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: { MA: MA_EXAM as unknown as Record<string, unknown> },
      participatingModules: ['moduleA'],
    };

    const [
      schemeJudgment,
      reasoningDepth,
      contextQuality,
      criticalThinking,
      argumentResilience,
      codeReviewQuality,
      hiddenBugFound,
      reviewPrioritization,
      diagnosisAccuracy,
      principleAbstraction,
    ] = await Promise.all([
      sSchemeJudgment.compute(input),
      sReasoningDepth.compute(input),
      sContextQuality.compute(input),
      sCriticalThinking.compute(input),
      sArgumentResilience.compute(input),
      sCodeReviewQuality.compute(input),
      sHiddenBugFound.compute(input),
      sReviewPrioritization.compute(input),
      sDiagnosisAccuracy.compute(input),
      sPrincipleAbstraction.compute(input),
    ]);

    // Non-null for all 10 — proves the persist layer's field names line up
    // with each signal's read paths. A drift in any field → null here.
    expect(schemeJudgment.value, 'sSchemeJudgment').not.toBeNull();
    expect(reasoningDepth.value, 'sReasoningDepth').not.toBeNull();
    expect(contextQuality.value, 'sContextQuality').not.toBeNull();
    expect(criticalThinking.value, 'sCriticalThinking').not.toBeNull();
    expect(argumentResilience.value, 'sArgumentResilience').not.toBeNull();
    expect(codeReviewQuality.value, 'sCodeReviewQuality').not.toBeNull();
    expect(hiddenBugFound.value, 'sHiddenBugFound').not.toBeNull();
    expect(reviewPrioritization.value, 'sReviewPrioritization').not.toBeNull();
    expect(diagnosisAccuracy.value, 'sDiagnosisAccuracy').not.toBeNull();
    expect(principleAbstraction.value, 'sPrincipleAbstraction').not.toBeNull();

    // Liam should land in the upper band — sanity check that signal reads see
    // substantive answers, not field-mismatched zeros. Loose bounds because
    // exact thresholds are owned by ma-signals.test.ts; we only care that the
    // pipeline doesn't silently flatten Liam to Max-tier.
    expect(schemeJudgment.value as number).toBeGreaterThanOrEqual(0.5);
    expect(reasoningDepth.value as number).toBeGreaterThanOrEqual(0.5);
    expect(diagnosisAccuracy.value as number).toBeGreaterThanOrEqual(0.5);
  });

  it('(ii) cross-Task regression defense — Task 22/23 mb.* + Task 24 selfAssess + Task 25 phase0.* + moduleC survive an MA write (5th gate)', async () => {
    // Seed Task 22 + Task 23 + Task 24 + Task 25 state. Each prior cluster has
    // its own integration gate; here we only assert the MA writer respects
    // all four sibling namespaces. This is the first test that exercises
    // four-namespace preservation simultaneously.
    store.metadata = {
      examInstanceId: 'exam-ma-integration',
      mb: {
        editorBehavior: {
          aiCompletionEvents: [
            {
              timestamp: 1,
              accepted: true,
              lineNumber: 5,
              completionLength: 12,
              shown: true,
              shownAt: 100,
              respondedAt: 800,
              documentVisibleMs: 700,
            },
            {
              timestamp: 2,
              accepted: false,
              lineNumber: 6,
              completionLength: 8,
              shown: true,
              shownAt: 200,
              respondedAt: 1400,
              documentVisibleMs: 1200,
            },
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
      phase0: {
        codeReading: { l1Answer: 'L1', l2Answer: 'L2', l3Answer: 'L3', confidence: 0.6 },
        aiOutputJudgment: [{ choice: 'A', reasoning: 'why' }],
        aiClaimVerification: { response: 'mismatch', submittedAt: 1700000000000 },
        decision: { choice: 'C', reasoning: '止血' },
      },
      moduleC: [{ round: 1 }],
    };

    const { socket, ee } = makeSocket();
    registerModuleAHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-ma-ii';
    const ack = vi.fn();
    await dispatchWithAck(
      ee,
      'moduleA:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    // All 4 prior cluster namespaces intact post-MA write.
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
      phase0?: { decision?: { choice?: string; reasoning?: string }; codeReading?: { l1Answer?: string } };
      moduleC?: unknown;
      moduleA?: V5ModuleASubmission;
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
    expect(persisted.phase0?.decision).toEqual({ choice: 'C', reasoning: '止血' });
    expect(persisted.phase0?.codeReading?.l1Answer).toBe('L1');
    expect(persisted.moduleC).toEqual([{ round: 1 }]);

    // MA state landed at the right namespace (top-level moduleA, not nested).
    expect(persisted.moduleA?.round1.schemeId).toBe('A');
    expect(persisted.moduleA?.round4.response).toBe(LIAM_SUBMISSION.round4.response);
  });

  it('(iii) last-write-wins — second moduleA:submit replaces the first', async () => {
    const { socket, ee } = makeSocket();
    registerModuleAHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-ma-iii';

    // First write: a Steve-tier submission.
    const firstSubmission: V5ModuleASubmission = {
      round1: {
        schemeId: 'B',
        reasoning: 'first reasoning',
        structuredForm: { scenario: 's', tradeoff: 't', decision: 'd', verification: 'v' },
        challengeResponse: 'first challenge',
      },
      round2: {
        markedDefects: [
          { defectId: 'd1', line: 12, commentType: 'nit', comment: 'first nit comment' },
        ],
      },
      round3: {
        correctVersionChoice: 'failed',
        diffAnalysis: 'first diff',
        diagnosisText: 'first diag',
      },
      round4: { response: 'first round4', submittedAt: 1, timeSpentSec: 1 },
    };
    await dispatchWithAck(ee, 'moduleA:submit', { sessionId, submission: firstSubmission }, vi.fn());

    // Second write: Liam submission overwrites first.
    await dispatchWithAck(
      ee,
      'moduleA:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      vi.fn(),
    );

    const persisted = store.metadata as { moduleA?: V5ModuleASubmission };
    expect(persisted.moduleA?.round1).toEqual(LIAM_SUBMISSION.round1);
    expect(persisted.moduleA?.round1.schemeId).toBe('A'); // not B from first
    expect(persisted.moduleA?.round3.correctVersionChoice).toBe('success'); // not failed from first
    expect(persisted.moduleA?.round4.response).toBe(LIAM_SUBMISSION.round4.response);
  });
});
