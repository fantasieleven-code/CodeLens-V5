/**
 * ModuleA Task 5 mock fixture.
 *
 * Canonical shape:
 *   - `MAModuleSpecific` (packages/shared/src/types/v5-exam-modules.ts) —
 *     R1 schemes + counter-arguments + R2 codeForReview/defects/decoys +
 *     R3 failureScenario — consumed as-is.
 *   - `migrationScenario` — R4 prompt context. Lives locally on
 *     `MAMockModule` because `MAModuleSpecific.round4` is not in shared
 *     yet. Round 3 Part 3 调整 2 L375-393 promotes it in Task 10's
 *     generator; at that point we migrate into shared and delete
 *     `MAMockModule`.
 *
 * Scenario chosen to overlap with Phase 0 (order-service / concurrent
 * reservations) so candidates carry domain context across modules:
 *   - R1: 秒杀下单库存预扣 (Redis lock vs DB optimistic lock vs token bucket)
 *   - R2: 审查方案 A 的实现 (埋 3 个 defect + 2 个 decoy)
 *   - R3: success/failed 对照 (GET+DECR 非原子 → 超卖)
 *   - R4: 红包抢购削峰 (相关: 高并发互斥; 差异: 规模/延迟/容错)
 */

import type { MAModuleSpecific } from '@codelens-v5/shared';

/** Local extension of MAModuleSpecific: adds `migrationScenario` for R4. */
export interface MAMockModule extends MAModuleSpecific {
  migrationScenario: {
    newBusinessContext: string;
    relatedDimension: string;
    differingDimension: string;
    promptText: string;
  };
}

const R1_REQUIREMENT =
  '秒杀场景 — 某 3C 平台凌晨 0 点开抢爆款手机,每秒 20,000+ 请求打向同一 SKU。' +
  '要求: (1) 不超卖 (2) 下单接口 p99 < 300ms (3) Redis 单机故障时能降级而非雪崩。' +
  '当前库存 500 件,并发下单路径需要"预扣库存"后再异步创建订单。请选择最合适的预扣方案并展开论证。';

