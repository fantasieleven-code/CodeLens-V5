/**
 * Tests for services/modules/ma.service.
 *
 * Covers:
 *   - persistModuleASubmission writes 4 rounds under metadata.moduleA preserving
 *     other top-level keys (mb, phase0, selfAssess, moduleC, signalResults)
 *   - inputBehavior absent → not written (optional R2 field; omit-vs-undefined
 *     distinction matters for schema-strict downstream consumers)
 *   - inputBehavior present → written through
 *   - last-write-wins on subsequent calls
 *   - missing session: no throw, no update
 *   - cross-Task isolation: Task 22/23 mb.* + Task 24 selfAssess + Task 25
 *     phase0.* survive an MA write (Pattern H 5th gate prep)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5ModuleASubmission } from '@codelens-v5/shared';

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const getMAData = vi.hoisted(() => vi.fn());

vi.mock('../../config/db.js', () => ({
  prisma: {
    session: {
      findUnique,
      update,
    },
  },
}));

vi.mock('../exam-data.service.js', () => ({
  examDataService: {
    getMAData,
  },
}));

import { ModuleACanonicalDataError, persistModuleASubmission } from './ma.service.js';

const BASE_SUBMISSION: V5ModuleASubmission = {
  round1: {
    schemeId: 'C',
    reasoning: 'C 方案在 20k QPS 下锁竞争最低',
    structuredForm: {
      scenario: '秒杀峰值 20k QPS',
      tradeoff: '吞吐 vs 运维复杂度',
      decision: '选 C',
      verification: '压测 50k QPS',
    },
    challengeResponse: 'BRPOP + timeout 0 化解空跑',
  },
  round2: {
    markedDefects: [
      {
        defectId: 'line-4',
        line: 4,
        commentType: 'bug',
        comment: 'SET NX 缺 EX',
        fixSuggestion: '加 30s TTL',
      },
    ],
  },
  round3: {
    correctVersionChoice: 'success',
    diffAnalysis: 'Lua eval 把 check-and-decrement 原子化',
    diagnosisText: 'failed 在 10k QPS 出现 0.3% 库存负数',
  },
  round4: {
    response: '底层原则成立,参数调整',
    submittedAt: 1700000000000,
    timeSpentSec: 60,
  },
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  getMAData.mockReset();
  getMAData.mockResolvedValue({ defects: [{ line: 4, defectId: 'd1' }] });
});

describe('persistModuleASubmission', () => {
  it('writes 4 rounds under metadata.moduleA preserving other keys', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        examInstanceId: 'exam-1',
        moduleC: [{ round: 1 }],
        signalResults: { sChallengeComplete: { value: 0.7 } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', BASE_SUBMISSION);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 's1' });
    const meta = arg.data.metadata as Record<string, unknown>;
    expect(meta.moduleC).toEqual([{ round: 1 }]);
    expect(meta.signalResults).toEqual({ sChallengeComplete: { value: 0.7 } });
    expect(meta.moduleA).toEqual({
      round1: BASE_SUBMISSION.round1,
      round2: {
        markedDefects: [
          {
            ...BASE_SUBMISSION.round2.markedDefects[0],
            defectId: 'd1',
          },
        ],
      },
      round3: BASE_SUBMISSION.round3,
      round4: BASE_SUBMISSION.round4,
    });
  });

  it('omits round2.inputBehavior when undefined', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { examInstanceId: 'exam-1' } });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const ma = meta.moduleA as { round2: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(ma.round2, 'inputBehavior')).toBe(false);
  });

  it('writes round2.inputBehavior when provided', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { examInstanceId: 'exam-1' } });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', {
      ...BASE_SUBMISSION,
      round2: {
        ...BASE_SUBMISSION.round2,
        inputBehavior: { keystrokes: 240, pasteCount: 1 },
      },
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const ma = meta.moduleA as { round2: { inputBehavior?: unknown } };
    expect(ma.round2.inputBehavior).toEqual({ keystrokes: 240, pasteCount: 1 });
  });

  it('last write wins on subsequent calls', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        examInstanceId: 'exam-1',
        moduleA: {
          round1: {
            schemeId: 'A',
            reasoning: 'old',
            structuredForm: { scenario: 'old', tradeoff: 'old', decision: 'old', verification: 'old' },
            challengeResponse: 'old',
          },
          round2: { markedDefects: [] },
          round3: { correctVersionChoice: 'failed', diffAnalysis: 'old', diagnosisText: 'old' },
          round4: { response: 'old', submittedAt: 1, timeSpentSec: 1 },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const ma = meta.moduleA as Record<string, unknown>;
    expect(ma.round1).toEqual(BASE_SUBMISSION.round1);
    expect(ma.round3).toEqual(BASE_SUBMISSION.round3);
    expect(ma.round4).toEqual(BASE_SUBMISSION.round4);
  });

  it('cross-Task isolation: Task 22/23 mb.* + Task 24 selfAssess + Task 25 phase0.* survive MA write', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        examInstanceId: 'exam-1',
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
            ],
            documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
            testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
          },
          finalTestPassRate: 0.8,
          finalFiles: [{ path: 'src/main.py', content: 'print(1)' }],
          planning: { decomposition: 'x', dependencies: 'y', fallbackStrategy: 'z' },
        },
        selfAssess: { confidence: 0.7, reasoning: 'reflection' },
        phase0: {
          codeReading: { l1Answer: 'L1', l2Answer: 'L2', l3Answer: 'L3', confidence: 0.6 },
          aiOutputJudgment: [{ choice: 'A', reasoning: 'why' }],
          aiClaimVerification: { response: 'mismatch', submittedAt: 1700000000000 },
          decision: { choice: 'C', reasoning: '止血' },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const mb = meta.mb as Record<string, unknown>;
    expect(mb.finalTestPassRate).toBe(0.8);
    expect(mb.finalFiles).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
    expect((mb.editorBehavior as Record<string, unknown>).aiCompletionEvents).toEqual([
      { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
    ]);
    expect(meta.selfAssess).toEqual({ confidence: 0.7, reasoning: 'reflection' });
    const phase0 = meta.phase0 as Record<string, unknown>;
    expect(phase0.decision).toEqual({ choice: 'C', reasoning: '止血' });
    expect((meta.moduleA as Record<string, unknown>).round1).toEqual(BASE_SUBMISSION.round1);
  });

  it('missing session: no throw, no update', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(persistModuleASubmission('missing', BASE_SUBMISSION)).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it('normalizes reviewed lines to canonical defectIds from DB examData', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { examInstanceId: 'exam-1' } });
    getMAData.mockResolvedValueOnce({ defects: [{ line: 4, defectId: 'd1' }] });
    update.mockResolvedValueOnce({});

    await persistModuleASubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const ma = meta.moduleA as { round2: V5ModuleASubmission['round2'] };
    expect(ma.round2.markedDefects[0]).toMatchObject({ line: 4, defectId: 'd1' });
  });

  it('fails closed when session metadata lacks examInstanceId', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });

    await expect(persistModuleASubmission('s1', BASE_SUBMISSION)).rejects.toBeInstanceOf(
      ModuleACanonicalDataError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('fails closed when canonical MA exam data is missing', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { examInstanceId: 'exam-1' } });
    getMAData.mockResolvedValueOnce(null);

    await expect(persistModuleASubmission('s1', BASE_SUBMISSION)).rejects.toThrow(
      'Module A canonical exam data missing',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('fails closed when a reviewed line is not in canonical defects', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { examInstanceId: 'exam-1' } });
    getMAData.mockResolvedValueOnce({ defects: [{ line: 9, defectId: 'd2' }] });

    await expect(persistModuleASubmission('s1', BASE_SUBMISSION)).rejects.toThrow(
      'Module A canonical defect missing for reviewed line=4',
    );
    expect(update).not.toHaveBeenCalled();
  });
});
