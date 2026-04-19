/**
 * Tests for services/modules/p0.service.
 *
 * Covers:
 *   - persistPhase0Submission writes V5 fields under metadata.phase0 preserving
 *     other top-level keys (mb, moduleC, selfAssess, signalResults)
 *   - inputBehavior absent → not written (optional field, omit-vs-undefined
 *     distinction matters for schema-strict downstream consumers)
 *   - inputBehavior present → written through
 *   - last-write-wins on subsequent calls
 *   - missing session: no throw, no update
 *   - cross-Task isolation: Task 22/23 mb artifacts and Task 24 selfAssess
 *     survive a P0 write (Pattern H 4th gate prep)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5Phase0Submission } from '@codelens-v5/shared';

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock('../../config/db.js', () => ({
  prisma: {
    session: {
      findUnique,
      update,
    },
  },
}));

import { persistPhase0Submission } from './p0.service.js';

const BASE_SUBMISSION: V5Phase0Submission = {
  codeReading: {
    l1Answer: 'L1 selected option text',
    l2Answer: 'L2 free-text answer',
    l3Answer: 'L3 free-text answer',
    confidence: 0.6,
  },
  aiOutputJudgment: [
    { choice: 'A', reasoning: 'reason for A' },
    { choice: 'both_bad', reasoning: 'reason both bad' },
  ],
  aiClaimVerification: { response: 'AI 解释和代码不一致', submittedAt: 1700000000000 },
  decision: { choice: 'C', reasoning: '先回滚止血' },
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe('persistPhase0Submission', () => {
  it('writes V5 fields under metadata.phase0 preserving other keys', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleC: [{ round: 1 }],
        signalResults: { sChallengeComplete: { value: 0.7 } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistPhase0Submission('s1', BASE_SUBMISSION);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 's1' });
    const meta = arg.data.metadata as Record<string, unknown>;
    expect(meta.moduleC).toEqual([{ round: 1 }]);
    expect(meta.signalResults).toEqual({ sChallengeComplete: { value: 0.7 } });
    expect(meta.phase0).toEqual({
      codeReading: BASE_SUBMISSION.codeReading,
      aiOutputJudgment: BASE_SUBMISSION.aiOutputJudgment,
      aiClaimVerification: BASE_SUBMISSION.aiClaimVerification,
      decision: BASE_SUBMISSION.decision,
    });
  });

  it('omits inputBehavior when undefined', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistPhase0Submission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const p0 = meta.phase0 as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(p0, 'inputBehavior')).toBe(false);
  });

  it('writes inputBehavior when provided', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistPhase0Submission('s1', {
      ...BASE_SUBMISSION,
      inputBehavior: { keystrokes: 42, pasteCount: 1 },
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const p0 = meta.phase0 as Record<string, unknown>;
    expect(p0.inputBehavior).toEqual({ keystrokes: 42, pasteCount: 1 });
  });

  it('last write wins on subsequent calls', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        phase0: {
          codeReading: { l1Answer: 'old', l2Answer: 'old', l3Answer: 'old', confidence: 0.1 },
          aiOutputJudgment: [],
          aiClaimVerification: { response: 'old', submittedAt: 1 },
          decision: { choice: 'old', reasoning: 'old' },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistPhase0Submission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const p0 = meta.phase0 as Record<string, unknown>;
    expect(p0).toEqual({
      codeReading: BASE_SUBMISSION.codeReading,
      aiOutputJudgment: BASE_SUBMISSION.aiOutputJudgment,
      aiClaimVerification: BASE_SUBMISSION.aiClaimVerification,
      decision: BASE_SUBMISSION.decision,
    });
  });

  it('cross-Task isolation: Task 22/23 mb.* and Task 24 selfAssess survive P0 write', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
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
      },
    });
    update.mockResolvedValueOnce({});

    await persistPhase0Submission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const mb = meta.mb as Record<string, unknown>;
    expect(mb.finalTestPassRate).toBe(0.8);
    expect(mb.finalFiles).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
    expect((mb.editorBehavior as Record<string, unknown>).aiCompletionEvents).toEqual([
      { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
    ]);
    expect(meta.selfAssess).toEqual({ confidence: 0.7, reasoning: 'reflection' });
    expect((meta.phase0 as Record<string, unknown>).decision).toEqual(BASE_SUBMISSION.decision);
  });

  it('missing session: no throw, no update', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(persistPhase0Submission('missing', BASE_SUBMISSION)).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