export const MA_MOCK_FIXTURE: MAMockModule = {
  requirement: R1_REQUIREMENT,
  schemes: [
    {
      id: 'A',
      name: 'Redis SET NX 分布式锁 + 同步扣减',
      description:
        '每个 SKU 维护一把 Redis 锁,请求先 SET NX 获取锁,再 GET 库存、DECRBY 扣减,finally 释放锁。',
      pros: [
        '实现直观,上手成本低',
        'Redis 内存操作延迟 <1ms,单 SKU 下 p99 可控',
        '锁天然串行化,不超卖',
      ],
      cons: [
        '热点 SKU 下锁竞争严重,排队延迟随 QPS 放大',
        'Redis 单点故障时锁全丢,需哨兵 + 降级',
      ],
      performance: '单 SKU 吞吐 ≈ 5000 req/s (单 Redis 实例) · p99 100-200ms',
      cost: '低 — Redis 现成,无 DB 改动',
    },
    {
      id: 'B',
      name: '数据库乐观锁 (版本号 CAS)',
      description:
        '库存表加 version 列,UPDATE stock SET qty=qty-1, version=version+1 WHERE sku=? AND version=?,CAS 失败则重试。',
      pros: [
        '强一致,依托 DB 事务',
        '无额外中间件,DB 故障即全局故障(故障域收敛)',
        '适合低冲突场景',
      ],
      cons: [
        '高冲突下 CAS 重试风暴,CPU 飙升',
        'DB 主库 QPS 天花板通常 5-10k,撑不住秒杀峰值',
      ],
      performance: 'DB 主库 ≈ 3-5k TPS · p99 200-400ms (含重试)',
      cost: '中 — 需加 version 列 + 重试逻辑',
    },
    {
      id: 'C',
      name: '令牌桶预分配 + 异步扣减',
      description:
        '活动开始前按库存数量预生成 500 个令牌放 Redis List,请求 LPOP 拿令牌即视为抢到,拿到令牌后异步落库扣减。',
      pros: [
        'LPOP 天然串行,0 锁竞争',
        '峰值吞吐随 Redis 实例数横向扩展',
        '令牌耗尽 = 明确抢完信号,接口即刻返回',
      ],
      cons: [
        '商品下架/退货需回收令牌,运维复杂度上升',
        '异步扣减失败的补偿链路需额外设计',
      ],
      performance: '单 Redis 实例 ≈ 20-30k LPOP/s · p99 <50ms',
      cost: '中 — 需预生成脚本 + 异步扣减 worker',
    },
  ],
  counterArguments: {
    A: [
      'Redis 主从切换时锁可能丢失,导致同一 SKU 被两个进程同时扣减 — 你准备怎么兜底?',
      '热点 SKU 下,锁持有时间 = GET + DECR + OrderLog + DEL ≈ 5-10ms,5000 req/s 时锁竞争让 p99 飙到 800ms+',
    ],
    B: [
      '20k 并发 CAS 失败率超 90%,重试风暴会把 DB 主库 CPU 打满',
      'DB 主库 QPS 上限远低于 20k,即使 CAS 成功也扛不住峰值',
    ],
    C: [
      '500 个令牌 2 秒内被抢完,之后 90%+ 请求是"空跑 LPOP + 立即返回抢完",这部分消耗的 Redis QPS 你怎么算?',
      '异步扣减失败 (比如 DB 瞬时抖动) 时,令牌已发出但库存未扣,需要对账回补 — 这个补偿你打算怎么做?',
    ],
  },
  codeForReview: [
    "async function reserveInventory(sku: string, qty: number, userId: string) {",
    "  const lockKey = `lock:${sku}`;",
    "  // 1. 获取分布式锁",
    "  const locked = await redis.set(lockKey, userId, 'NX');",
    "  if (!locked) return { ok: false, reason: 'LOCKED' };",
    "",
    "  try {",
    "    // 2. 读取当前库存",
    "    const stock = parseInt(await redis.get(`stock:${sku}`)) || 0;",
    "    if (stock < qty) {",
    "      return { ok: false, reason: 'OUT_OF_STOCK' };",
    "    }",
    "",
    "    // 3. 扣减库存 + 记录预占",
    "    await redis.decrby(`stock:${sku}`, qty);",
    "    await db.orderLog.create({ userId, sku, qty, status: 'RESERVED' });",
    "",
    "    console.log('reserved', userId, sku, qty);",
    "    return { ok: true };",
    "  } finally {",
    "    // 4. 释放锁",
    "    await redis.del(lockKey);",
    "  }",
    "}",
  ].join('\n'),
  defects: [
    {
      defectId: 'd1',
      line: 4,
      content: "SET NX 缺 EX 参数 — 进程崩溃后锁永久驻留,SKU 彻底卡死",
      severity: 'critical',
      category: 'concurrency',
      relatedScheme: 'A',
    },
    {
      defectId: 'd2',
      line: 9,
      content: 'GET 和 DECRBY 分两步非原子,并发下 check-then-act 间窗漏 → 超卖',
      severity: 'critical',
      category: 'concurrency',
      relatedScheme: 'A',
    },
    {
      defectId: 'd3',
      line: 21,
      content: 'redis.del 未比对 owner (lockKey 的 value 是 userId),可能误删其他进程持有的锁',
      severity: 'major',
      category: 'concurrency',
      relatedScheme: 'A',
    },
  ],
  decoys: [
    { line: 17, content: "console.log 调试语句 (nit 级,非关键问题)" },
    { line: 15, content: "db.orderLog.create 没写注释 (nit 级,无实质 bug)" },
  ],
  failureScenario: {
    successCode: [
      "// 正确实现 — 使用 Lua 原子脚本 + 带 TTL 的锁",
      "const LUA_RESERVE = `",
      "  local cur = tonumber(redis.call('GET', KEYS[1]) or '0')",
      "  if cur < tonumber(ARGV[1]) then return -1 end",
      "  redis.call('DECRBY', KEYS[1], ARGV[1])",
      "  return cur - tonumber(ARGV[1])",
      "`;",
      "async function reserveInventory(sku, qty, userId) {",
      "  const lockKey = `lock:${sku}`;",
      "  const locked = await redis.set(lockKey, userId, 'NX', 'EX', 30);",
      "  if (!locked) return { ok: false, reason: 'LOCKED' };",
      "  try {",
      "    const remain = await redis.eval(LUA_RESERVE, 1, `stock:${sku}`, qty);",
      "    if (remain < 0) return { ok: false, reason: 'OUT_OF_STOCK' };",
      "    await db.orderLog.create({ userId, sku, qty, status: 'RESERVED' });",
      "    return { ok: true };",
      "  } finally {",
      "    // 比对 owner 再删",
      "    const owner = await redis.get(lockKey);",
      "    if (owner === userId) await redis.del(lockKey);",
      "  }",
      "}",
    ].join('\n'),
    failedCode: [
      "// 线上故障版本 — GET 和 DECRBY 分开非原子",
      "async function reserveInventory(sku, qty, userId) {",
      "  const lockKey = `lock:${sku}`;",
      "  const locked = await redis.set(lockKey, userId, 'NX');",
      "  if (!locked) return { ok: false, reason: 'LOCKED' };",
      "  try {",
      "    const stock = parseInt(await redis.get(`stock:${sku}`)) || 0;",
      "    if (stock < qty) return { ok: false, reason: 'OUT_OF_STOCK' };",
      "    await redis.decrby(`stock:${sku}`, qty);",
      "    await db.orderLog.create({ userId, sku, qty, status: 'RESERVED' });",
      "    return { ok: true };",
      "  } finally {",
      "    await redis.del(lockKey);",
      "  }",
      "}",
    ].join('\n'),
    diffPoints: [
      { line: 3, description: 'success 用 SET NX EX 30 设 TTL;failed 缺 EX,进程崩溃后锁永存' },
      {
        line: 8,
        description:
          'success 用 Lua eval 原子化 check-and-decrement;failed GET 与 DECRBY 分两步,高并发下 0.3% 请求超卖',
      },
      {
        line: 15,
        description:
          'success 释放锁前比对 owner,failed 直接 DEL — 锁 TTL 到期后可能误删下一个进程的锁',
      },
    ],
    rootCause:
      '压测 10,000 QPS 下,failed 版本出现 0.3% 库存负数 (1,500 单超卖),根因是 GET→DECRBY 分两步 check-then-act。' +
      '监控曲线:DECRBY 成功率 99.7%,但 GET 读到的 stock 在 DECRBY 前已被其他请求扣走。修复需用 Lua 单步原子化,或切到 WATCH/MULTI 事务。',
  },
  migrationScenario: {
    newBusinessContext:
      '双 11 抢红包场景 — 活动整点开放 2 分钟,预生成红包池共 50,000 个(金额随机 1-50 元),' +
      '预估 500,000 用户同时点击"抢"。要求: (1) 每个红包只能被一个用户领到,严禁重复领取 ' +
      '(2) 抢成功的请求必须在 2 秒内返回金额 (3) 运营可容忍单个红包因系统故障丢失(日志兜底 T+1 补发),' +
      '但不可接受"所有人都等 30 秒"或"一红包多人领"。红包池分布式存储在 3 个 Redis 分片上。',
    relatedDimension: '高并发下的互斥分配与原子扣减(池化资源的无冲突发放)',
    differingDimension:
      '规模差 25× (500k vs 20k QPS) · 延迟预算松 6× (<2s vs <300ms) · 容错要求更宽(单丢失可接受 vs 订单绝不丢)',
    promptText:
      '在这个"抢红包"的新场景下,你在 R1 为"秒杀下单"选的方案还成立吗?\n\n' +
      '请回答 (至少 80 字):\n' +
      '1. 你的方案选择在新场景下是否仍然适用?底层原则是什么?\n' +
      '2. 具体哪些参数或实现细节需要调整?为什么?\n\n' +
      '(提示:关注相关维度"高并发互斥"和差异维度"规模/延迟/容错"的交叉影响)',
  },
};
