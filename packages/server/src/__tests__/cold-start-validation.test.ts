/**
 * Cold Start Validation harness — Task 15a Deliverable C (Pattern H 8th gate).
 *
 * Production-style end-to-end proof that the hydrator correctly turns a
 * freshly-built `Session.metadata` bundle into a fully-computed
 * `V5ScoringResult` — **the harness production scoring has been missing**.
 * Prior Pattern H gates (7th in Task 30a) proved per-Cluster persist →
 * signal read paths; this gate proves the hydrate → score → persist seam
 * the Admin API (Task 15b) and the final Cold Start Validation sprint
 * both hinge on.
 *
 * 3 Blocks (dual-block mirror of Task 30a 7th gate):
 *   Block 1 — Full coverage: all 6 module namespaces populated, deep_dive
 *     suite, ≥46 of 47 signals non-null, 6 dimensions populated, grade
 *     computation works, scoringResult persisted.
 *   Block 2 — Graceful degradation: selfAssess namespace removed; the 1
 *     SE signal (sMetaCognition) null-outs but the hydrator does not
 *     throw and the remaining ≥42 signals still compute non-null.
 *   Block 3 — Idempotency: running hydrateAndScore twice against the same
 *     session yields deep-equal scoringResult; no hidden side-effect
 *     state leaks between calls.
 *
 * Out of scope (deferred to the final Cold Start Validation sprint):
 *   - Real Socket.IO client connection + full candidate event stream.
 *   - Frontend integration (Task 12 Layer 2).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { V5ScoringResult, SuiteId } from '@codelens-v5/shared';
import { V5_DIMENSIONS } from '@codelens-v5/shared';

vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

vi.mock('../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(async (key: string) => `[TEMPLATE ${key}]`),
  },
}));

vi.mock('../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(async () => ({
      content: '{"score":0.7,"notes":"mocked rubric"}',
      providerId: 'mock',
      model: 'mock-scoring',
      latencyMs: 1,
      usage: { promptTokens: 0, completionTokens: 0 },
    })),
  },
}));

// llm-helper dynamically imports `services/model/index.js` at call-time (the
// header comment in llm-helper.ts explains: static imports would transitively
// load config/env.ts and `process.exit(1)` when DATABASE_URL/JWT_SECRET are
// unset). Dynamic-import mock resolution in vitest is flaky across relative-path
// spellings; bypass it entirely by mocking `gradeWithLLM` to a deterministic
// success that reuses each signal's LLM version identifier — the registry sees
// a valid SignalResult and never hits the fallback branch, which keeps
// ≥46 non-null signals achievable without coupling to LLM provider wiring.
vi.mock('../signals/md/llm-helper.js', async () => {
  const actual = await vi.importActual<typeof import('../signals/md/llm-helper.js')>(
    '../signals/md/llm-helper.js',
  );
  return {
    ...actual,
    gradeWithLLM: vi.fn(async (req) => ({
      value: 0.7,
      evidence: [
        {
          source: req.evidenceSource,
          excerpt: req.evidenceExcerpt,
          contribution: 0.7,
          triggeredRule: 'cold_start_mock_llm',
        },
      ],
      algorithmVersion: req.llmAlgorithmVersion,
      computedAt: Date.now(),
    })),
  };
});

import { __resetDefaultRegistryForTests } from '../services/scoring-orchestrator.service.js';
import { ScoringHydratorService } from '../services/scoring-hydrator.service.js';
import { ExamDataService } from '../services/exam-data.service.js';

// ────────────────────── synthetic fixture ──────────────────────

const T0 = 1_700_000_000_000;
const SESSION_ID = 'cold-start-s1';
const EXAM_INSTANCE_ID = 'cold-start-exam-1';
const SUITE: SuiteId = 'deep_dive';

/** Minimally-complete metadata fixture covering all 6 module namespaces. */
function buildFullMetadata(): Record<string, unknown> {
  return {
    suiteId: SUITE,
    moduleOrder: ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'moduleC'],
    examInstanceId: EXAM_INSTANCE_ID,
    schemaVersion: 5,
    submissions: {},
    assessmentQuality: 'full',

    phase0: {
      codeReading: {
        l1Answer: 'Redis 互斥锁防止同 SKU 并发下单。',
        l2Answer:
          '关键决策是 SET NX + TTL 30s 作为悲观锁,避免同一用户对同一 SKU 的并发扣减。TTL 既足够完成事务也能在崩溃时自动释放,代价是锁住的 SKU 对其他流程短时不可见。',
        l3Answer:
          'QPS 涨到 10k 时瓶颈在 Redis 单机 set/del 的 P99 延迟 — 每单至少 2 次 round-trip。finally 里 GET+DEL 不是原子的,多实例下存在误删别人锁的风险,应换成 Lua 比较并删。',
        confidence: 0.8,
      },
      aiOutputJudgment: [
        { choice: 'A', reasoning: 'A 显式加 Redis 互斥锁,B 无锁裸写数据库并发会重复下单。' },
        { choice: 'B', reasoning: 'B 用 cache-aside,未命中回源;A 直接读 cache 会返回 null。' },
      ],
      aiClaimVerification: {
        response:
          'AI 说用 WATCH/MULTI 实现乐观锁,但代码里只有 SET NX 一行,没有 MULTI 和 EXEC,NX+TTL 是悲观锁写法,不是乐观锁。',
        submittedAt: T0 + 60_000,
      },
      decision: {
        choice: 'C',
        reasoning: '先限流止血压住核心,再基于日志排查 root cause,避免直接回滚丢掉已经成功的订单。',
      },
    },

    moduleA: {
      round1: {
        schemeId: 'A',
        reasoning:
          '方案 A(Redis 预扣 + 异步落库)。从性能、一致性、可用性三维度拆:10k QPS 对 MySQL 悲观锁是 hard block,Redis decr P99 10ms 正解;双写一致性用 requestId 幂等键 + 对账任务缓解;Redis 崩溃风险用 AOF + sentinel 兜底。综合 A 的局限可缓解,其他方案瓶颈不可解。',
        structuredForm: {
          scenario:
            '秒杀系统库存扣减,10000 QPS 峰值,避免超卖、保证幂等、Redis/MySQL 一致性。',
          tradeoff:
            'A(Redis 预扣): QPS 20k / 一致性弱 / 对账复杂;B(MySQL 悲观锁): 强一致但 QPS 500 扛不住;C(MQ 异步): 削峰但秒级延迟体验差。',
          decision: '方案 A,因为 10000 QPS 是 hard 约束,一致性弱可通过幂等键 + 对账缓解。',
          verification:
            '三层验证: (1) 压测 20k QPS P99 < 15ms; (2) 对账 5 分钟窗口不一致率 < 10 ppm; (3) 故障注入 sentinel RTO < 5s。',
        },
        challengeResponse:
          '继续坚持 A。Redis 单点确实是最大风险,量化后:年宕机 < 5 分钟,失效率 < 0.01%;sentinel RTO 5 秒 + AOF RPO < 1 秒,窗口期限流 + MySQL 兜底。挑战的两个方案瓶颈都不可解。',
      },
      round2: {
        markedDefects: [
          {
            defectId: 'd1',
            commentType: 'bug',
            comment: 'redis.decr 返回值未检查,高并发会超卖 — critical',
            fixSuggestion: 'result < 0 回滚 incr',
          },
          {
            defectId: 'd2',
            commentType: 'bug',
            comment: 'MySQL insert 无重试,一次失败永久丢单',
            fixSuggestion: 'retry 3 次 + 死信队列',
          },
          {
            defectId: 'd3',
            commentType: 'suggestion',
            comment: '建议加关键路径日志方便对账',
          },
        ],
      },
      round3: {
        correctVersionChoice: 'success',
        diffAnalysis:
          '失败版本 line 2 缺少 decr 返回值检查,line 3 的 mysql.insert 没有配合 Redis 回滚。成功版本多了 if (result < 0) incr + throw 的保护,并且在 mysql 写入外层加了 try/catch 触发 Redis 回补。',
        diagnosisText:
          '双根因: (1) 原子操作缺失 — decr 返回 -1 被忽略导致超卖; (2) 补偿路径缺失 — MySQL 异常后 Redis 已扣减,形成永久漂移。秒杀业务 0 容忍。',
      },
      round4: {
        response:
          '核心原则不变 — 高并发场景下 Redis 预扣 + 异步落库仍是正解,本质是"原子性 + 补偿 + 幂等"三件套。迁移到红包时参数调整: TTL 30s → 10s、精度改 bignum、幂等键从 requestId 换 userId+redpackId、加防刷。',
        submittedAt: T0 + 180_000,
        timeSpentSec: 180,
      },
    },

    mb: {
      planning: {
        decomposition:
          '1. 阅读 InventoryRepository 当前 decrement 实现; 2. 实现 Redis SETNX + Lua 原子扣减; 3. InventoryService 传 requestId 做幂等; 4. InventoryController validation; 5. 跑 tests/inventory.test.ts 验证。',
        dependencies:
          'Repository 调 redis; Service 依赖 Repository; Controller 依赖 Service。',
        fallbackStrategy:
          'Redis 宕机 → MySQL SELECT FOR UPDATE 降级; Lua 超时 → retry 3 次 + rollback; 监控告警触发。',
        submittedAt: T0 + 1_000,
        skipped: false,
      },
      editorBehavior: {
        aiCompletionEvents: Array.from({ length: 10 }, (_, i) => ({
          timestamp: T0 + 60_000 + i * 5_000,
          shown: true,
          accepted: i < 6,
          rejected: i >= 6,
          lineNumber: i + 3,
          completionLength: 40,
          shownAt: T0 + 60_000 + i * 5_000,
          respondedAt: T0 + 60_000 + i * 5_000 + 1_000,
          documentVisibleMs: 1_000,
        })),
        chatEvents: [
          {
            timestamp: T0 + 100_000,
            prompt:
              'InventoryRepository.decrement has a TOCTOU race — show a SETNX + Lua impl. 验证 edge case。',
            responseLength: 400,
            duration: 3_000,
            diffShownAt: T0 + 101_000,
            diffRespondedAt: T0 + 102_000,
            documentVisibleMs: 1_000,
          },
          {
            timestamp: T0 + 200_000,
            prompt:
              'Verify InventoryService.reduce handles undefined qty — check validation; bug 风险。',
            responseLength: 200,
            duration: 2_000,
          },
          {
            timestamp: T0 + 230_000,
            prompt:
              'Confirm InventoryController validates skuId 40-char boundary before service.reduce。',
            responseLength: 260,
            duration: 2_500,
          },
          {
            timestamp: T0 + 260_000,
            prompt:
              'Check retry bug: redis.eval timeout after 500ms, does OversoldError propagate or swallow?',
            responseLength: 300,
            duration: 2_500,
          },
        ],
        diffEvents: [
          { timestamp: T0 + 110_000, accepted: true, linesAdded: 12, linesRemoved: 2 },
          { timestamp: T0 + 210_000, accepted: false, linesAdded: 5, linesRemoved: 0 },
          { timestamp: T0 + 240_000, accepted: true, linesAdded: 6, linesRemoved: 1 },
          { timestamp: T0 + 270_000, accepted: true, linesAdded: 4, linesRemoved: 0 },
        ],
        fileNavigationHistory: [
          { timestamp: T0 + 5_000, filePath: 'tests/inventory.test.ts', action: 'open' },
          { timestamp: T0 + 15_000, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
          { timestamp: T0 + 30_000, filePath: 'src/inventory/InventoryService.ts', action: 'open' },
          { timestamp: T0 + 45_000, filePath: 'src/inventory/InventoryController.ts', action: 'open' },
        ],
        editSessions: [
          {
            filePath: 'src/inventory/InventoryRepository.ts',
            startTime: T0 + 60_000,
            endTime: T0 + 120_000,
            keystrokeCount: 120,
            durationMs: 60_000,
            closedBy: 'file_switch',
          },
          {
            filePath: 'src/inventory/InventoryService.ts',
            startTime: T0 + 130_000,
            endTime: T0 + 180_000,
            keystrokeCount: 80,
            durationMs: 50_000,
            closedBy: 'file_switch',
          },
          {
            filePath: 'src/inventory/InventoryController.ts',
            startTime: T0 + 200_000,
            endTime: T0 + 250_000,
            keystrokeCount: 60,
            durationMs: 50_000,
            closedBy: 'idle_timeout',
          },
        ],
        testRuns: [
          { timestamp: T0 + 50_000, passRate: 0, duration: 2_000 },
          { timestamp: T0 + 280_000, passRate: 0.8, duration: 2_000 },
          { timestamp: T0 + 310_000, passRate: 1, duration: 2_000 },
        ],
        documentVisibilityEvents: [{ timestamp: T0 + 40_000, hidden: false }],
      },
      finalFiles: [
        {
          path: 'src/inventory/InventoryRepository.ts',
          content:
            'export class InventoryRepository { async decrement(skuId, qty, requestId) { /* Lua eval */ } }',
        },
        {
          path: 'src/inventory/InventoryService.ts',
          content:
            'export class InventoryService { async reduce(skuId, qty, requestId) { if (qty <= 0) throw; await this.repo.decrement(skuId, qty, requestId); } }',
        },
      ],
      finalTestPassRate: 1,
      standards: {
        rulesContent:
          '# Inventory rules\n1. Stock-mutating methods accept requestId (idempotency).\n2. Redis stock ops run inside a single Lua eval (atomic).\n3. Never delete others\' lock — compare-and-delete via Lua.\n4. Oversold throws OversoldError; never silent null.\n5. Log lines include skuId + quantity + requestId.',
        agentContent:
          '当 Agent 改 InventoryRepository/Service 时,必须读 rules.md 的 5 条并在 PR 勾选每条。涉及 redis.decr/mysql.insert 的改动要配套 tests/inventory.test.ts 更新。',
      },
      audit: {
        violations: [
          { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule-oversold-check' },
          { exampleIndex: 1, markedAsViolation: false },
          { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule-retry-required' },
        ],
      },
    },

    moduleD: {
      subModules: [
        { name: 'gateway', responsibility: '入口鉴权 + 限流 + 请求签名校验 + 流量路由', interfaces: ['POST /v1/orders'] },
        { name: 'inventory', responsibility: '库存扣减原子化 + 防超卖 + 对账兜底 + 幂等保证', interfaces: ['POST /v1/inventory/decr'] },
        { name: 'fulfillment', responsibility: '订单履约 + 支付回调 + 物流对接 + 异常补偿' },
        { name: 'notification', responsibility: '订单状态通知 + SMS / Email / 推送 + 失败重试' },
        { name: 'reconciliation', responsibility: '对账任务 + 跨系统一致性校验 + 差异修正' },
      ],
      interfaceDefinitions: [
        'POST /v1/orders { skuId, qty, userId, requestId } → { orderId, status }',
        'POST /v1/inventory/decr { skuId, qty, requestId } → { success, stockAfter }',
        'GET /v1/orders/:id → { order, history[] }',
      ],
      dataFlowDescription:
        'gateway → inventory(Redis Lua) → MQ → fulfillment → notification. 对账任务每 5 分钟扫一次 inventory 与 order 状态比对。',
      constraintsSelected: [
        'high_throughput',
        'eventual_consistency',
        'idempotent',
        'observable',
        'fault_tolerant',
      ],
      tradeoffText:
        '吞吐换强一致: Lua 原子扣减 + 异步对账,代价是 30s 对账延迟。Redis 故障窗口降级到 MySQL 悲观锁,QPS 下降但不丢单。',
      aiOrchestrationPrompts: [
        '列出秒杀场景下需要原子操作的步骤',
        '审视这个数据流是否有死锁风险',
        '帮我评估 AOF + sentinel 的 RTO/RPO 组合',
      ],
    },

    selfAssess: {
      confidence: 0.78,
      reasoning:
        '整体 S 档 headroom 不大。P0 L3 稳,但 aiOutputJudgment 第二题错答 (-5%)。MA R4 迁移偏保守,缺业务阈值案例 (-5%)。MB Lua 脚本只压测 1k QPS,真实 20k 峰值未覆盖,生产置信度 -10%。MC R3 100k QPS escalation 漏 proxy 层方案,这是最大盲区。下次面试会在迁移题上准备更厚的业务侧阈值案例。',
      reviewedDecisions: ['P0 L3 answer', 'MA R1 scheme A', 'MA R4 transfer', 'MB Lua impl', 'MC R3 escalation'],
    },

    moduleC: [
      {
        round: 1,
        question: '描述 R1 选的方案 A 的核心思路',
        answer:
          'A = Redis 预扣 + MySQL 异步落库。首要瓶颈 20k QPS,Redis decr 10ms P99 远优于 MySQL 悲观锁 500 QPS。幂等键用 requestId,对账兜底最终一致。意识到 Redis 崩溃是弱点,加 AOF + sentinel 热备 RTO 30s。',
        probeStrategy: 'baseline',
      },
      {
        round: 2,
        question: 'Redis 挂掉窗口期怎么保证可用性?',
        answer:
          '承认 R1 没充分覆盖 Redis 崩溃 — 我错了,把 AOF 当成了一步到位的可用性兜底。更准确: AOF 每秒 + sentinel 主从热备 RTO 5s,窗口期降级 MySQL 悲观锁 QPS 500 兜底,上游限流把峰值压到 300 以内。取决于业务对窗口成本的敏感度,支付秒杀 5s / 活动秒杀 30s 可以接受。',
        probeStrategy: 'weakness',
      },
      {
        round: 3,
        question: 'QPS 涨到 100k 还撑得住吗?',
        answer:
          '撑不住。Redis 单机瓶颈 ~5w QPS,必须集群 + sharding 按 skuId 分片。基于 R2 思路,集群层也做 AOF + sentinel。热门 SKU 本地缓存 + 读写分离,取决于 skew;Top 10 SKU 占 80% 流量还要上 Redis proxy (Codis)。教训: 单点瓶颈思维早该放弃,分布式是 100k+ 基线。',
        probeStrategy: 'escalation',
      },
      {
        round: 4,
        question: '换成红包抢购场景还会选 A 吗?',
        answer:
          '还会选 A。迁移调整: Lua bignum 处理金额避免浮点误差;幂等键 userId + redpackId;TTL 延长到 24h;加防刷 + 黑名单 (秒杀弱需求)。核心 "Redis 扣减 + 异步落库" 不变,参数按业务调整。',
        probeStrategy: 'transfer',
      },
    ],
  };
}

/**
 * Exam data stub — every participating module gets a non-null exam fixture so
 * signals that dereference `examData.X.*` can compute rather than null-out.
 * Shapes mirror the Golden Path exam-data module so signal consumers stay
 * happy without importing a giant fixture file.
 */
function buildExamDataStub(): ExamDataService {
  const stub = {
    getBusinessScenario: vi.fn().mockResolvedValue({ summary: 'cold-start' }),
    getP0Data: vi.fn().mockResolvedValue({
      systemCode:
        'const lockKey = `sku:${skuId}`;\nredis.set(lockKey, uuid, "NX", "EX", 30);\ntry { await process(); } finally { const current = await redis.get(lockKey); if (current === uuid) await redis.del(lockKey); }',
      codeReadingQuestions: {
        l1: {
          question: '核心职责是什么?',
          options: ['Redis 互斥锁防止并发下单', '记录日志', '发送邮件', '计算价格'],
          correctIndex: 0,
        },
        l2: { question: '关键设计决策?' },
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
          codeB:
            'function x() { const v = await cache.get(k); if (!v) v = await db.query(); return v; }',
          context: '读缓存',
          groundTruth: 'B',
        },
      ],
      decision: {
        scenario: '订单支付失败率从 1% 涨到 30%,先做什么?',
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
    }),
    getMAData: vi.fn().mockResolvedValue({
      requirement:
        '设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值。需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。',
      schemes: [
        {
          id: 'A',
          name: 'Redis 预扣 + 异步落库',
          description: 'Redis decr 扣减,MySQL 异步落库',
          pros: ['吞吐', '低延迟'],
          cons: ['一致性弱', '对账复杂', 'Redis 宕机风险', 'sentinel'],
        },
        {
          id: 'B',
          name: 'MySQL 悲观锁',
          description: '',
          pros: ['强一致'],
          cons: ['QPS 低', '锁等待', '扛不住'],
        },
        {
          id: 'C',
          name: 'MQ 异步',
          description: '',
          pros: ['削峰'],
          cons: ['延迟', '消息丢失'],
        },
      ],
      counterArguments: {
        A: ['Redis 宕机如何恢复?', 'MySQL 落库失败怎么办?'],
        B: ['500 QPS 扛不住', '锁等待飙升'],
        C: ['延迟秒级', '消息丢失'],
      },
      defects: [
        {
          defectId: 'd1',
          line: 12,
          content: 'redis.decr 未检查返回值',
          severity: 'critical',
          category: 'correctness',
        },
        {
          defectId: 'd2',
          line: 25,
          content: 'MySQL 写入无重试',
          severity: 'major',
          category: 'reliability',
        },
        {
          defectId: 'd3',
          line: 40,
          content: '缺少日志',
          severity: 'minor',
          category: 'observability',
        },
      ],
      decoys: [{ line: 8, content: 'const key = lockKey;' }],
      codeForReview: '// line 12\nredis.decr("stock:" + skuId);\n// line 25\nawait mysql.insert(order);',
      failureScenario: {
        successCode:
          'redis.decr(key);\nif (result < 0) { await redis.incr(key); throw new Error("oversold"); }\nawait mysql.insert(order);',
        failedCode: 'redis.decr(key);\nawait mysql.insert(order);',
        diffPoints: [
          { line: 2, description: 'missing oversold check' },
          { line: 3, description: 'no rollback on mysql failure' },
        ],
        rootCause: '超卖 + 库存漂移,根因原子缺失 + 补偿缺失。',
      },
    }),
    getMBData: vi.fn().mockResolvedValue({
      featureRequirement: {
        description:
          '为 InventoryRepository 增加 decrement(skuId, quantity) 方法,必须保证幂等性和线程安全,失败时回滚。',
        acceptanceCriteria: [
          'decrement 原子操作',
          '超卖返回错误不扣减',
          '幂等 — 相同 requestId 重复调用只扣一次',
          '失败日志包含 skuId + quantity',
          '事务边界清晰',
        ],
      },
      scaffold: {
        files: [
          {
            path: 'src/inventory/InventoryRepository.ts',
            content:
              'export class InventoryRepository { async decrement(skuId, qty) { /* TODO */ } }',
            knownIssueLines: [3, 4],
          },
        ],
        tests: [
          {
            path: 'tests/inventory.test.ts',
            content: 'describe("InventoryRepository", () => { it.skip("atomic decrement") });',
            purpose: 'atomic decrement test',
          },
        ],
        dependencyOrder: [
          'src/inventory/InventoryRepository.ts',
          'src/inventory/InventoryService.ts',
          'src/inventory/InventoryController.ts',
          'tests/inventory.test.ts',
        ],
      },
      harnessReference: {
        keyConstraints: ['atomic', 'idempotent', 'rollback_on_failure'],
        constraintCategories: ['correctness', 'reliability', 'observability'],
      },
      violationExamples: [
        {
          exampleIndex: 0,
          code: 'redis.decr(key); // no bound check',
          isViolation: true,
          violationType: 'correctness',
          explanation: '边界检查缺失 — validate 约束违反',
        },
        {
          exampleIndex: 1,
          code: 'redis.decr(key); logger.info("decremented");',
          isViolation: false,
          explanation: '正确实现',
        },
        {
          exampleIndex: 2,
          code: '// skipped retry on DB error',
          isViolation: true,
          violationType: 'error_handling',
          explanation: 'error + retry 缺失',
        },
      ],
    }),
    getMDData: vi.fn().mockResolvedValue({
      requirement:
        '设计一个秒杀系统的全链路架构,涵盖 gateway / inventory / fulfillment / notification / 对账。',
      constraints: ['high_throughput', 'idempotent', 'observable', 'eventual_consistency'],
      constraintCategories: [
        'high_throughput',
        'idempotent',
        'observable',
        'eventual_consistency',
        'fault_tolerant',
      ],
    }),
    getSEData: vi.fn().mockResolvedValue({
      decisionSummaryTemplate:
        '回顾你在 P0 / MA / MB / MD / MC 各阶段的关键决策,给自己打分并说明理由。',
    }),
    getMCData: vi.fn().mockResolvedValue({
      probeStrategies: {
        baseline: '描述 R1 方案核心思路',
        contradiction: '挑战候选人决策,问边界',
        weakness: '追问弱点、风险',
        escalation: '放大 10x 场景',
        transfer: '迁移邻近业务',
      },
    }),
  };
  return stub as unknown as ExamDataService;
}

// ────────────────────── prisma mock plumbing ──────────────────────

type MockedSessionState = {
  id: string;
  metadata: Record<string, unknown>;
  scoringResult: V5ScoringResult | null;
};

function buildPrisma(state: MockedSessionState): PrismaClient {
  const findUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    if (where.id !== state.id) return null;
    return { id: state.id, metadata: state.metadata, scoringResult: state.scoringResult };
  });
  const update = vi.fn(
    async ({ where, data }: { where: { id: string }; data: { scoringResult: V5ScoringResult } }) => {
      if (where.id === state.id && data.scoringResult) {
        state.scoringResult = data.scoringResult;
      }
      return state;
    },
  );
  return {
    session: { findUnique, update },
  } as unknown as PrismaClient;
}

