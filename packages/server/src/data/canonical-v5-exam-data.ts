/**
 * V5 Canonical ExamInstance + 6 ExamModule data.
 *
 * Typed constants consumed by `prisma/seed-canonical-v5-exam.ts`.
 * Keeping data separate from the seed runner enables:
 * - TypeScript typecheck (server tsconfig include 'src')
 * - Vitest coverage (src/**\/*.test.ts)
 * - V5.1 Generator future · examInstance fixtures can migrate here
 *
 * Fixture-aligned business: 秒杀库存扣减系统 · TypeScript + Express ·
 * MySQL + Redis. Reverse-matched from Task 17 Golden Path fixtures
 * (A14a 180 reliability tests validated). 5 module specifics
 * (P0/MA/MB/MC/SE) copy-inline the fixture exam-data shape; MD is
 * crafted fresh against MDModuleSpecific, aligned with fixture MC R3
 * 100k QPS escalation context.
 *
 * Ref: V5 Release Plan 2026-04-22 · OQ-R4 α · Brief #4 · Gap 5 unblock
 */

import type {
  BusinessScenario,
  MAModuleSpecific,
  MBModuleSpecific,
  MCModuleSpecific,
  MDModuleSpecific,
  P0ModuleSpecific,
  SEModuleSpecific,
} from '@codelens-v5/shared';

export const CANONICAL_EXAM_ID = 'e0000000-0000-0000-0000-000000000001';
const CANONICAL_SEED = 20260424;

export const canonicalBusinessScenario: BusinessScenario = {
  systemName: '秒杀库存扣减系统',
  businessContext:
    'ShopEasy 旗下的秒杀业务系统 · 支持热门商品限时抢购 · 峰值 10000 QPS · 偶发 20000 QPS · 业务目标防超卖 + P99 延迟 < 15ms。\n\n' +
    '核心流程基于 Redis + MySQL 双层一致性设计 · Redis 作热数据 + Lua 原子扣减 · MySQL 作最终真实性 · 两者通过同步事务 + 异步对账 job 达成 eventual consistency。\n\n' +
    '业务核心挑战 · 双写一致性(Redis 成功但 MySQL 失败如何回滚)· 幂等性(网络重试导致同 requestId 多次扣减防御)· 对账窗口(5 分钟内 diff 修复 · 异常 Slack alert)· 限流降级(突发流量保护上游数据库)· 反作弊(机器人批量下单检测)。\n\n' +
    '实体模型 · SKU(商品主数据)· Inventory(库存快照)· Order(订单)· OrderItem(订单行)· RequestLog(幂等防御日志)· LockRecord(Redis 分布式锁元数据)· 构成秒杀业务骨架。',
  coreEntities: [
    {
      name: 'SKU',
      attributes: ['skuId', 'name', 'price', 'category', 'status'],
      relationships: ['Inventory(1:1)', 'OrderItem(1:N)'],
    },
    {
      name: 'Inventory',
      attributes: ['skuId', 'available', 'reserved', 'version'],
      relationships: ['SKU(1:1)'],
    },
    {
      name: 'Order',
      attributes: ['orderId', 'buyerId', 'status', 'totalAmount', 'createdAt'],
      relationships: ['OrderItem(1:N)', 'Buyer(N:1)'],
    },
    {
      name: 'RequestLog',
      attributes: ['requestId', 'userId', 'action', 'createdAt', 'result'],
      relationships: [],
    },
  ],
  techStackDetail: {
    language: 'TypeScript',
    framework: 'Express',
    database: 'MySQL 8',
    cache: 'Redis 7',
  },
  businessFlow: [
    '订单创建 · 接收前端下单请求 · 校验 SKU 存在性 · 生成 orderId + requestId',
    'Redis 库存检查 · Lua 脚本原子读 available + decrement · 不足抛 OversoldError',
    'MySQL 双写 · 同事务 insert order + decrement inventory.available · 失败回滚 Redis',
    '异步对账 job · 5 分钟窗口 · Redis vs MySQL diff 修复 · Slack alert 异常',
    'RequestLog 幂等防御 · 同 requestId 重复请求直接返回先前结果 · 不重复扣库存',
  ],
  userRoles: [
    '买家(下单秒杀商品 · 查询订单状态)',
    '运营(配置 SKU 库存总量 · 监控秒杀活动 · 分析漏单报警)',
    '系统(定时对账 job · 监控 P99 / error rate · Slack alert)',
  ],
};

export const canonicalExamInstanceFields = {
  id: CANONICAL_EXAM_ID,
  seed: CANONICAL_SEED,
  businessScenario: canonicalBusinessScenario,
  techStack: 'typescript',
  domain: 'ecommerce-flash-sale',
  challengePattern: 'data_consistency',
  archStyle: 'service-layer',
  level: 'senior',
  orgId: null,
} as const;

// ────────────────────────── Module specifics ──────────────────────────
// 5 modules (P0/MA/MB/MC/SE) copy-inline from fixture exam-data structure
// (SQ-1 β isolation: NOT importing the fixture, drift caught by C2 cross-ref).
// MD is crafted fresh against MDModuleSpecific shape, aligned with fixture
// MC R3 escalation business context (100k QPS scale-up).

