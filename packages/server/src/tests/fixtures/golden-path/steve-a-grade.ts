/**
 * Task 17 — Golden Path fixture: Steve (target grade: A).
 *
 * Mostly correct answers with less depth / weaker evidence than Liam. Mirrors
 * the Steve archetype in the module signal tests.
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
        '主要是用 Redis 做了一个互斥锁,防止重复下单。TTL 30 秒应该是为了容错,避免挂掉的时候锁一直占着。',
      l3Answer:
        'QPS 涨到 10k 时数据库可能先成为瓶颈,Redis 本身 10k 问题不大。另外如果多实例可能锁会有并发问题,需要考虑一下。',
      confidence: 0.6,
    },
    aiOutputJudgment: [
      { choice: 'A', reasoning: 'A 看起来更完整一点,有 redis 调用,B 没有。' },
      // Brief #14 D19 · padded to ≥20 char threshold · semantic vacancy preserved (still wrong choice)
      { choice: 'A', reasoning: 'A 更直接,看起来更简单一点,我倾向选 A。' }, // wrong — groundTruth is B
    ],
    aiClaimVerification: {
      response: 'AI 说用了 MULTI,但我觉得代码里好像没有 MULTI 这种写法?',
      submittedAt: T0 + 60_000,
    },
    decision: {
      choice: 'C',
      reasoning: '我会先止血,不能让失败率继续涨,然后再排查。',
    },
  },
  moduleA: {
    round1: {
      schemeId: 'A',
      reasoning: [
        '我选方案 A。需求是设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值,需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。',
        '我的判断:秒杀的瓶颈是 QPS,MySQL 单机悲观锁 500 QPS 肯定扛不住;Redis 原子 decr 的 10ms 级是比较直接的选择。',
        '一致性弱是局限,但 requestId 幂等键 + 对账任务能兜住大部分场景。Redis 崩溃丢数据的风险要考虑,AOF + 主从能恢复,对账复杂度要额外投入开发时间;但是具体 RTO 我没仔细算过,生产要看监控跑起来再调。',
      ].join('\n'),
      structuredForm: {
        scenario:
          '秒杀系统的库存扣减模块,支持 10000 QPS 峰值,Redis 和 MySQL 之间做一致性设计',
        tradeoff:
          '方案 A 的吞吐 QPS 20k,比 MySQL 悲观锁 500 QPS 高 40 倍,P99 10ms 级。代价是一致性弱 + 对账复杂 + Redis 崩溃丢数据。悲观锁扛不住秒杀是 hard block,MQ 异步延迟秒级体验差。',
        decision: '方案 A,因为 QPS 是硬约束,一致性弱通过幂等键 + 对账缓解',
        verification:
          '压测 Redis decr 打到 20k QPS,监控 P99 延迟和错误率;跑对账任务看 5 分钟窗口内 Redis 和 MySQL 的差异;故障演练 kill Redis 主节点,验证 sentinel 切换 RTO。',
      },
      challengeResponse: [
        '我还是坚持 A。核心理由两个:',
        '(1) Redis 崩溃可以用 AOF 和主从恢复,年故障窗口不到 5 分钟,实际风险可控;',
        '(2) 对比悲观锁方案,单机 MySQL 500 QPS 完全扛不住秒杀峰值。',
        '我承认 A 的一致性稍弱,具体 sentinel 切换 RTO 大概在 10 秒以内,不过我没实测过生产数据。加上幂等键 + 5 分钟对账任务,P99 能守在 20ms 以内。整体看这个 tradeoff 我觉得值。',
      ].join('\n'),
    },
    round2: {
      // Brief #14 D19 · per-defect comment padded to ≥10 char threshold ·
      // hedge style preserves shallow review depth signal.
      markedDefects: [
        { defectId: 'd1', commentType: 'bug', comment: '这里返回值没检查,可能有问题' },
        { defectId: 'd3', commentType: 'bug', comment: '日志不够,看着不太够用' },
      ],
    },
    round3: {
      correctVersionChoice: 'success',
      diffAnalysis:
        '失败版本在 line 2 少了 decr 返回值检查,line 3 的 mysql.insert 没配合 Redis 回滚。成功版本多了 if result < 0 的判断和 incr 回补。',
      diagnosisText: [
        '失败版本缺少 Redis decr 返回值检查,高并发下会超卖 — 返回 -1 的语义被忽略。',
        '同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误 — 双写一致性没兜住。',
        '成功版本多了 if result < 0 的回滚保护。根本原因是原子性和补偿机制缺失。',
      ].join('\n'),
    },
    round4: {
      response: [
        '核心原则不变 — 高并发场景下 Redis 预扣 + 异步落库还是对的,本质是原子性保护 + 补偿机制。',
        '但具体参数需要调整:红包抢购的并发量应该比秒杀更高,TTL 要短一些,大约几秒级;考虑到红包金额不能超发,幂等键从 requestId 换成 userId,粒度更细。',
        'Lua 脚本里金额要用整数避免浮点误差。阈值也要变,因为扣减单位不同。',
        '迁移大概 80% 架构复用,核心思路和之前 R1 选 A 一致。具体红包的峰值阈值我没仔细算过,需要看业务数据。',
      ].join('\n'),
      submittedAt: T0 + 90_000,
      timeSpentSec: 90,
    },
  },
  mb: {
    planning: {
      decomposition: [
        '1. 先看 tests/inventory.test.ts 和 src/inventory/InventoryRepository.ts,摸清楚 decrement 的边界',
        '2. 在 InventoryRepository 实现 decrement 方法,核心是 Redis decrby + 超卖检查 + requestId 幂等',
        '3. 改 InventoryService.reduce 把 requestId 透传下去,避免上层漏传导致重复扣',
        '4. InventoryController 层加 skuId 和 quantity 的入参 validation,防止非法值打穿 Service',
        '5. 跑 tests/inventory.test.ts 看 pass rate,有 case 失败就回 step 2 补边界处理',
      ].join('\n'),
      dependencies: 'InventoryRepository 依赖 redis 客户端,InventoryService 依赖 InventoryRepository,InventoryController 依赖 Service',
      fallbackStrategy: [
        'Redis 挂掉 fallback 到 MySQL 悲观锁,QPS 会从 20k 掉到 500,但能保住可用性;',
        'decrement 超时 retry 2 次,仍失败抛 error 触发上游 rollback,避免库存永久错误;',
        '告警走监控侧,recovery 靠 AOF + 主从切换,大概 30 秒以内能恢复。',
      ].join(''),
      submittedAt: T0 + 2_000,
      skipped: false,
    },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 8 }, (_, i) => ({
        timestamp: T0 + 60_000 + i * 5_000,
        shown: true,
        accepted: i < 4,
        rejected: i >= 4,
        lineNumber: i + 3,
        completionLength: 35,
        shownAt: T0 + 60_000 + i * 5_000,
        respondedAt: T0 + 60_000 + i * 5_000 + 2_000,
        documentVisibleMs: 1_500,
      })),
      chatEvents: [
        {
          timestamp: T0 + 70_000,
          prompt:
            'InventoryRepository.decrement 怎么写能保证原子性?如果并发高,decr 返回值必须立即检查 < 0,这样才能避免 oversold bug,当前代码里好像缺这个检查',
          responseLength: 250,
          duration: 2_500,
        },
        {
          timestamp: T0 + 140_000,
          prompt:
            'InventoryService.reduce 加幂等怎么做?如果 requestId 重复出现应该怎么处理,当 retry 2 次仍失败要验证边界情况,检查有没有 rollback Redis 的必要',
          responseLength: 220,
          duration: 2_200,
        },
        {
          timestamp: T0 + 210_000,
          prompt:
            'rules.md 我写了 5 条规则,当 Agent 改 InventoryRepository 的时候,帮我 verify 一下有没有漏掉的 error handling 或者 boundary 检查,避免 edge case',
          responseLength: 240,
          duration: 2_500,
        },
        {
          timestamp: T0 + 260_000,
          prompt:
            'tests/inventory.test.ts 跑出来有 2 个 case 失败,decrement 的 oversold 分支是不是缺检查?如果是边界问题我需要回补 validation,帮我 verify 一下',
          responseLength: 230,
          duration: 2_400,
        },
      ],
      diffEvents: [
        { timestamp: T0 + 80_000, accepted: true, linesAdded: 10, linesRemoved: 2 },
        { timestamp: T0 + 160_000, accepted: true, linesAdded: 5, linesRemoved: 0 },
        { timestamp: T0 + 220_000, accepted: false, linesAdded: 3, linesRemoved: 0 },
        { timestamp: T0 + 270_000, accepted: true, linesAdded: 4, linesRemoved: 1 },
      ],
      fileNavigationHistory: [
        { timestamp: T0 + 5_000, filePath: 'tests/inventory.test.ts', action: 'open' },
        { timestamp: T0 + 20_000, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
        { timestamp: T0 + 150_000, filePath: 'src/inventory/InventoryService.ts', action: 'open' },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: T0 + 60_000,
          endTime: T0 + 180_000,
          keystrokeCount: 100,
        },
        {
          filePath: 'src/inventory/InventoryService.ts',
          startTime: T0 + 190_000,
          endTime: T0 + 230_000,
          keystrokeCount: 50,
        },
      ],
      testRuns: [
        { timestamp: T0 + 240_000, passRate: 0.5, duration: 2_500 },
        { timestamp: T0 + 280_000, passRate: 0.625, duration: 2_500 },
        { timestamp: T0 + 320_000, passRate: 0.75, duration: 2_500 },
      ],
      documentVisibilityEvents: [{ timestamp: T0 + 20_000, hidden: false }],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'import { RedisClient } from "./redis";',
          'export class InventoryRepository {',
          '  constructor(private readonly redis: RedisClient) {}',
          '  async decrement(skuId: string, quantity: number, requestId: string): Promise<void> {',
          '    // simple compare-and-decrement',
          '    const remaining = await this.redis.decrby(`stock:${skuId}`, quantity);',
          '    if (remaining < 0) {',
          '      await this.redis.incrby(`stock:${skuId}`, quantity);',
          '      throw new Error("oversold");',
          '    }',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'export class InventoryService {',
          '  constructor(private readonly repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number) {',
          '    await this.repo.decrement(skuId, qty);',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    finalTestPassRate: 0.75,
    standards: {
      rulesContent: [
        '# Inventory decrement rules',
        '1. 所有 decrement 都必须检查超卖 — 如果 `redis.decr()` 返回值 < 0 要立即 throw OversoldError,不要 silently return;',
        '2. 错误路径必须打日志,日志里要包含 skuId + quantity + requestId 三个字段,不要只写"扣减失败"这种模糊文本;',
        '3. 失败时需要回滚 Redis — 当 `mysql.insert()` 抛异常,必须调用 `redis.incrby()` 把扣掉的库存加回去,避免库存永久错误;',
        '4. 方法命名要体现动作,比如用 decrement 而不是 update,避免含糊的 naming;超过 3 层嵌套的分支要 refactor 成 helper,降低 complexity;',
        '5. 写入前需要 validate skuId,如果长度超过 40 字符或含非 ASCII 字符要拒绝,避免 cache pollution 污染;',
        '6. 测试要覆盖 oversold / 并发 / retry 三种场景,test 覆盖率低于 80% 的改动不合并,避免边界遗漏。',
      ].join('\n'),
      agentContent:
        'Agent 在改 InventoryRepository 或 InventoryService 的时候,必须先读 rules.md 的 6 条规则。任何涉及 `redis.decr()` 或 `mysql.insert()` 的改动都需要配套更新 tests/inventory.test.ts,不要漏测边界。上下文不够时先看 scaffold 里的 dependencyOrder,避免跳过 Controller 层的 validation。',
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule-oversold' },
        { exampleIndex: 1, markedAsViolation: false },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule-retry' },
      ],
    },
  },
  selfAssess: {
    confidence: 0.65,
    reasoning: [
      '整体 P0/MA/MB/MC 四段完成度我觉得可以,但几个地方留了提升空间。',
      'P0 的 L3 我只抓住了 Redis 单机瓶颈的点,round-trip 和随机数熵的维度没展开,AI 判断题还错了一题,说明对 cache-aside 语义没吃透。',
      'MA 的 R1 方向对,但 R4 迁移到红包场景我给的框架偏笼统,没具体到峰值阈值。',
      'MB 的 decrement 实现跑通了,但 finalTestPassRate 只到 75%,边界处理不够扎实,想再刷一遍就没时间了。',
      'MC 几轮追问能接住,但 escalation 到 100k QPS 的时候我只给了分片,proxy 层的方案没想到,这是明显短板。',
      '综合判断应该在 A 档偏上。',
    ].join('\n'),
    reviewedDecisions: ['P0 L3 answer', 'MA R1 scheme A', 'MA R4 transfer', 'MB test coverage'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer:
        'A 方案是 Redis 做扣减 + MySQL 落库。我觉得这个选择整体方向对,秒杀场景需要高 QPS。如果是单机 Redis,10k QPS 应该没问题,MySQL 直接写太慢。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉的时候怎么办?',
      answer:
        'Redis 挂了可以用 AOF 恢复,但是整体看,方案 A 的核心观点还是站得住的。MySQL 可以作为降级兜底,可能还是要做告警监控。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: '如果 QPS 涨到 100k 呢?',
      answer:
        '100k 单机扛不住,应该需要上集群 + sharding 按 sku 分。具体怎么分我没做过这种量级的项目,可能大概按 skuId hash 分。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '红包抢购场景你还会选 A 吗?',
      answer:
        '红包还是可以用 A,差不多的场景。但是参数要调 — 红包不能超发,这次的教训是具体业务要区别对待。',
      probeStrategy: 'transfer',
    },
  ],
};

export const steveAGradeFixture: ScoreSessionInput = {
  sessionId: 'gp-steve-a',
  suiteId: 'full_stack',
  submissions,
  examData: GOLDEN_PATH_EXAM_DATA,
  participatingModules: GOLDEN_PATH_PARTICIPATING_MODULES,
};