// ────────────────────── lifecycle hooks ──────────────────────

beforeEach(() => {
  __resetDefaultRegistryForTests();
});

afterEach(() => {
  __resetDefaultRegistryForTests();
  vi.clearAllMocks();
});

// ────────────────────── Block 1 — full coverage ──────────────────────

describe('Cold Start Validation · Block 1 — full-coverage scenario', () => {
  it('hydrates all 6 namespaces, computes ≥46 non-null signals, populates 6 dimensions, yields a grade, and persists scoringResult', async () => {
    const state: MockedSessionState = {
      id: SESSION_ID,
      metadata: buildFullMetadata(),
      scoringResult: null,
    };
    const prisma = buildPrisma(state);
    const service = new ScoringHydratorService(prisma, buildExamDataStub());

    const out = await service.hydrateAndScore(SESSION_ID);

    // Hydration report: all 6 namespaces present.
    expect(out.hydrationReport.phase0).toBe('present');
    expect(out.hydrationReport.moduleA).toBe('present');
    expect(out.hydrationReport.mb).toBe('present');
    expect(out.hydrationReport.moduleD).toBe('present');
    expect(out.hydrationReport.selfAssess).toBe('present');
    expect(out.hydrationReport.moduleC).toBe('present');
    expect(out.hydrationReport.examData.P0).toBe('present');
    expect(out.hydrationReport.examData.MA).toBe('present');
    expect(out.hydrationReport.examData.MB).toBe('present');
    expect(out.hydrationReport.examData.MD).toBe('present');
    expect(out.hydrationReport.examData.SE).toBe('present');
    expect(out.hydrationReport.examData.MC).toBe('present');

    // 47 signals registered; threshold ≥46 non-null per brief §2 (">= 46"
    // rather than "== 46/47" to survive tiny fixture fragility).
    const signalEntries = Object.entries(out.scoringResult.signals);
    expect(signalEntries.length).toBe(47);
    const nonNullCount = signalEntries.filter(([, r]) => r && r.value != null).length;
    expect(nonNullCount).toBeGreaterThanOrEqual(46);

    // 6 dimensions all numeric + in 0-100.
    for (const dim of V5_DIMENSIONS) {
      const score = out.scoringResult.dimensions[dim];
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }

    // Grade is one of the canonical values.
    expect(['S+', 'S', 'A', 'B+', 'B', 'C', 'D']).toContain(out.scoringResult.grade);

    // Composite is finite and in 0-100.
    expect(Number.isFinite(out.scoringResult.composite)).toBe(true);
    expect(out.scoringResult.composite).toBeGreaterThanOrEqual(0);
    expect(out.scoringResult.composite).toBeLessThanOrEqual(100);

    // Persisted: the mocked prisma.update wrote scoringResult back.
    expect(state.scoringResult).not.toBeNull();
    expect(state.scoringResult).toEqual(out.scoringResult);
  }, 30_000);
});

