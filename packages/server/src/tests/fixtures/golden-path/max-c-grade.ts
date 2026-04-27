/**
 * Task 17 — Golden Path fixture: Max (target grade: C or D).
 *
 * Surface / wrong / minimal answers. Mirrors the Max archetype in the
 * module signal tests: every signal should be near zero.
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
      l1Answer: '记录日志', // wrong
      // Brief #14 D21 · l2/l3 padded to UI thresholds · hedge style preserves
      // surface-level reading depth signal (still wrong / sCodeReadingDepth ≈ 0).
      l2Answer: '不太懂,可能是做并发的吧。看起来跟 Redis 有关,但具体在做什么我看不出来,可能是数据库锁或者缓存。',
      l3Answer:
        '不太清楚。可能跟性能有关吧,但是我没看明白具体是什么意思,可能是缓存层或者数据库的事情,具体我答不上来,这种细节我没经验。',
      confidence: 0.3,
    },
    aiOutputJudgment: [
      { choice: 'B', reasoning: 'B 看起来比较简单,所以我选 B,但是不太确定。' }, // wrong
      { choice: 'A', reasoning: 'A 短一点,所以我选 A,但是我不太懂为什么。' }, // wrong
    ],
    aiClaimVerification: {
      response: 'AI 说得有道理。',
      submittedAt: T0 + 60_000,
    },
    decision: {
      choice: 'A',
      reasoning: '回滚吧,先回到之前的版本看看,具体怎么处理我不太懂。',
    },
  },
  moduleA: {
    round1: {
      schemeId: 'B',
      // Brief #14 D21 · MA fields padded to UI thresholds · hedge style ·
      // wrong scheme + shallow reasoning preserved (sDesignDecomposition ≈ 0).
      reasoning: 'B 简单一点,所以我选 B,但是我不太懂为什么 A 和 C 不好,具体看不出来。',
      // Brief #14 D24 · MA r1 structuredForm 4 sub-fields gated inline ≥20 each
      // (ModuleAPage.tsx:131-135 · no named MIN constant). Padded with hedge
      // style preserving D-grade vacancy · no domain content addition.
      structuredForm: {
        scenario: '秒杀场景吧,具体细节我不太懂,看起来跟并发有关。',
        tradeoff: '不太清楚有什么 tradeoff,可能性能或者一致性吧。',
        decision: '选 B,但是我不太确定,看起来 B 简单一点。',
        verification: '不知道怎么验证,可能跑一下看看吧,具体没思路。',
      },
      challengeResponse:
        '不知道。我感觉我之前的选择应该是对的吧,但是我也不太确定为什么,具体哪里有问题我看不出来。',
    },
    round2: {
      markedDefects: [
        { defectId: 'unknown', commentType: 'nit', comment: '这个不好看,感觉有点问题' },
      ],
    },
    round3: {
      correctVersionChoice: 'failed',
      diffAnalysis:
        '差不多吧,我看不出来有什么明显的区别,可能是一些细节不一样,但我不太懂具体差在哪里。',
      diagnosisText:
        '不懂。我感觉这个问题比较难,可能跟并发或者锁有关系吧,但具体我看不出来,没思路。',
    },
    round4: {
      response:
        '不知道。我之前的回答可能都不太对吧,这个题目比较难,我没什么经验。如果重新做一遍也不会更好,可能还是同样的答案,具体怎么改我没思路,这种迁移题我以前没遇到过,看不出来差别。',
      submittedAt: T0 + 20_000,
      timeSpentSec: 20,
    },
  },
  mb: {
    planning: {
      decomposition: '写一下',
      dependencies: '',
      fallbackStrategy: '',
      submittedAt: T0 + 1_000,
      skipped: false,
    },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 5 }, (_, i) => ({
        timestamp: T0 + 60_000 + i * 5_000,
        shown: true,
        accepted: true, // accepts everything blindly
        rejected: false,
        lineNumber: i + 3,
        completionLength: 30,
        shownAt: T0 + 60_000 + i * 5_000,
        respondedAt: T0 + 60_000 + i * 5_000 + 500,
        documentVisibleMs: 500,
      })),
      chatEvents: [],
      diffEvents: [
        { timestamp: T0 + 100_000, accepted: true, linesAdded: 5, linesRemoved: 0 },
      ],
      fileNavigationHistory: [
        { timestamp: T0 + 10_000, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: T0 + 60_000,
          endTime: T0 + 120_000,
          keystrokeCount: 20,
        },
      ],
      testRuns: [],
      documentVisibilityEvents: [{ timestamp: T0 + 20_000, hidden: false }],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    await redis.decr(`stock:${skuId}`);',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    finalTestPassRate: 0.1,
    standards: {
      rulesContent: '',
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: false }, // missed
        { exampleIndex: 1, markedAsViolation: true }, // false positive
        { exampleIndex: 2, markedAsViolation: false }, // missed
      ],
    },
  },
  selfAssess: {
    confidence: 0.9,
    // Brief #14 D21 · padded to ≥10 char threshold · over-confident vacancy preserved.
    reasoning: '感觉都挺好的吧,没什么特别的。',
    reviewedDecisions: [],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案',
      // Brief #14 D21 · MC answers padded to ≥10 char threshold · semantic vacancy preserved.
      answer: '我选 B,因为看起来简单。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉怎么办?',
      answer: '不知道,这个问题我没思路。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: 'QPS 涨到 100k 呢?',
      answer: '没想过这个问题,我没思路。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '红包场景呢?',
      answer: '差不多吧,看不出来。',
      probeStrategy: 'transfer',
    },
  ],
};

export const maxCGradeFixture: ScoreSessionInput = {
  sessionId: 'gp-max-c',
  suiteId: 'full_stack',
  submissions,
  examData: GOLDEN_PATH_EXAM_DATA,
  participatingModules: GOLDEN_PATH_PARTICIPATING_MODULES,
};