export const canonicalP0ModuleSpecific: P0ModuleSpecific = {
  systemCode: [
    'const lockKey = `sku:${skuId}`;',
    'redis.set(lockKey, uuid, "NX", "EX", 30);',
    'try {',
    '  await process();',
    '} finally {',
    '  const current = await redis.get(lockKey);',
    '  if (current === uuid) await redis.del(lockKey);',
    '}',
  ].join('\n'),
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
      codeB:
        'function x() { const v = await cache.get(k); if (!v) v = await db.query(); return v; }',
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

export const canonicalMAModuleSpecific: MAModuleSpecific = {
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
    {
      defectId: 'd1',
      line: 4,
      content: 'SET NX 缺 EX 参数 — 进程崩溃后锁永久驻留',
      severity: 'critical',
      category: 'concurrency',
    },
    {
      defectId: 'd2',
      line: 9,
      content: 'GET 和 DECRBY 分两步非原子,并发下 check-then-act 间窗漏 → 超卖',
      severity: 'critical',
      category: 'concurrency',
    },
    {
      defectId: 'd3',
      line: 21,
      content: 'redis.del 未比对 owner,可能误删其他进程持有的锁',
      severity: 'major',
      category: 'concurrency',
    },
  ],
  decoys: [
    { line: 17, content: 'console.log 调试语句 (nit 级,非关键问题)' },
    { line: 15, content: 'db.orderLog.create 没写注释 (nit 级,无实质 bug)' },
  ],
  codeForReview: [
    'async function reserveInventory(sku: string, qty: number, userId: string) {',
    '  const lockKey = `lock:${sku}`;',
    '  // 1. 获取分布式锁',
    "  const locked = await redis.set(lockKey, userId, 'NX');",
    "  if (!locked) return { ok: false, reason: 'LOCKED' };",
    '',
    '  try {',
    '    // 2. 读取当前库存',
    '    const stock = parseInt(await redis.get(`stock:${sku}`)) || 0;',
    '    if (stock < qty) {',
    "      return { ok: false, reason: 'OUT_OF_STOCK' };",
    '    }',
    '',
    '    // 3. 扣减库存 + 记录预占',
    '    await redis.decrby(`stock:${sku}`, qty);',
    "    await db.orderLog.create({ userId, sku, qty, status: 'RESERVED' });",
    '',
    "    console.log('reserved', userId, sku, qty);",
    '    return { ok: true };',
    '  } finally {',
    '    await redis.del(lockKey);',
    '  }',
    '}',
  ].join('\n'),
  failureScenario: {
    successCode: [
      'redis.decr(key);',
      'if (result < 0) { await redis.incr(key); throw new Error("oversold"); }',
      'await mysql.insert(order);',
    ].join('\n'),
    failedCode: ['redis.decr(key);', 'await mysql.insert(order);'].join('\n'),
    diffPoints: [
      { line: 2, description: 'missing oversold check after decr' },
      { line: 3, description: 'no rollback on mysql failure' },
    ],
    rootCause:
      '失败版本缺少 Redis decr 返回值检查,高并发下会超卖;同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误。',
  },
  migrationScenario: {
    newBusinessContext:
      '双 11 抢红包场景 — 活动整点开放 2 分钟,预生成红包池共 50,000 个(金额随机 1-50 元),预估 500,000 用户同时点击"抢"。要求每个红包只能被一个用户领到,抢成功必须在 2 秒内返回金额。',
    relatedDimension: '高并发下的互斥分配与原子扣减',
    differingDimension:
      '规模差 25× · 延迟预算更松 · 容错要求更宽(单个红包丢失可补发,订单库存不可错)',
    promptText:
      '在这个"抢红包"的新场景下,你在 R1 为"秒杀下单"选的方案还成立吗?请说明底层原则、需要调整的参数或实现细节。',
  },
};

export const canonicalMBModuleSpecific: MBModuleSpecific = {
  featureRequirement: {
    description:
      '为库存系统的 InventoryRepository 增加 decrement(skuId, quantity) 方法,必须保证幂等性和线程安全,失败时回滚。',
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
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    // TODO: implement atomic decrement',
          '    return;',
          '  }',
          '}',
        ].join('\n'),
        knownIssueLines: [3, 4],
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'import { InventoryRepository } from "./InventoryRepository";',
          'export class InventoryService {',
          '  constructor(private repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number) {',
          '    await this.repo.decrement(skuId, qty);',
          '  }',
          '}',
        ].join('\n'),
        knownIssueLines: [5],
      },
      {
        path: 'src/inventory/InventoryController.ts',
        content: 'export class InventoryController {}',
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
      explanation: 'decrement 没有边界检查,可能导致超卖 bug — 错误处理缺失,违反 validate 约束',
    },
    {
      exampleIndex: 1,
      code: 'redis.decr(key); logger.info("decremented");',
      isViolation: false,
      explanation: '正确实现,带日志记录 + 错误处理',
    },
    {
      exampleIndex: 2,
      code: '// skipped retry on DB error',
      isViolation: true,
      violationType: 'error_handling',
      explanation: '数据库错误处理缺失,应当重试或抛出 error — error handling + retry + timeout',
    },
  ],
};

