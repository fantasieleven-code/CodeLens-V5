/**
 * Task 17 — Golden Path fixture: Liam (target grade: S).
 *
 * Substantive, evidence-cited answers across P0/MA/MB/MC/SE. Mirrors the
 * Liam archetype in the module signal test suites (v5-design-clarifications.md
 * Part 5 L779-790): every signal should rank strongest vs. Steve / Emma / Max.
 */

import type { ScoreSessionInput, V5Submissions } from '@codelens-v5/shared';
import {
  GOLDEN_PATH_EXAM_DATA,
  GOLDEN_PATH_PARTICIPATING_MODULES,
  GOLDEN_PATH_SESSION_START as T0,
} from './exam-data.js';

const submissions: V5Submissions = {
  phase0: {
    codeReading: {
      l1Answer: 'Redis 互斥锁防止同 SKU 并发下单',
      l2Answer:
        '关键决策是用 Redis SET NX 作为互斥锁,避免同一用户对同一 SKU 的并发下单。锁的 TTL 30s 既足够完成事务又能在崩溃时自动释放,cost 是锁住的 SKU 在其他流程看不到。',
      l3Answer:
        'QPS 涨到 10k 时,首要瓶颈是 Redis 单机 set/del 的 P99 延迟 —— 现在 function 里每单至少 2 次 round-trip。其次,finally 里的 GET + DEL 不是原子的,多实例下存在误删别人锁的风险,应换成 Lua 脚本比较并删;第三,cryptoRandom 在分布式下熵不够,应改用 UUID v4。',
      confidence: 0.82,
    },
    aiOutputJudgment: [
      {
        choice: 'A',
        reasoning:
          'A 版显式做了 Redis 互斥锁 + 事务提交,B 版裸写数据库不保证幂等,并发下订单会重复。',
      },
      {
        choice: 'B',
        reasoning:
          'B 版用 cache-aside 模式,缓存不命中回源数据库,A 版直接拿 cache 会返回 null。',
      },
    ],
    aiClaimVerification: {
      response:
        'AI 说用了 WATCH/MULTI 实现乐观锁,但代码里我没看到 MULTI 和 EXEC,只有一个 SET NX 互斥锁(line 2)。actualFeatures 里的 NX+TTL 是悲观锁写法,不是乐观锁。',
      submittedAt: T0 + 60_000,
    },
    decision: {
      choice: 'C',
      reasoning:
        '我会先启动限流止血,30 秒内把失败订单率压回 5% 以下,然后基于日志排查 root cause,因为 rollback 会丢掉已经成功的 70% 订单。',
    },
  },
  moduleA: {
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
          commentType: 'bug',
          comment: 'redis.decr 返回值未检查,高并发会超卖 — critical',
          fixSuggestion: '检查 result < 0 时回滚 incr',
        },
        {
          defectId: 'd2',
          commentType: 'bug',
          comment: 'MySQL insert 无重试,一次失败永久丢单 — 需要 retry + DLQ',
          fixSuggestion: '加 retry 3 次 + 死信队列',
        },
        {
          defectId: 'd3',
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
      submittedAt: T0 + 180_000,
      timeSpentSec: 180,
    },
  },
  mb: {
    planning: {
      decomposition: [
        '1. 阅读 InventoryRepository 当前 decrement 实现',
        '2. 在 InventoryRepository.decrement 中实现 Redis SETNX + Lua 脚本',
        '3. 更新 InventoryService.reduce 传递 requestId 做幂等',
        '4. 在 InventoryController 添加 validation',
        '5. 跑 tests/inventory.test.ts 验证',
      ].join('\n'),
      dependencies: [
        'InventoryRepository.decrement 需要调用 redis client',
        'InventoryService 依赖 InventoryRepository',
        'Controller 依赖 InventoryService',
      ].join('\n'),
      fallbackStrategy: [
        '如果 Redis 宕机:fallback 到 MySQL SELECT FOR UPDATE,但 QPS 下降,需要降级通知;',
        '如果 Lua 脚本执行超时:retry 3 次,仍失败则 rollback 并抛出 InventoryUnavailableError 触发熔断;',
        '监控告警在 timeout 或 recovery 场景下触发。',
      ].join(''),
      skipped: false,
      submittedAt: T0 + 1_000,
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
            'InventoryRepository.decrement has a TOCTOU race when used without a lock — show me a SETNX-based implementation using Lua. 检查 suspicious edge case.',
          responseLength: 400,
          duration: 3_000,
        },
        {
          timestamp: T0 + 200_000,
          prompt:
            'Verify if InventoryService.reduce handles undefined qty as 0 — check the edge case so we do not silently skip. validation 缺失会导致 bug',
          responseLength: 200,
          duration: 2_000,
        },
        {
          timestamp: T0 + 230_000,
          prompt:
            'Confirm InventoryController validates skuId against 40-char limit before calling service.reduce — verify the boundary check when qty exceeds stock.',
          responseLength: 260,
          duration: 2_500,
        },
        {
          timestamp: T0 + 260_000,
          prompt:
            'Check for bug in retry path: if redis.eval times out after 500ms does OversoldError propagate correctly or is it swallowed? 验证 wrong path.',
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
        },
        {
          filePath: 'src/inventory/InventoryService.ts',
          startTime: T0 + 130_000,
          endTime: T0 + 180_000,
          keystrokeCount: 80,
        },
        {
          filePath: 'src/inventory/InventoryController.ts',
          startTime: T0 + 200_000,
          endTime: T0 + 250_000,
          keystrokeCount: 60,
        },
      ],
      testRuns: [
        { timestamp: T0 + 50_000, passRate: 0, duration: 2_000 },
        { timestamp: T0 + 280_000, passRate: 0.8, duration: 2_000 },
        { timestamp: T0 + 310_000, passRate: 1, duration: 2_000 },
      ],
      documentVisibilityEvents: [
        { timestamp: T0 + 40_000, hidden: false },
      ],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'import { RedisClient } from "./redis";',
          'export class InventoryRepository {',
          '  constructor(private readonly redis: RedisClient) {}',
          '  async decrement(skuId: string, quantity: number, requestId: string): Promise<void> {',
          '    const lua = `if redis.call("GET", KEYS[2]) == "1" then return 0 end; ' +
            'local stock = tonumber(redis.call("GET", KEYS[1])); ' +
            'if stock == nil or stock < tonumber(ARGV[1]) then return -1 end; ' +
            'redis.call("DECRBY", KEYS[1], ARGV[1]); redis.call("SET", KEYS[2], "1", "EX", 86400); return 1`;',
          '    const result = await this.redis.eval(lua, 2, `stock:${skuId}`, `idem:${requestId}`, quantity);',
          '    if (result === -1) throw new OversoldError(skuId, quantity);',
          '    if (result === 0) return; // idempotent replay',
          '    // success',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'import { InventoryRepository } from "./InventoryRepository";',
          'export class InventoryService {',
          '  constructor(private readonly repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number, requestId: string) {',
          '    if (qty == null || qty <= 0) throw new Error("invalid qty");',
          '    await this.repo.decrement(skuId, qty, requestId);',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    finalTestPassRate: 1,
    standards: {
      rulesContent: [
        '# Inventory coding rules',
        '1. All stock-mutating methods must accept a `requestId` and use it as an idempotency key.',
        '2. Redis operations that mutate stock MUST run inside a single Lua eval call to stay atomic.',
        '3. Never delete another process\'s lock — always compare-and-delete via Lua.',
        '4. Oversold checks must throw OversoldError; never silently return null.',
        '5. All inventory log lines must include skuId + quantity + requestId.',
      ].join('\n'),
      agentContent:
        '当 Agent 生成或修改 InventoryRepository 或 InventoryService 时,必须阅读 rules.md 的 5 条规则并在 PR 描述里勾选每一条。任何涉及 redis.decr / mysql.insert 的改动都要配套 tests/inventory.test.ts 更新。',
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule-oversold-check' },
        { exampleIndex: 1, markedAsViolation: false },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule-retry-required' },
      ],
    },
  },
  selfAssess: {
    confidence: 0.78,
    reasoning:
      'P0 的 L3 代码阅读我回答得比较稳(抓住了 Redis round-trip + GET/DEL 非原子 + 随机数熵 三个点);MA 的 R4 迁移题我偏保守,给了一个合理框架但没具体到红包业务的具体阈值。MB 的 Lua 脚本实现我压测只做了 1k QPS,真实峰值没覆盖,置信度扣 10%。MC 问到"如果 Redis 挂了怎么办"时我回答得不够清晰,需要改进。',
    reviewedDecisions: ['P0 L3 answer', 'MA R1 scheme A', 'MA R4 transfer', 'MB Lua impl'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer:
        'A 方案是 Redis 预扣 + MySQL 异步落库。Redis 用 SETNX + Lua 保证原子性和幂等,MySQL 做最终落库;核心是把 QPS 压力从 DB 移到 Redis,再用异步消息 + 对账兜底一致性。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉的时候怎么办?你方案 A 的可用性如何保证?',
      answer:
        '短期用 AOF + 每 5 秒快照把 RTO 压到 30s 以内;长期会用 Redis 主从 + sentinel 做自动切换。挂掉的窗口期通过降级到 MySQL 悲观锁 (QPS 500 可扛住 1 分钟内的缓冲) 来避免完全不可用,但会通过降级告警通知上游限流。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: '如果 QPS 涨到 100k,你的 A 方案还撑得住吗?',
      answer:
        '撑不住,Redis 单机瓶颈大约在 5w qps。100k QPS 的时候必须上 Redis 集群(cluster mode)+ sharding 按 skuId 分片,然后热门 SKU 还要做本地缓存 + 读写分离。本质上需要从单点架构升到分布式架构,tradeoff 是运维复杂度和成本上升。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '如果换成红包抢购场景,你还会选 A 吗?',
      answer:
        '还会选 A,核心原则"Redis 扣减 + 异步落库"不变。但具体实现要调:红包金额不能超发,所以 Lua 脚本里要做精度控制(bignum);幂等键从 requestId 改成 userId+redpackId;TTL 从 30s 改到 24h 等整个红包生命周期;对账窗口从 5 分钟改到实时。',
      probeStrategy: 'transfer',
    },
  ],
};

export const liamSGradeFixture: ScoreSessionInput = {
  sessionId: 'gp-liam-s',
  suiteId: 'full_stack',
  submissions,
  examData: GOLDEN_PATH_EXAM_DATA,
  participatingModules: GOLDEN_PATH_PARTICIPATING_MODULES,
};
