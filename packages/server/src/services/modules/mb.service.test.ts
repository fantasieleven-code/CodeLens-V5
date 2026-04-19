/**
 * Tests for services/modules/mb.service.
 *
 * Covers:
 *   - persistPlanning / persistStandards / persistAudit write under metadata.mb
 *     and preserve other metadata keys
 *   - appendVisibilityEvent appends to metadata.mb.editorBehavior.documentVisibilityEvents
 *     (Round 2 Part 3 调整 4)
 *   - calculatePassRate parses pytest summary formats
 *   - missing session: no throw, no update
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

import {
  appendAiCompletionEvents,
  appendVisibilityEvent,
  calculatePassRate,
  persistAudit,
  persistPlanning,
  persistStandards,
} from './mb.service.js';

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe('persistPlanning', () => {
  it('writes planning under metadata.mb.planning preserving other keys', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleC: [{ round: 1 }],
        signalResults: { sSchemeJudgment: { value: 0.8 } },
        mb: { standards: { rulesContent: 'preexisting' } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistPlanning('s1', {
      decomposition: 'a',
      dependencies: 'b',
      fallbackStrategy: 'c',
      submittedAt: 1710000000000,
    });

    expect(update).toHaveBeenCalledOnce();
    const { data } = update.mock.calls[0][0];
    expect(data.metadata.moduleC).toEqual([{ round: 1 }]);
    expect(data.metadata.signalResults.sSchemeJudgment.value).toBe(0.8);
    expect(data.metadata.mb.planning.decomposition).toBe('a');
    expect(data.metadata.mb.standards.rulesContent).toBe('preexisting');
  });

  it('no-ops + does not throw when session is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(
      persistPlanning('missing', { decomposition: 'x', dependencies: 'y', fallbackStrategy: 'z' }),
    ).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('persistStandards', () => {
  it('writes standards under metadata.mb.standards', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});
    await persistStandards('s1', { rulesContent: 'rules body', agentContent: 'agent body' });
    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.standards).toEqual({
      rulesContent: 'rules body',
      agentContent: 'agent body',
    });
  });
});

describe('persistAudit', () => {
  it('writes audit under metadata.mb.audit', async () => {
    findUnique.mockResolvedValueOnce({ metadata: { mb: { planning: { decomposition: 'pre' } } } });
    update.mockResolvedValueOnce({});
    await persistAudit('s1', {
      violations: [{ exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'r1' }],
    });
    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.planning.decomposition).toBe('pre'); // preserved
    expect(data.metadata.mb.audit.violations).toHaveLength(1);
  });
});

describe('appendVisibilityEvent (Round 2 Part 3 调整 4)', () => {
  it('appends to metadata.mb.editorBehavior.documentVisibilityEvents', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            documentVisibilityEvents: [{ timestamp: 1, hidden: true }],
            aiCompletionEvents: [{ timestamp: 2, accepted: false, lineNumber: 1, completionLength: 10 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendVisibilityEvent('s1', { timestamp: 100, hidden: false });

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.documentVisibilityEvents;
    expect(events).toEqual([
      { timestamp: 1, hidden: true },
      { timestamp: 100, hidden: false },
    ]);
    // Other editorBehavior arrays preserved.
    expect(data.metadata.mb.editorBehavior.aiCompletionEvents).toHaveLength(1);
  });

  it('seeds documentVisibilityEvents when none exist yet', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});
    await appendVisibilityEvent('s1', { timestamp: 7, hidden: true });
    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.documentVisibilityEvents).toEqual([
      { timestamp: 7, hidden: true },
    ]);
  });

  it('no-ops when session is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    await appendVisibilityEvent('missing', { timestamp: 1, hidden: true });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('appendAiCompletionEvents (Task 22 / Cluster A)', () => {
  it('appends to metadata.mb.editorBehavior.aiCompletionEvents preserving siblings', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            documentVisibilityEvents: [{ timestamp: 1, hidden: true }],
            aiCompletionEvents: [
              { timestamp: 100, accepted: true, lineNumber: 5, completionLength: 12 },
            ],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendAiCompletionEvents('s1', [
      {
        timestamp: 200,
        accepted: false,
        lineNumber: 7,
        completionLength: 8,
        shown: true,
        rejected: true,
        shownAt: 195,
        respondedAt: 205,
        documentVisibleMs: 10,
      },
    ]);

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.aiCompletionEvents;
    expect(events).toHaveLength(2);
    expect(events[1].lineNumber).toBe(7);
    expect(events[1].respondedAt).toBe(205);
    // Other editorBehavior arrays preserved.
    expect(data.metadata.mb.editorBehavior.documentVisibilityEvents).toHaveLength(1);
  });

  it('seeds aiCompletionEvents when none exist yet', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});
    await appendAiCompletionEvents('s1', [
      { timestamp: 1, accepted: true, lineNumber: 1, completionLength: 5 },
    ]);
    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.aiCompletionEvents).toHaveLength(1);
  });

  it('dedups by (lineNumber, shownAt, respondedAt) against existing events', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              {
                timestamp: 100,
                accepted: true,
                lineNumber: 5,
                completionLength: 12,
                shownAt: 95,
                respondedAt: 105,
              },
            ],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendAiCompletionEvents('s1', [
      // duplicate — same (line, shownAt, respondedAt)
      {
        timestamp: 999,
        accepted: true,
        lineNumber: 5,
        completionLength: 12,
        shownAt: 95,
        respondedAt: 105,
      },
      // novel
      {
        timestamp: 200,
        accepted: false,
        lineNumber: 7,
        completionLength: 4,
        shownAt: 195,
        respondedAt: 205,
      },
    ]);

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.aiCompletionEvents;
    expect(events).toHaveLength(2);
    expect(events.map((e: { lineNumber: number }) => e.lineNumber)).toEqual([5, 7]);
  });

  it('skips DB write when every incoming event is a duplicate', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              {
                timestamp: 100,
                accepted: true,
                lineNumber: 5,
                completionLength: 12,
                shownAt: 95,
                respondedAt: 105,
              },
            ],
          },
        },
      },
    });
    await appendAiCompletionEvents('s1', [
      {
        timestamp: 999,
        accepted: true,
        lineNumber: 5,
        completionLength: 12,
        shownAt: 95,
        respondedAt: 105,
      },
    ]);
    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops on empty input without touching prisma', async () => {
    await appendAiCompletionEvents('s1', []);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('no-ops when session is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    await appendAiCompletionEvents('missing', [
      { timestamp: 1, accepted: true, lineNumber: 1, completionLength: 5 },
    ]);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('calculatePassRate', () => {
  it('parses "N passed" only', () => {
    expect(calculatePassRate('===== 5 passed in 1.23s =====')).toBe(1);
  });

  it('parses "N passed, M failed"', () => {
    expect(calculatePassRate('===== 3 passed, 2 failed in 2.50s =====')).toBe(0.6);
  });

  it('returns 0 when no summary line present', () => {
    expect(calculatePassRate('irrelevant output')).toBe(0);
  });

  it('returns 0 when parsed total is zero', () => {
    expect(calculatePassRate('===== 0 passed in 0.01s =====')).toBe(0);
  });
});
