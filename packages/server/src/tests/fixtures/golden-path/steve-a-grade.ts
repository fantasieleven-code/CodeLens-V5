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
      { choice: 'A', reasoning: 'A 更直接。' }, // wrong — groundTruth is B
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
      reasoning: '我选 A,Redis 扣减更快,性能好。MySQL 直接写会慢。',
      structuredForm: {
        scenario: '秒杀库存扣减',
        tradeoff: 'A 快但一致性有问题,B 慢但安全,C 最终一致性',
        decision: 'A',
        verification: '要压测一下',
      },
      challengeResponse:
        'A 还是 OK 的,因为 Redis 崩的概率不大。即使崩了也可以恢复。',
    },
    round2: {
      markedDefects: [
        { defectId: 'd1', commentType: 'bug', comment: '这里返回值没检查' },
        { defectId: 'd3', commentType: 'bug', comment: '日志不够' },
      ],
    },
    round3: {
      correctVersionChoice: 'success',
      diffAnalysis: 'failed 版本少了一些检查',
      diagnosisText: 'failed 版本有 bug 会超卖',
    },
    round4: {
      response:
        '红包抢购场景也可以用 Redis,因为性能要求类似。不过参数可能需要调整一下,但是具体怎么调我不太确定。',
      submittedAt: T0 + 90_000,
      timeSpentSec: 90,
    },
  },
  mb: {
    planning: {
      decomposition: [
        '1. 看一下 InventoryRepository 代码',
        '2. 实现 decrement 方法',
        '3. 跑一下测试',
      ].join('\n'),
      dependencies: 'Repository 依赖 redis,Service 依赖 Repository',
      fallbackStrategy: 'Redis 挂了的话就用 MySQL 兜底',
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
          timestamp: T0 + 90_000,
          prompt: 'InventoryRepository 怎么写 decrement? 要保证原子性',
          responseLength: 250,
          duration: 2_500,
        },
        {
          timestamp: T0 + 180_000,
          prompt: '怎么加幂等?',
          responseLength: 200,
          duration: 2_000,
        },
      ],
      diffEvents: [
        { timestamp: T0 + 100_000, accepted: true, linesAdded: 10, linesRemoved: 2 },
        { timestamp: T0 + 200_000, accepted: true, linesAdded: 5, linesRemoved: 0 },
      ],
      fileNavigationHistory: [
        { timestamp: T0 + 10_000, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
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
        { timestamp: T0 + 280_000, passRate: 0.75, duration: 2_500 },
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
        '# Rules',
        '1. 所有 decrement 都要检查超卖',
        '2. 错误要打日志',
        '3. 失败的时候要把 Redis 还原',
      ].join('\n'),
      agentContent: '改 Repository 的时候先看 rules.md',
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule-oversold' },
        { exampleIndex: 1, markedAsViolation: false },
        { exampleIndex: 2, markedAsViolation: false }, // missed
      ],
    },
  },
  selfAssess: {
    confidence: 0.65,
    reasoning:
      'P0 的 L3 我回答得不够全面,AI 判断题还错了一题。MB 最终测试通过率只有 75%,说明实现不够稳。MC 追问环节我可能答得不够深入。但整体方向是对的。',
    reviewedDecisions: ['MA R1 scheme A'],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案 A 的核心思路',
      answer:
        'A 方案是用 Redis 做库存扣减,MySQL 做最终存储。因为 Redis 快,MySQL 慢,秒杀的时候需要性能。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉的时候怎么办?',
      answer: 'Redis 挂了就用 MySQL 兜底。持久化 AOF 可以做,宕机后可以恢复大部分数据。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: '如果 QPS 涨到 100k 呢?',
      answer:
        '100k 的话单机 Redis 可能扛不住,需要加集群或分片。具体怎么分片我没有做过这种量的项目,可能要按 sku 分。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '红包抢购场景你还会选 A 吗?',
      answer: '差不多可以,都是高并发。但可能参数要调一下。',
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
