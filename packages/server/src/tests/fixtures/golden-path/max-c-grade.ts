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
      l2Answer: '不太懂,可能是做并发的。',
      l3Answer: '不太清楚。',
      confidence: 0.3,
    },
    aiOutputJudgment: [
      { choice: 'B', reasoning: 'B 看起来比较简单。' }, // wrong
      { choice: 'A', reasoning: 'A 短。' }, // wrong
    ],
    aiClaimVerification: {
      response: 'AI 说得有道理。',
      submittedAt: T0 + 60_000,
    },
    decision: {
      choice: 'A',
      reasoning: '回滚吧。',
    },
  },
  moduleA: {
    round1: {
      schemeId: 'B',
      reasoning: 'B 简单。',
      structuredForm: {
        scenario: '秒杀',
        tradeoff: '',
        decision: 'B',
        verification: '',
      },
      challengeResponse: '不知道。',
    },
    round2: {
      markedDefects: [
        { defectId: 'unknown', commentType: 'nit', comment: '这个不好看' },
      ],
    },
    round3: {
      correctVersionChoice: 'failed',
      diffAnalysis: '差不多',
      diagnosisText: '不懂',
    },
    round4: {
      response: '不知道。',
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
    reasoning: '感觉都挺好的。',
    reviewedDecisions: [],
  },
  moduleC: [
    {
      round: 1,
      question: '描述 R1 选的方案',
      answer: '我选 B。',
      probeStrategy: 'baseline',
    },
    {
      round: 2,
      question: 'Redis 挂掉怎么办?',
      answer: '不知道。',
      probeStrategy: 'weakness',
    },
    {
      round: 3,
      question: 'QPS 涨到 100k 呢?',
      answer: '没想过。',
      probeStrategy: 'escalation',
    },
    {
      round: 4,
      question: '红包场景呢?',
      answer: '差不多。',
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