// ────────────────────── Block 2 — degradation ──────────────────────

describe('Cold Start Validation · Block 2 — graceful degradation', () => {
  it('does NOT throw when selfAssess is missing; sMetaCognition null-outs; remaining signals still compute', async () => {
    const meta = buildFullMetadata();
    delete (meta as Record<string, unknown>).selfAssess;
    const state: MockedSessionState = { id: SESSION_ID, metadata: meta, scoringResult: null };
    const service = new ScoringHydratorService(buildPrisma(state), buildExamDataStub());

    const out = await service.hydrateAndScore(SESSION_ID);

    expect(out.hydrationReport.selfAssess).toBe('absent');

    // sMetaCognition is the sole SE signal; must null when selfAssess absent.
    expect(out.scoringResult.signals.sMetaCognition?.value ?? null).toBeNull();

    // Remaining ≥42 signals (47 total − 5 P0/MC/MD outliers worst case) still non-null.
    const nonNullCount = Object.values(out.scoringResult.signals).filter(
      (r) => r && r.value != null,
    ).length;
    expect(nonNullCount).toBeGreaterThanOrEqual(42);

    // Grade still computed (pipeline did not crash).
    expect(['S+', 'S', 'A', 'B+', 'B', 'C', 'D']).toContain(out.scoringResult.grade);
  }, 30_000);

  it('tolerates a malformed moduleD payload without throwing (Block 2 — malformed-metadata subcase)', async () => {
    const meta = buildFullMetadata();
    // Narrowing guard: moduleD expected object-shaped; passing a string triggers malformed.
    (meta as Record<string, unknown>).moduleD = 'not-an-object';
    const state: MockedSessionState = { id: SESSION_ID, metadata: meta, scoringResult: null };
    const service = new ScoringHydratorService(buildPrisma(state), buildExamDataStub());

    const out = await service.hydrateAndScore(SESSION_ID);

    expect(out.hydrationReport.moduleD).toBe('malformed');

    // 4 MD signals null-out; the grade pipeline should still produce a grade.
    expect(out.scoringResult.signals.sConstraintIdentification?.value ?? null).toBeNull();
    expect(['S+', 'S', 'A', 'B+', 'B', 'C', 'D']).toContain(out.scoringResult.grade);
  }, 30_000);
});

