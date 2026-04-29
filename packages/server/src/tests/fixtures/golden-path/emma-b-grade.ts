/**
 * Task 17 — Golden Path fixture: Emma (target grade: B / B+).
 *
 * Synthetic bridging archetype between Steve (A) and Max (C): correct
 * baseline understanding but shallow evidence, some wrong answers, weak
 * MB editor discipline, and hollow MC probes. Exists to cover the middle
 * of the grade band so FIXTURE_EXPECTATIONS asserts monotonicity across
 * the full S/A/B/C range.
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
        '这里用 Redis SET NX 做一个互斥锁,让同一个 SKU 同时只能有一个人处理。TTL 30s 是防止进程崩溃后锁留着。',
      // Brief #14 D20 · padded to ≥60 char threshold · hedge restatement
      // preserves shallow analysis depth (still B-grade signal).
      l3Answer:
        'QPS 10k 的时候 Redis 本身应该没问题,但是 finally 里的 GET + DEL 有竞争条件。具体在哪个量级会出问题我不太确定,需要看下监控数据再判断。',
      confidence: 0.5,
    },
    aiOutputJudgment: [
      { choice: 'A', reasoning: 'A 有 redis 调用,看起来靠谱一些。' },
      { choice: 'B', reasoning: 'B 有 cache-aside 写法,会回源数据库,更完整。' },
    ],
    aiClaimVerification: {
      response: 'AI 说用了 MULTI,但代码里只有 SET NX,没看到 MULTI 和 EXEC。',
      submittedAt: T0 + 60_000,
    },
    decision: {
      choice: 'C',
      // Brief #14 D23 · padded to ≥20 char threshold · hedge restatement preserves shallow reasoning.
      reasoning: '先限流止血,然后排查原因,具体怎么处理还要看监控数据。',
    },
  },
  moduleA: {
    round1: {
      schemeId: 'A',
      reasoning: [
        '我选方案 A。需求是设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值,需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。',
        '感觉 Redis 原子 decr 是最直接的选择,性能应该可以,悲观锁 500 QPS 太慢了。一致性弱是局限,但是加幂等键应该能缓解,具体怎么做我没仔细想过。',
      ].join('\n'),
      structuredForm: {
        scenario: '秒杀系统的库存扣减模块,10000 QPS 峰值,Redis 和 MySQL 一致性',
        tradeoff:
          '方案 A 性能好 QPS 吞吐够;悲观锁 500 QPS 太慢扛不住秒杀。A 的代价是一致性弱,要做对账;MQ 异步延迟高用户体验不好。',
        // Brief #14 D25 · padded to ≥20 char threshold · hedge restatement.
        decision: '方案 A,看起来比 B 更稳定一点,先选 A 试试。',
        verification: '压测看 QPS 和 P99 延迟,对账任务检查 Redis 和 MySQL 差异。',
      },
      challengeResponse: [
        '我觉得 A 还是可以坚持。Redis 崩溃应该有 AOF 和主从能恢复,故障概率不高。悲观锁 500 QPS 完全撑不住秒杀峰值。',
        '但是 A 的一致性确实偏弱,RTO 大概 30 秒以内,具体对账时效我没仔细想过,可能生产要调。幂等键大概用 requestId 就够了。',
      ].join('\n'),
    },
    round2: {
      markedDefects: [
        {
          defectId: 'd1',
          commentType: 'bug',
          comment: 'decr 没检查返回值,可能超卖',
        },
      ],
    },
    round3: {
      correctVersionChoice: 'success',
      diffAnalysis: '成功版本在 line 2 多了 decr 的返回值检查,line 3 的 mysql.insert 失败后也做了 Redis 回滚。',
      diagnosisText:
        '失败版本缺少 Redis decr 返回值检查,高并发下会超卖。同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误。成功版本多了 if 判断保护。',
    },
    round4: {
      response: [
        '核心思路差不多,红包场景也可以用 Redis 预扣 + 异步落库。',
        '参数需要调整:红包的 TTL 要短一些,因为抢购瞬时;幂等键换成 userId 更合适。考虑到金额精度问题,Lua 脚本里用整数。',
        '大概和之前 R1 选 A 的思路一致,但具体阈值和峰值我没仔细想过。',
      ].join('\n'),
      submittedAt: T0 + 60_000,
      timeSpentSec: 60,
    },
  },
  mb: {
    planning: {
      decomposition: ['1. 看代码', '2. 写 decrement', '3. 跑测试'].join('\n'),
      dependencies: 'Repo -> redis',
      fallbackStrategy: 'Redis 挂了用 MySQL',
      submittedAt: T0 + 2_000,
      skipped: false,
    },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 6 }, (_, i) => ({
        timestamp: T0 + 60_000 + i * 5_000,
        shown: true,
        accepted: i < 4, // mostly accepts
        rejected: i >= 4,
        lineNumber: i + 3,
        completionLength: 30,
        shownAt: T0 + 60_000 + i * 5_000,
        respondedAt: T0 + 60_000 + i * 5_000 + 3_000,
        documentVisibleMs: 2_500,
      })),
      chatEvents: [
        {
          timestamp: T0 + 100_000,
          prompt: '怎么实现 decrement',
          responseLength: 180,
          duration: 2_000,
        },
      ],
      diffEvents: [
        { timestamp: T0 + 110_000, accepted: true, linesAdded: 8, linesRemoved: 0 },
      ],
      fileNavigationHistory: [
        { timestamp: T0 + 10_000, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
        { timestamp: T0 + 170_000, filePath: 'src/inventory/InventoryService.ts', action: 'open' },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: T0 + 60_000,
          endTime: T0 + 160_000,
          keystrokeCount: 80,
        },
        {
          filePath: 'src/inventory/InventoryService.ts',
          startTime: T0 + 180_000,
          endTime: T0 + 210_000,
          keystrokeCount: 25,
        },
      ],
      testRuns: [{ timestamp: T0 + 220_000, passRate: 0.5, duration: 3_000 }],
      documentVisibilityEvents: [{ timestamp: T0 + 20_000, hidden: false }],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    const remaining = await redis.decrby(`stock:${skuId}`, quantity);',
          '    if (remaining < 0) throw new Error("oversold");',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    finalTestPassRate: 0.5,
    standards: {
      rulesContent: '# Rules\n1. 扣减要检查超卖\n2. 要有日志',
      agentContent: 'Agent 改 InventoryRepository 前需要读 rules.md 的规则。',
    },
    audit: {
      // Brief #17 D29 · ruleId remapped to positional `rule_${idx}` matching
      // parseRules output over Emma's 2 numbered rules (rule_0 = "扣减要检查超卖").
      // Brief #17 D33 · added exampleIndex 2 entry (B-tier semantic · Emma
      // misses the retry/error_handling violation as compliant). ViolationAuditPanel
      // initializes markings from violationExamples.length=3 · short fixtures
      // leave marking[2] at default 'unmarked' which blocks canSubmit forever.
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule_0' },
        { exampleIndex: 1, markedAsViolation: false },
        { exampleIndex: 2, markedAsViolation: false },
      ],
    },
  },
  selfAssess: {
    confidence: 0.55,
    reasoning: [
      '整体答完了,但感觉几个点没到位。',
      'P0 的 L3 我只抓了一个瓶颈维度,round-trip 和随机数熵其实没展开。MA 的 R4 红包场景的阈值没给出来,感觉框架有但具体细节不够。',
      'MB 的测试只过了 50%,说明边界情况没处理好,Lua 脚本那边我也不太确信。',
      'MC 挑战环节几轮追问我基本能接住,但感觉回答得偏粗,depth 不够。',
      '综合判断应该在 B 档,再刷一遍可能能补一些。',
    ].join('\n'),
    reviewedDecisions: ['MA R1 scheme A', 'MB test coverage', 'MC R3 answer'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer: 'A 方案就是 Redis 扣减,MySQL 落库。我觉得应该可以的,差不多这样吧。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: '给出第 1 轮回答里某一个判断的一个真实场景例子。例子越具体越好。',
      answer:
        '嗯,你说得对,具体例子我想想 — 我说 Redis 扣减比较快主要是因为面试看到博客都这么写,自己其实没做过 10k+ QPS 的项目。可能秒杀这种场景吧? 数据我没量过,所以说不太准。',
      probeStrategy: 'contradiction',
    },
    {
      round: 3,
      question: 'Redis 挂掉怎么办?',
      answer: '嗯,你说得对,Redis 挂了就用 MySQL 兜底,我之前没考虑这个风险。',
      probeStrategy: 'weakness',
    },
    {
      round: 4,
      question: 'QPS 涨到 100k 呢?',
      answer: 'QPS 100k 的话可能要加集群吧,分片按 SKU 就可以,大致是这样。',
      probeStrategy: 'escalation',
    },
    {
      round: 5,
      question: '红包场景还会选 A 吗?',
      answer: '红包差不多吧,感觉可以用同一方案,性能要求类似。具体参数要调一下。',
      probeStrategy: 'transfer',
    },
  ],
};

export const emmaBGradeFixture: ScoreSessionInput = {
  sessionId: 'gp-emma-b',
  suiteId: 'full_stack',
  submissions,
  examData: GOLDEN_PATH_EXAM_DATA,
  participatingModules: GOLDEN_PATH_PARTICIPATING_MODULES,
};
