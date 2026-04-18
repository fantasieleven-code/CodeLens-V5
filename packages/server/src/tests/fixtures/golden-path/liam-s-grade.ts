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
      reasoning: [
        '我选方案 A(Redis 预扣 + MySQL 异步落库)。回到题面,需求是「设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值。需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计」。',
        '我从 性能 / 一致性 / 可用性 三个维度拆:',
        '(1) 性能与吞吐 — 瞬时 QPS 20k 对 10000 QPS 基线留 2x 余量。MySQL 单机悲观锁只能撑 500 QPS,量级不匹配,瓶颈在行锁等待和 B+ 树回表。Redis 原子 decr 的 P99 延迟 10ms、单实例 80k QPS 是正解。',
        '(2) 一致性与幂等 — 异步落库的一致性弱是局限,不过 requestId 幂等键 + 5 分钟对账任务能把双写不一致率压到 10 ppm 以下,代价可控。',
        '(3) 可用性与风险 — 首要风险是 Redis 崩溃丢数据,对账复杂,所以用 AOF(fsync=everysec) + sentinel 主从热备,RTO < 5s,窗口期降级到 MySQL 兜底。',
        '但是 A 的 tradeoff 在业务语境下最小 — 悲观锁 500 QPS 是 hard block,MQ 异步延迟秒级体验差。综合权衡选 A。',
      ].join('\n'),
      structuredForm: {
        scenario:
          '设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值,需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。瞬时峰值预估 20k QPS,对账窗口 5 分钟。',
        tradeoff: [
          'A 方案(Redis 预扣 + 异步落库):吞吐 QPS 20k、P99 10ms,代价是一致性弱 + Redis 崩溃丢数据 + 对账复杂;',
          '悲观锁方案:强一致但 QPS 500 扛不住 10000 QPS 峰值,是 hard block;',
          'MQ 异步方案:削峰解耦,但用户等待秒级,体验不可接受,消息顺序与补偿风险大。',
          '三选一:A 的局限可缓解,其余两个的瓶颈不可解,所以 A。',
        ].join('\n'),
        decision: '方案 A,因为 10000 QPS 是 hard 约束,一致性弱 + 对账复杂可通过幂等键 + 对账任务缓解',
        verification: [
          '三层验证:',
          '(1) 压测 — 对 Redis decr 打 20k QPS,目标 P99 < 15ms、错误率 < 0.1%;',
          '(2) 一致性 — 跑对账任务,5 分钟窗口内比较 Redis 与 MySQL 差异,目标不一致率 < 10 ppm;',
          '(3) 故障注入 — kill Redis 主节点,验证 sentinel RTO < 5s,期间降级到 MySQL 兜底,QPS 不穿透。',
        ].join('\n'),
      },
      challengeResponse: [
        '继续坚持 A。挑战有道理 — Redis 单点确实是最大风险,但是这个风险我量化一下再权衡:',
        '(1) 故障概率 — 生产级 Redis 主从 + AOF(fsync=everysec),年宕机 < 5 分钟,失效率 < 0.01%,不是常态。',
        '(2) 灾备能力 — sentinel 自动切换 RTO 5 秒、AOF 恢复 RPO < 1 秒。窗口期限流到 QPS 300 以内,MySQL 悲观锁兜底,避免锁等待雪崩。',
        '(3) 对照他方案 — 悲观锁在 10000 QPS 秒杀是 hard block,单机 500 QPS 直接崩;MQ 异步把用户等待拉到秒级,体验不可接受。二者代价都比 A 的局限大。',
        '核心指标:P99 < 20ms、RTO < 30s、一致性窗口 < 5 分钟。三个约束下 A 是唯一满足的方案。因为业务语境是 10000 QPS 秒杀而不是一般增删改查,所以 A 的 tradeoff 在这个 context 下合理。',
      ].join('\n'),
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
        '失败版本在 line 2 缺少 decr 返回值检查,line 3 的 mysql.insert 没有配合 Redis 回滚。成功版本多了 if (result < 0) incr + throw 的保护,并且在 mysql 写入外层加了 try/catch 触发 Redis 回补。',
      diagnosisText: [
        '失败版本缺少 Redis decr 返回值检查,高并发下会超卖 — 这是第一个根因:并发读写共享库存时,decr 返回 -1 的语义被忽略,扣减已经发生但业务没感知。',
        '同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误 — 这是第二个根因:双写一致性没有补偿机制,MySQL 端异常后 Redis 里的 stock 已经减掉,形成永久漂移。',
        '成功版本在 decr 之后立刻做 if result < 0 回滚 + throw,并在 MySQL 插入失败分支把 Redis 扣减 incr 回去,闭环两条路径。',
        '本质归纳:原子操作缺失 + 补偿路径缺失,这两条在高并发场景下直接变成超卖 + 库存漂移 — 秒杀类业务对这两个根因 0 容忍。',
      ].join('\n'),
    },
    round4: {
      response: [
        '核心原则不变 — 高并发场景下的 Redis 预扣 + 异步落库仍是正解,本质是"原子性保护 + 补偿机制 + 幂等键"三件套,和之前 R1 选 A 的思路一致。',
        '但具体参数需要调整:',
        '(1) 并发量 — 红包抢购的瞬时 QPS 比秒杀高 3x(因为社交裂变),所以需要更短的 TTL(30s → 10s)和更激进的限流;',
        '(2) 金额精度 — 考虑到红包金额不能超发,Lua 脚本里必须用 bignum 处理 1 分 = 100 金额单位,避免浮点误差,阈值也要变;',
        '(3) 幂等边界 — 由于红包一个用户只能抢一次,幂等键从 requestId 换成 userId + redpackId,实现不同的去重粒度;',
        '(4) 风险特性 — 红包多了社交属性,需要防刷 + 黑名单,底层逻辑是秒杀无此需求。',
        '迁移代价:核心架构 80% 复用(Redis 原子减 + 对账),另外 20% 是参数重调 + 防刷模块。2 周迭代能上线 MVP。',
      ].join('\n'),
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
    reasoning: [
      '整体自评 — P0 / MA / MB / MC 四段节奏可以,但是在几个关键点上留了可提升空间,按强弱分别说:',
      '(1) P0 L3 代码阅读答得比较稳 — 抓住了 Redis round-trip + GET/DEL 非原子 + 随机数熵不足三个点,和题设 10000 QPS 瓶颈的推导一致。但 aiOutputJudgment 第二题错答(选了 A 而 groundTruth 是 B),说明 cache-aside vs 直接读的语义我还需要多磨,置信度扣 5%。',
      '(2) MA 的 R1 选 A 并给了 QPS / 一致性 / 可用性 三维度 tradeoff,我觉得方向对。但是 R4 迁移到红包场景时偏保守 — 框架给了 TTL / 幂等键 / 社交风险三条,没具体到"万元雨"峰值阈值;如果面试官再追问 SKU 分片策略,我需要更硬的数据支撑。',
      '(3) MB 的 Lua 脚本实现我压测只做了 1k QPS,真实 20k 峰值没覆盖 — finalTestPassRate 能到 100% 但生产置信度还要再压 10%,这是我最担心的一块。',
      '(4) MC 问到"Redis 挂了怎么办"的窗口期风险时,R2 我承认 R1 没充分覆盖,改为 sentinel + AOF + 限流三重兜底,这个修正方向对。但 R3 的 100k QPS escalation 我只给了分片 + 本地缓存,漏了 proxy 层方案 — 这是我目前最大盲区。',
      '综合判断:整体在 S 档,但 headroom 不大,细节打磨仍有空间。下次类似面试我会在迁移题上准备更厚的业务侧阈值案例。',
    ].join('\n'),
    reviewedDecisions: ['P0 L3 answer', 'MA R1 scheme A', 'MA R4 transfer', 'MB Lua impl'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer:
        'A 方案的核心是 Redis 预扣 + MySQL 异步落库。我觉得这个选择取决于首要瓶颈 — 如果是瞬时 20k QPS 的秒杀,Redis 原子 decr 的 10ms P99 远优于 MySQL 500 QPS 的悲观锁,其实这个量级 MySQL 已经撑不住。幂等键用 requestId,对账兜底最终一致性。意识到这方案的弱点是 Redis 崩溃,之前没想到需要 AOF + sentinel 做热备,加了之后 RTO 能压到 30s。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉的时候怎么办?你方案 A 的可用性如何保证?',
      answer:
        '你说得对,我承认 R1 没充分覆盖 Redis 崩溃的窗口期风险 — 我错了,把 AOF 能力当成了一步到位的可用性兜底。更准确地说,应该改为 AOF 每秒持久化 + sentinel 主从热备,把 RTO 从 30s 压到 5s 内;同时窗口期降级到 MySQL 悲观锁的 QPS 500 作为兜底,并通过上游限流把峰值压到 QPS 300 以内。但是核心观点仍然成立 — A 方案在 10000 QPS 场景下依然是正解,只是可用性 SLA 的 tradeoff 需要更严格的运维配套。取决于业务对 30s 窗口 vs 5s 窗口的成本敏感度,如果是支付秒杀需要 5s,如果是活动秒杀 30s 可以接受。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: '如果 QPS 涨到 100k,你的 A 方案还撑得住吗?',
      answer:
        '撑不住。Redis 单机瓶颈约 5w QPS,100k 必须上集群 + sharding 按 skuId 分片。基于 R2 的修正思路,我会在集群层也做 AOF + sentinel 保证高可用。热门 SKU 要本地缓存 + 读写分离兜底,取决于 skew 程度 — 如果是 Top 10 SKU 占 80% 流量,还要额外上 Redis proxy(如 Codis)。这次的教训是单点瓶颈思维早该放弃,其实分布式架构才是 100k+ QPS 的基线,原本以为单机优化还有空间。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '如果换成红包抢购场景,你还会选 A 吗?',
      answer:
        '还会选 A,核心原则"Redis 扣减 + 异步落库"不变。沿着这个思路迁移到红包:精度控制上,Lua 脚本里要用 bignum 处理金额(1 分 = 100 分单位),避免浮点误差;幂等键从 requestId 换成 userId + redpackId,因为红包一个用户只能抢一次。TTL 从 30s 延长到 24h 覆盖整个红包生命周期。取决于活动规模,如果是万元级红包雨,要加入抢购冷却 — 更好的做法是做分桶削峰。意识到之前没想到红包有社交属性,需要做防刷 + 黑名单,这在秒杀里是弱需求。',
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
