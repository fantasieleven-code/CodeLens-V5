/**
 * Task 27 / Pattern H v2.2 6th gate — Cluster C-MD end-to-end:
 *   (i)   moduleD:submit (V5-native envelope) → handler → persist → all 4 MD
 *         signals (sConstraintIdentification SD pure rule + sDesignDecomposition
 *         / sTradeoffArticulation SD LLM + sAiOrchestrationQuality AE LLM)
 *         compute non-null. Dual-block coverage:
 *           Block 1 (fallback path): assert deterministic fallback() yields
 *                   monotone Liam-tier scores without invoking ModelProvider —
 *                   proves persist → signal field-name alignment without LLM
 *                   nondeterminism.
 *           Block 2 (LLM mock): assert mocked ModelProvider returns canned JSON,
 *                   signals route through gradeWithLLM, returns LLM-graded
 *                   value with LLM_VERSION (structural — no value calibration).
 *   (ii)  cross-Task regression defense (6TH GATE) — seed Task 22
 *         aiCompletionEvents + Task 23 finalTestPassRate / finalFiles + Task 24
 *         selfAssess + Task 25 phase0.* + Task 26 moduleA.*, fire moduleD:submit,
 *         assert ALL 5 sibling namespaces (mb, selfAssess, phase0, moduleA,
 *         moduleC) survive. First test that exercises 5-namespace preservation
 *         simultaneously, sealing the Pattern H ladder.
 *   (iii) last-write-wins — second moduleD:submit replaces the first.
 *
 * Why integration: 4 distinct MD signals each read different submission
 * sub-paths (constraintsSelected against examData taxonomy; subModules +
 * interfaceDefinitions + dataFlowDescription; tradeoffText + subModules +
 * constraintsSelected; aiOrchestrationPrompts + subModules). Unit tests for
 * the persist layer and per-signal layers are isolated; only this test proves
 * the full ws → persist → 4-signal pipeline (with 3-of-4 LLM whitelist routing)
 * keeps field names aligned. A future drift in the persist's strict field-pick
 * would surface as some-but-not-all signals returning null here, not in
 * production silence.
 *
 * LLM mock template (becomes V5.0's first LLM whitelist Pattern H reference):
 *   - vi.mock('../../services/prompt-registry.service.js') — promptRegistry.get
 *     returns inline template string (no real prompt YAML loaded)
 *   - vi.mock('../../services/model/index.js') — modelFactory.generate is a
 *     vi.fn() the test seeds with canned JSON before each LLM-block case
 *
 * Mock surface: prisma + event-bus + promptRegistry + modelFactory. Real code
 * under test: registerModuleDHandlers + persistModuleDSubmission + 4 MD
 * signals.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MDModuleSpecific,
  SignalInput,
  V5ModuleDSubmission,
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

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(
      async (key: string) =>
        `[TEMPLATE ${key}] subModules={{subModules}} tradeoff={{tradeoffText}} prompts={{aiOrchestrationPrompts}}`,
    ),
  },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(),
  },
}));

import { registerModuleDHandlers } from '../../socket/moduleD-handlers.js';
import { sConstraintIdentification } from '../../signals/md/s-constraint-identification.js';
import { sDesignDecomposition, DESIGN_DECOMPOSITION_LLM_VERSION } from '../../signals/md/s-design-decomposition.js';
import { sTradeoffArticulation, TRADEOFF_ARTICULATION_LLM_VERSION } from '../../signals/md/s-tradeoff-articulation.js';
import { sAiOrchestrationQuality, AI_ORCHESTRATION_QUALITY_LLM_VERSION } from '../../signals/md/s-ai-orchestration-quality.js';
import { modelFactory } from '../../services/model/index.js';

// ─── MD exam fixture (mirrors md-se-signals.test.ts so calibration carries over) ───

const MD_EXAM: MDModuleSpecific = {
  designTask: {
    description: '设计一个高并发订单扣库存服务',
    businessContext: '电商大促,峰值 10k QPS',
    nonFunctionalRequirements: ['低延迟', '一致性', '可扩展'],
  },
  expectedSubModules: [
    { name: 'OrderService', responsibility: '订单入口', interfaces: ['POST /order'] },
  ],
  constraintCategories: [
    '性能',
    '可用性',
    '一致性',
    '成本',
    '安全',
    '可维护性',
    '可扩展性',
  ],
  designChallenges: [
    { trigger: '峰值流量', challenge: '如何在 10k QPS 下保证不超卖' },
  ],
};

const LIAM_SUBMISSION: V5ModuleDSubmission = {
  subModules: [
    {
      name: 'OrderController',
      responsibility:
        '订单入口;接受请求,做参数校验(skuId 40 字符上限),限流 5k QPS,转发给 OrderService。',
      interfaces: ['POST /orders', 'GET /orders/:id'],
    },
    {
      name: 'InventoryService',
      responsibility:
        '库存扣减;通过 Redis Lua 原子扣减,失败抛 OversoldError,成功后异步落 MySQL。',
      interfaces: ['reduce(skuId, qty)', 'compensate(orderId)'],
    },
    {
      name: 'OrderPersistence',
      responsibility: '订单写入 MySQL,使用唯一索引保证幂等,失败时触发补偿流程。',
      interfaces: ['create(order)', 'markPaid(orderId)'],
    },
    {
      name: 'Notifier',
      responsibility: '推送消息到 Kafka,下游订阅者做后续处理,包括库存补偿和账单生成。',
      interfaces: ['publish(event)'],
    },
    {
      name: 'Auditor',
      responsibility:
        '审计日志落 S3,保留 90 天,支持对账任务回溯,提供对账 API 给财务。',
      interfaces: ['log(event)', 'query(range)'],
    },
  ],
  interfaceDefinitions: [
    'POST /orders {skuId, qty} → 200 {orderId} / 409 Oversold',
    'reduce(skuId, qty) → Promise<{ok, remain}>',
  ],
  dataFlowDescription:
    'Client → OrderController → InventoryService.reduce (Redis Lua) → 成功 → OrderPersistence.create → Notifier.publish → Kafka 下游。失败路径触发 Compensator。',
  constraintsSelected: ['性能', '可用性', '一致性', '可扩展性', '可维护性'],
  tradeoffText:
    '方案 A: 纯 Redis Lua 扣库存,优点是 P99 <10ms,缺点是 Redis 挂掉时整条链路不可用。 方案 B: MySQL 乐观锁,优点是一致性强,缺点是高并发下锁冲突重,P99 升到 80ms。 方案 C: 两阶段, Redis 预扣 + MySQL 最终扣,优点综合 A 的性能和 B 的一致性,缺点复杂度高、对账任务必须。 最终推荐 C,因为性能和一致性都要保,10k QPS 下 B 撑不住,单靠 A 一致性无法保证。',
  aiOrchestrationPrompts: [
    '你是 InventoryService 的编码 agent。目标: 实现 reduce(skuId, qty)。约束: 必须原子,必须幂等,超时 300ms。输入: skuId string, qty number。输出: {ok:bool, remain:number}。步骤: 1) 查 Redis 库存 2) Lua 脚本原子扣减 3) 回写异步 MySQL。如果失败返回 OversoldError。',
    '你是 OrderPersistence 的编码 agent。目标: 写订单到 MySQL。约束: 唯一索引 (user_id, sku_id, request_id) 防重复。输入: Order 对象。输出: orderId。如果唯一索引冲突,返回现有 orderId(幂等)。',
    '你是 Compensator agent。目标: 处理 reduce 失败的补偿。约束: 必须最终一致,最多重试 3 次。输入: failedEvent。步骤: 1) 恢复 Redis 库存 2) 通知上游。如果 3 次失败,告警到 oncall。',
  ],
};

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-cluster-c-md', emit }) as unknown as Parameters<
    typeof registerModuleDHandlers
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
  vi.mocked(modelFactory.generate).mockReset();
});

describe('Pattern H v2.2 — Cluster C-MD pipeline (Task 27)', () => {
  // ─── (i) Block 1: fallback path tier (no LLM call) ───
  it('(i-fallback) V5 envelope → handler → persist → 4 MD signals via fallback yield non-null + Liam-tier', async () => {
    const { socket, ee } = makeSocket();
    registerModuleDHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-md-i-fb';
    const ack = vi.fn();

    await dispatchWithAck(
      ee,
      'moduleD:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(true);

    // Persisted V5 shape under metadata.moduleD.* (top-level, not metadata.submissions.*).
    const persisted = store.metadata as { moduleD?: V5ModuleDSubmission };
    expect(persisted.moduleD).toBeDefined();
    expect(persisted.moduleD?.subModules).toEqual(LIAM_SUBMISSION.subModules);
    expect(persisted.moduleD?.tradeoffText).toBe(LIAM_SUBMISSION.tradeoffText);
    expect(persisted.moduleD?.aiOrchestrationPrompts).toEqual(LIAM_SUBMISSION.aiOrchestrationPrompts);
    expect(persisted.moduleD?.constraintsSelected).toEqual(LIAM_SUBMISSION.constraintsSelected);

    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'architect',
      submissions,
      examData: { MD: MD_EXAM as unknown as Record<string, unknown> },
      participatingModules: ['moduleD'],
    };

    // Pure rule — runs through .compute(). LLM whitelist signals — exercise
    // .fallback() directly so no provider call is made (Block 1 isolation).
    const constraint = await sConstraintIdentification.compute(input);
    const decomposition = sDesignDecomposition.fallback!(input);
    const tradeoff = sTradeoffArticulation.fallback!(input);
    const aiOrch = sAiOrchestrationQuality.fallback!(input);

    expect(constraint.value, 'sConstraintIdentification').not.toBeNull();
    expect(decomposition.value, 'sDesignDecomposition (fallback)').not.toBeNull();
    expect(tradeoff.value, 'sTradeoffArticulation (fallback)').not.toBeNull();
    expect(aiOrch.value, 'sAiOrchestrationQuality (fallback)').not.toBeNull();

    // No LLM calls in Block 1 — fallback only.
    expect(vi.mocked(modelFactory.generate)).not.toHaveBeenCalled();

    // Liam should land in upper band — sanity that signal reads see substantive
    // answers, not field-mismatched zeros. Loose bounds; exact thresholds are
    // owned by md-se-signals.test.ts.
    expect(constraint.value as number).toBeGreaterThanOrEqual(0.7);
    expect(decomposition.value as number).toBeGreaterThanOrEqual(0.5);
    expect(tradeoff.value as number).toBeGreaterThanOrEqual(0.5);
    expect(aiOrch.value as number).toBeGreaterThanOrEqual(0.5);
  });

  // ─── (i) Block 2: LLM mock path (structural) ───
  it('(i-llm) V5 envelope → handler → persist → 3 LLM whitelist signals route to gradeWithLLM and return LLM-graded value', async () => {
    const { socket, ee } = makeSocket();
    registerModuleDHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-md-i-llm';
    await dispatchWithAck(
      ee,
      'moduleD:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      vi.fn(),
    );

    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'architect',
      submissions,
      examData: { MD: MD_EXAM as unknown as Record<string, unknown> },
      participatingModules: ['moduleD'],
    };

    // Structural assert: each LLM whitelist signal reaches modelFactory.generate
    // and returns LLM_VERSION (proves the route, not the score).
    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: '{"score": 0.78, "notes": "5 modules with clear responsibility"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 100,
    });
    const decomposition = await sDesignDecomposition.compute(input);
    expect(decomposition.value).toBe(0.78);
    expect(decomposition.algorithmVersion).toBe(DESIGN_DECOMPOSITION_LLM_VERSION);

    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: '{"score": 0.9, "notes": "strong tradeoff analysis"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 80,
    });
    const tradeoff = await sTradeoffArticulation.compute(input);
    expect(tradeoff.value).toBe(0.9);
    expect(tradeoff.algorithmVersion).toBe(TRADEOFF_ARTICULATION_LLM_VERSION);

    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: '{"score": 0.66, "notes": "prompts have goals + constraints"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 110,
    });
    const aiOrch = await sAiOrchestrationQuality.compute(input);
    expect(aiOrch.value).toBe(0.66);
    expect(aiOrch.algorithmVersion).toBe(AI_ORCHESTRATION_QUALITY_LLM_VERSION);

    // 3 LLM signals → 3 generate() calls. The pure rule (sConstraintIdentification)
    // does not route through gradeWithLLM and is excluded from this block.
    expect(vi.mocked(modelFactory.generate)).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(modelFactory.generate).mock.calls) {
      expect(call[0]).toBe('scoring');
      expect(call[1]).toMatchObject({
        sessionId,
        temperature: expect.any(Number),
      });
    }
  });

  it('(ii) cross-Task regression defense — Task 22/23 mb.* + Task 24 selfAssess + Task 25 phase0.* + Task 26 moduleA.* + moduleC survive an MD write (6th gate)', async () => {
    // Seed Task 22 + Task 23 + Task 24 + Task 25 + Task 26 state. Each prior
    // cluster has its own integration gate; here we only assert the MD writer
    // respects all 5 sibling namespaces. This is the FIRST test that exercises
    // 5-namespace preservation simultaneously — the Pattern H ladder closes here.
    store.metadata = {
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
      moduleA: {
        round1: {
          schemeId: 'A',
          reasoning: 'MA reasoning',
          structuredForm: { scenario: 's', tradeoff: 't', decision: 'd', verification: 'v' },
          challengeResponse: 'cr',
        },
        round2: { markedDefects: [{ defectId: 'd1', commentType: 'bug', comment: 'x' }] },
        round3: { correctVersionChoice: 'success', diffAnalysis: 'da', diagnosisText: 'dx' },
        round4: { response: 'r4', submittedAt: 1700000000000, timeSpentSec: 60 },
      },
      moduleC: [{ round: 1 }],
    };

    const { socket, ee } = makeSocket();
    registerModuleDHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-md-ii';
    const ack = vi.fn();
    await dispatchWithAck(
      ee,
      'moduleD:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    // All 5 prior cluster namespaces intact post-MD write.
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
      moduleA?: {
        round1?: { schemeId?: string };
        round4?: { response?: string };
      };
      moduleC?: unknown;
      moduleD?: V5ModuleDSubmission;
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
    expect(persisted.moduleA?.round1?.schemeId).toBe('A');
    expect(persisted.moduleA?.round4?.response).toBe('r4');
    expect(persisted.moduleC).toEqual([{ round: 1 }]);

    // MD state landed at the right namespace (top-level moduleD, not nested).
    expect(persisted.moduleD?.tradeoffText).toBe(LIAM_SUBMISSION.tradeoffText);
    expect(persisted.moduleD?.subModules).toHaveLength(5);
  });

  it('(iii) last-write-wins — second moduleD:submit replaces the first', async () => {
    const { socket, ee } = makeSocket();
    registerModuleDHandlers({} as never, socket);

    const sessionId = 'sess-cluster-c-md-iii';

    const firstSubmission: V5ModuleDSubmission = {
      subModules: [{ name: 'first', responsibility: 'first-resp' }],
      interfaceDefinitions: ['first-iface'],
      dataFlowDescription: 'first-flow',
      constraintsSelected: ['first-constraint'],
      tradeoffText: 'first-tradeoff',
      aiOrchestrationPrompts: ['first-prompt'],
    };
    await dispatchWithAck(ee, 'moduleD:submit', { sessionId, submission: firstSubmission }, vi.fn());

    await dispatchWithAck(
      ee,
      'moduleD:submit',
      { sessionId, submission: LIAM_SUBMISSION },
      vi.fn(),
    );

    const persisted = store.metadata as { moduleD?: V5ModuleDSubmission };
    expect(persisted.moduleD?.subModules).toEqual(LIAM_SUBMISSION.subModules);
    expect(persisted.moduleD?.subModules[0].name).toBe('OrderController'); // not 'first'
    expect(persisted.moduleD?.tradeoffText).toBe(LIAM_SUBMISSION.tradeoffText);
    expect(persisted.moduleD?.aiOrchestrationPrompts).toHaveLength(3);
  });
});