export const canonicalMCModuleSpecific: MCModuleSpecific = {
  probeStrategies: {
    baseline: '描述 R1 选的方案的核心思路',
    contradiction: '挑战候选人某个决策,询问边界场景',
    weakness: '追问弱点、风险',
    escalation: '把场景放大 10x,问会怎样',
    transfer: '迁移到一个邻近但不同的业务',
  },
};

// MD crafted fresh · aligned with fixture MC R3 escalation context
// (100k QPS scale-up · Redis sharding · proxy · cross-shard tx).
export const canonicalMDModuleSpecific: MDModuleSpecific = {
  designTask: {
    description:
      '设计一个支持 100k QPS 峰值的秒杀库存扣减系统。基于 P0/MA/MB 已建立的秒杀业务理解,扩展到分布式 scale,要求防超卖、幂等、故障可恢复。',
    businessContext:
      '业务延续秒杀库存扣减系统 · 当前单机 Redis + MySQL 设计在 10k QPS 已 stress 极限 · 流量 10x 增长到 100k QPS · 必须重新设计架构 · 兼顾延迟 / 一致性 / 成本 / 可观测性。挑战核心 · 单点 Redis 上限 5w QPS · MySQL 悲观锁失效 · 跨分片事务复杂 · 热点 SKU skew 流量集中。',
    nonFunctionalRequirements: [
      'P99 延迟 < 50ms',
      '单点 Redis 5w QPS 上限 · 需 sharding 或 multi-tier cache',
      'MySQL 悲观锁 500 QPS 不够 · 需异步落库 + 对账 path',
      '跨 shard 事务 · 需 Saga 或 TCC 机制',
      '热点 SKU(Top 10 占 80% 流量)需 local cache + Redis proxy 防穿透',
      '故障恢复 RTO < 10s · sentinel + AOF 多副本',
      '可观测性 · 各 shard QPS / 错误率 / 锁等待时间均有 Grafana dashboard',
    ],
  },
  expectedSubModules: [
    {
      name: 'API Gateway',
      responsibility: '接收请求 · 限流 · routing 到对应 shard 的 service',
    },
    {
      name: 'Inventory Service Shard',
      responsibility:
        '按 skuId hash sharding · 每 shard 独立 Redis cluster + MySQL slice · 处理库存扣减',
    },
    {
      name: 'Hot SKU Cache Layer',
      responsibility: 'Top SKU local in-memory + Redis proxy · 防穿透集中式 Redis',
    },
    {
      name: 'Async Settlement Worker',
      responsibility: 'Kafka consumer · 5 分钟窗口异步落库 + 对账 job · diff 修复',
    },
    {
      name: 'Idempotency Layer',
      responsibility: 'RequestLog 跨 shard · requestId 全局唯一 · 防重试漏单',
    },
    {
      name: 'Distributed Lock Service',
      responsibility: 'Redlock 算法 · 跨 shard 协调高争用 SKU 的 lock',
    },
  ],
  constraintCategories: [
    'consistency · cross-shard 事务 + 对账',
    'availability · sentinel + 多副本 + RTO',
    'performance · P99 < 50ms + sharding 平衡',
    'observability · per-shard metrics + Grafana',
    'cost · Redis cluster + MySQL slice 容量规划',
    'security · 反作弊 + 限流防御',
    'maintainability · shard 扩缩容 ops 流程',
  ],
  designChallenges: [
    {
      trigger: '候选人提到 sharding 但未说 SKU 倾斜',
      challenge:
        '热门 SKU(如演唱会票)单 SKU 就 50k QPS · 你 sharding key 怎么选 · 单 shard 又被打爆怎么办?',
    },
    {
      trigger: '候选人提到 Kafka 异步落库但未说幂等',
      challenge:
        'Kafka 消息可能 at-least-once 投递 · consumer 重复消费同 requestId 怎么防漏单 / 重扣?',
    },
    {
      trigger: '候选人方案稳定后',
      challenge: '突发 1M QPS 抢限量商品 · 整体架构降级路径 · 用户体验保下限的策略是什么?',
    },
  ],
};

export const canonicalSEModuleSpecific: SEModuleSpecific = {
  decisionSummaryTemplate:
    '回顾你在 P0 阅读 → MA 方案选择 → MB 实现 三个阶段的关键决策,给自己打分并说明理由。',
};

export const canonicalModulesByType = {
  P0: canonicalP0ModuleSpecific,
  MA: canonicalMAModuleSpecific,
  MB: canonicalMBModuleSpecific,
  MC: canonicalMCModuleSpecific,
  MD: canonicalMDModuleSpecific,
  SE: canonicalSEModuleSpecific,
} as const;

export type CanonicalModuleType = keyof typeof canonicalModulesByType;
