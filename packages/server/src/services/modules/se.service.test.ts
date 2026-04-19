/**
 * Tests for services/modules/se.service.
 *
 * Covers:
 *   - persistSelfAssess writes V5 fields under metadata.selfAssess preserving
 *     other top-level keys (mb, moduleC, etc.)
 *   - reviewedDecisions absent → not written (V4 payload has no equivalent;
 *     omit-vs-undefined distinction matters for downstream consumers)
 *   - reviewedDecisions present → written through
 *   - last-write-wins on subsequent calls
 *   - missing session: no throw, no update
 *   - cross-Task isolation: Task 22 metadata.mb.editorBehavior.aiCompletionEvents
 *     and Task 23 metadata.mb.finalTestPassRate / finalFiles survive a SE write
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { persistSelfAssess } from './se.service.js';

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe('persistSelfAssess', () => {
  it('writes V5 fields under metadata.selfAssess preserving other keys', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleC: [{ round: 1 }],
        signalResults: { sChallengeComplete: { value: 0.7 } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistSelfAssess('s1', {
      confidence: 0.75,
      reasoning: '我觉得 Phase 0 选错了方案 C',
    });

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 's1' });
    const meta = arg.data.metadata as Record<string, unknown>;
    expect(meta.moduleC).toEqual([{ round: 1 }]);
    expect(meta.signalResults).toEqual({ sChallengeComplete: { value: 0.7 } });
    expect(meta.selfAssess).toEqual({
      confidence: 0.75,
      reasoning: '我觉得 Phase 0 选错了方案 C',
    });
  });

  it('omits reviewedDecisions when undefined (V4 payload mapping)', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistSelfAssess('s1', {
      confidence: 0.6,
      reasoning: 'r',
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const sa = meta.selfAssess as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(sa, 'reviewedDecisions')).toBe(false);
  });

  it('writes reviewedDecisions when provided', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistSelfAssess('s1', {
      confidence: 0.6,
      reasoning: 'r',
      reviewedDecisions: ['phase0-l3', 'mb-test-strategy', 'md-tradeoff'],
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(meta.selfAssess).toEqual({
      confidence: 0.6,
      reasoning: 'r',
      reviewedDecisions: ['phase0-l3', 'mb-test-strategy', 'md-tradeoff'],
    });
  });

  it('last write wins on subsequent calls', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: { selfAssess: { confidence: 0.4, reasoning: 'first attempt' } },
    });
    update.mockResolvedValueOnce({});

    await persistSelfAssess('s1', {
      confidence: 0.8,
      reasoning: 'revised',
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    expect(meta.selfAssess).toEqual({
      confidence: 0.8,
      reasoning: 'revised',
    });
  });

  it('cross-Task isolation: Task 22/23 mb.* artifacts survive SE write', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
              { timestamp: 2, accepted: false, lineNumber: 6, completionLength: 8 },
            ],
            documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
            testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
          },
          finalTestPassRate: 0.8,
          finalFiles: [{ path: 'src/main.py', content: 'print(1)' }],
          planning: { decomposition: 'x', dependencies: 'y', fallbackStrategy: 'z' },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistSelfAssess('s1', {
      confidence: 0.7,
      reasoning: '反思内容',
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const mb = meta.mb as Record<string, unknown>;
    expect(mb.finalTestPassRate).toBe(0.8);
    expect(mb.finalFiles).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
    expect((mb.editorBehavior as Record<string, unknown>).aiCompletionEvents).toEqual([
      { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
      { timestamp: 2, accepted: false, lineNumber: 6, completionLength: 8 },
    ]);
    expect((mb.editorBehavior as Record<string, unknown>).testRuns).toEqual([
      { timestamp: 4, passRate: 0.8, duration: 1500 },
    ]);
    expect(meta.selfAssess).toEqual({ confidence: 0.7, reasoning: '反思内容' });
  });

  it('missing session: no throw, no update', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(
      persistSelfAssess('missing', { confidence: 0.5, reasoning: 'r' }),
    ).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
