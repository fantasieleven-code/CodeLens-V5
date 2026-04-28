/**
 * Task 17 — Golden Path shared exam data.
 *
 * Single ExamData bundle used by all 4 Golden Path archetypes so their
 * submissions can be compared apples-to-apples. Scenarios mirror the
 * module-level signal test fixtures (inventory /秒杀扣减), compressed to
 * only what `scoreSession` actually dereferences.
 */

import type {
  MAModuleSpecific,
  MBModuleSpecific,
  MCModuleSpecific,
  P0ModuleSpecific,
  SEModuleSpecific,
  V5ModuleType,
} from '@codelens-v5/shared';

export const GOLDEN_PATH_SESSION_START = 1_700_000_000_000;

const P0: P0ModuleSpecific = {
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
      options: [
        'Redis 互斥锁防止同 SKU 并发下单',
        '记录日志',
        '发送邮件',
        '计算价格',
      ],
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
    aiExplanation:
      '这段代码使用了 Redis WATCH/MULTI 实现乐观锁,SET 设置 TTL 为 30s',
    claimedFeatures: ['WATCH', 'MULTI', 'SET NX', 'TTL'],
    actualFeatures: ['SET', 'NX', 'TTL', 'EX'],
    deceptivePoint: {
      claimedFeature: 'MULTI',
      realityGap: '代码里只有 SET NX,没有 MULTI/EXEC',
    },
  },
};

const MA: MAModuleSpecific = {
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
  decoys: [
    { line: 8, content: 'const key = lockKey; // 看起来像 bug 但不是' },
    { line: 33, content: 'return null; // 故意误导' },
  ],
  codeForReview: [
    '// line 12',
    'redis.decr("stock:" + skuId);',
    '// line 25',
    'await mysql.insert(order);',
    '// line 40',
    '// ...',
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
};

const MB: MBModuleSpecific = {
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
      explanation:
        'decrement 没有边界检查,可能导致超卖 bug — 错误处理缺失,违反 validate 约束',
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
      explanation:
        '数据库错误处理缺失,应当重试或抛出 error — error handling + retry + timeout',
    },
  ],
};

const MC: MCModuleSpecific = {
  probeStrategies: {
    baseline: '描述 R1 选的方案的核心思路',
    contradiction: '挑战候选人某个决策,询问边界场景',
    weakness: '追问弱点、风险',
    escalation: '把场景放大 10x,问会怎样',
    transfer: '迁移到一个邻近但不同的业务',
  },
};

const SE: SEModuleSpecific = {
  decisionSummaryTemplate:
    '回顾你在 P0 阅读 → MA 方案选择 → MB 实现 三个阶段的关键决策,给自己打分并说明理由。',
};

export const GOLDEN_PATH_EXAM_DATA: Partial<Record<V5ModuleType, Record<string, unknown>>> = {
  P0: P0 as unknown as Record<string, unknown>,
  MA: MA as unknown as Record<string, unknown>,
  MB: MB as unknown as Record<string, unknown>,
  MC: MC as unknown as Record<string, unknown>,
  SE: SE as unknown as Record<string, unknown>,
};

export const GOLDEN_PATH_PARTICIPATING_MODULES = [
  'phase0',
  'moduleA',
  'mb',
  'selfAssess',
  'moduleC',
] as const;
