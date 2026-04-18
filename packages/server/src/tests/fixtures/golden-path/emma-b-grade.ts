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
      l3Answer:
        'QPS 10k 的时候 Redis 本身应该没问题,但是 finally 里的 GET + DEL 有竞争条件。',
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
      reasoning: '先限流止血,然后排查原因。',
    },
  },
  moduleA: {
    round1: {
      schemeId: 'A',
      reasoning:
        '选 A,秒杀需要性能,Redis 扣减延迟低;B 方案 QPS 500 不够。C 延迟太高体验不好。',
      structuredForm: {
        scenario: '秒杀库存扣减,QPS 高',
        tradeoff: 'A 快但一致性弱,B 慢但一致,C 最终一致',
        decision: 'A',
        verification: '压测一下',
      },
      challengeResponse:
        'Redis 崩溃的概率不高,而且 AOF 可以恢复。选 A 还是合理的。',
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
      diffAnalysis: '成功版本多了检查和回滚',
      diagnosisText: '缺少检查会超卖',
    },
    round4: {
      response:
        '红包场景也用 Redis 吧,性能需要,具体参数没想好。',
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
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: T0 + 60_000,
          endTime: T0 + 200_000,
          keystrokeCount: 80,
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
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule-oversold' },
        { exampleIndex: 1, markedAsViolation: false },
      ],
    },
  },
  selfAssess: {
    confidence: 0.55,
    reasoning:
      '我感觉整体答得还行,但有些细节没到位。MB 测试只过 50%,说明边界情况没处理好。P0 和 MA 的深度应该 OK。',
    reviewedDecisions: ['MA R1 scheme A'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer: 'A 方案是用 Redis 做扣减,MySQL 落库,因为秒杀要性能。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉怎么办?',
      answer: '可以用 AOF 恢复,挂了的话可能需要手动处理一下。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: 'QPS 涨到 100k 呢?',
      answer: '需要集群吧,分片按 SKU。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '红包场景还会选 A 吗?',
      answer: '应该可以,差不多的场景。',
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