// ────────────────────── Block 3 — idempotency ──────────────────────

describe('Cold Start Validation · Block 3 — idempotency', () => {
  it('yields deep-equal scoringResult on repeat hydrateAndScore calls against the same session', async () => {
    const state: MockedSessionState = {
      id: SESSION_ID,
      metadata: buildFullMetadata(),
      scoringResult: null,
    };
    const service = new ScoringHydratorService(buildPrisma(state), buildExamDataStub());

    const first = await service.hydrateAndScore(SESSION_ID);
    const second = await service.hydrateAndScore(SESSION_ID);

    // Signals / dimensions / grade / composite all deep-equal.
    expect(second.scoringResult.grade).toBe(first.scoringResult.grade);
    expect(second.scoringResult.composite).toBe(first.scoringResult.composite);
    expect(second.scoringResult.dimensions).toEqual(first.scoringResult.dimensions);

    // `computedAt` on each signal is a per-call timestamp; ignore it when
    // comparing values by projecting to {value, algorithmVersion}.
    const projectSignals = (r: V5ScoringResult) =>
      Object.fromEntries(
        Object.entries(r.signals).map(([id, sig]) => [
          id,
          { value: sig.value, algorithmVersion: sig.algorithmVersion },
        ]),
      );
    expect(projectSignals(second.scoringResult)).toEqual(projectSignals(first.scoringResult));
  }, 30_000);
});
