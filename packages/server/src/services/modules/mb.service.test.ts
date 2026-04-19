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
  appendChatEvents,
  appendDiffEvents,
  appendEditSessions,
  appendFileNavigation,
  appendVisibilityEvent,
  calculatePassRate,
  persistAudit,
  persistFinalTestRun,
  persistMbSubmission,
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

describe('appendChatEvents (Task 30a / Cluster A)', () => {
  it('appends to mb.editorBehavior.chatEvents and preserves Task 22 aiCompletionEvents sibling', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [{ timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 }],
            chatEvents: [{ timestamp: 100, prompt: 'old', responseLength: 10, duration: 200 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendChatEvents('s1', [
      { timestamp: 200, prompt: 'fix the inventory race', responseLength: 320, duration: 5000 },
    ]);

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.chatEvents;
    expect(events).toHaveLength(2);
    expect(events[1].prompt).toBe('fix the inventory race');
    expect(data.metadata.mb.editorBehavior.aiCompletionEvents).toHaveLength(1);
  });

  it('dedups by (timestamp, prompt prefix) against existing events', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            chatEvents: [{ timestamp: 100, prompt: 'fix the bug', responseLength: 5, duration: 50 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendChatEvents('s1', [
      // duplicate (same timestamp + prefix)
      { timestamp: 100, prompt: 'fix the bug', responseLength: 999, duration: 999 },
      // novel
      { timestamp: 200, prompt: 'verify the edge case', responseLength: 50, duration: 100 },
    ]);

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.chatEvents).toHaveLength(2);
  });

  it('no-ops on empty input without touching prisma', async () => {
    await appendChatEvents('s1', []);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('appendDiffEvents (Task 30a / Cluster A)', () => {
  it('appends to mb.editorBehavior.diffEvents preserving siblings', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            chatEvents: [{ timestamp: 50, prompt: 'p', responseLength: 1, duration: 1 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendDiffEvents('s1', [
      { timestamp: 200, accepted: true, linesAdded: 5, linesRemoved: 2 },
      { timestamp: 300, accepted: false, linesAdded: 3, linesRemoved: 0 },
    ]);

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.diffEvents;
    expect(events).toHaveLength(2);
    expect(events[0].accepted).toBe(true);
    expect(events[1].accepted).toBe(false);
    expect(data.metadata.mb.editorBehavior.chatEvents).toHaveLength(1);
  });

  it('dedups by (timestamp, accepted, linesAdded, linesRemoved)', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            diffEvents: [{ timestamp: 100, accepted: true, linesAdded: 5, linesRemoved: 2 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendDiffEvents('s1', [
      { timestamp: 100, accepted: true, linesAdded: 5, linesRemoved: 2 }, // duplicate
      { timestamp: 100, accepted: false, linesAdded: 5, linesRemoved: 2 }, // novel (accepted differs)
    ]);

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.diffEvents).toHaveLength(2);
  });

  it('no-ops on empty input without touching prisma', async () => {
    await appendDiffEvents('s1', []);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('appendFileNavigation (Task 30a / Cluster A)', () => {
  it('appends to mb.editorBehavior.fileNavigationHistory preserving siblings', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            diffEvents: [{ timestamp: 1, accepted: true, linesAdded: 1, linesRemoved: 0 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendFileNavigation('s1', [
      { timestamp: 100, filePath: 'src/a.py', action: 'open' },
      { timestamp: 200, filePath: 'src/b.py', action: 'switch' },
    ]);

    const { data } = update.mock.calls[0][0];
    const events = data.metadata.mb.editorBehavior.fileNavigationHistory;
    expect(events).toHaveLength(2);
    expect(events[0].action).toBe('open');
    expect(events[1].filePath).toBe('src/b.py');
    expect(data.metadata.mb.editorBehavior.diffEvents).toHaveLength(1);
  });

  it('dedups by (timestamp, filePath, action)', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            fileNavigationHistory: [{ timestamp: 100, filePath: 'src/a.py', action: 'open' }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendFileNavigation('s1', [
      { timestamp: 100, filePath: 'src/a.py', action: 'open' }, // duplicate
      { timestamp: 100, filePath: 'src/a.py', action: 'close' }, // novel (action differs)
    ]);

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.fileNavigationHistory).toHaveLength(2);
  });

  it('no-ops on empty input without touching prisma', async () => {
    await appendFileNavigation('s1', []);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('appendEditSessions (Task 30a / Cluster A)', () => {
  it('appends to mb.editorBehavior.editSessions preserving siblings', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            chatEvents: [{ timestamp: 50, prompt: 'p', responseLength: 1, duration: 1 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendEditSessions('s1', [
      { filePath: 'src/a.py', startTime: 100, endTime: 200, keystrokeCount: 30 },
    ]);

    const { data } = update.mock.calls[0][0];
    const sessions = data.metadata.mb.editorBehavior.editSessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].keystrokeCount).toBe(30);
    expect(data.metadata.mb.editorBehavior.chatEvents).toHaveLength(1);
  });

  it('dedups by (filePath, startTime, endTime)', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            editSessions: [{ filePath: 'src/a.py', startTime: 100, endTime: 200, keystrokeCount: 30 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await appendEditSessions('s1', [
      { filePath: 'src/a.py', startTime: 100, endTime: 200, keystrokeCount: 999 }, // duplicate
      { filePath: 'src/a.py', startTime: 300, endTime: 400, keystrokeCount: 50 }, // novel
    ]);

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.editSessions).toHaveLength(2);
  });

  it('no-ops on empty input without touching prisma', async () => {
    await appendEditSessions('s1', []);
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('persistFinalTestRun (Task 23 / Cluster B)', () => {
  it('writes mb.finalTestPassRate AND appends mb.editorBehavior.testRuns[]', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            testRuns: [{ timestamp: 1, passRate: 0.4, duration: 200 }],
            aiCompletionEvents: [
              { timestamp: 50, accepted: true, lineNumber: 3, completionLength: 5 },
            ],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistFinalTestRun('s1', { passRate: 0.8, duration: 350, timestamp: 1000 });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.finalTestPassRate).toBe(0.8);
    expect(data.metadata.mb.editorBehavior.testRuns).toEqual([
      { timestamp: 1, passRate: 0.4, duration: 200 },
      { timestamp: 1000, passRate: 0.8, duration: 350 },
    ]);
    // Pattern H v2.2: existing aiCompletionEvents must survive.
    expect(data.metadata.mb.editorBehavior.aiCompletionEvents).toHaveLength(1);
  });

  it('seeds testRuns + finalTestPassRate when no prior mb metadata', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistFinalTestRun('s1', { passRate: 1, duration: 100, timestamp: 5 });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.finalTestPassRate).toBe(1);
    expect(data.metadata.mb.editorBehavior.testRuns).toEqual([
      { timestamp: 5, passRate: 1, duration: 100 },
    ]);
  });

  it('overwrites finalTestPassRate with the latest run (last-write-wins)', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: { mb: { finalTestPassRate: 0.9 } },
    });
    update.mockResolvedValueOnce({});

    await persistFinalTestRun('s1', { passRate: 0.3, duration: 200, timestamp: 10 });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.finalTestPassRate).toBe(0.3);
  });

  it('no-ops when session is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    await persistFinalTestRun('missing', { passRate: 0.5, duration: 100 });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('persistMbSubmission (Task 23 / Pattern H v2.2 cross-Task regression defense)', () => {
  it('persists planning/standards/audit/finalFiles/finalTestPassRate', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistMbSubmission('s1', {
      planning: { decomposition: 'd', dependencies: 'dep', fallbackStrategy: 'f' },
      standards: { rulesContent: 'r' },
      audit: {
        violations: [{ exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'r1' }],
      },
      finalFiles: [{ path: 'src/foo.py', content: 'pass\n' }],
      finalTestPassRate: 0.75,
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
    });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.planning.decomposition).toBe('d');
    expect(data.metadata.mb.standards.rulesContent).toBe('r');
    expect(data.metadata.mb.audit.violations).toHaveLength(1);
    expect(data.metadata.mb.finalFiles).toEqual([{ path: 'src/foo.py', content: 'pass\n' }]);
    expect(data.metadata.mb.finalTestPassRate).toBe(0.75);
  });

  it('STRIPS editorBehavior — Task 22 persisted aiCompletionEvents survive', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              { timestamp: 100, accepted: true, lineNumber: 5, completionLength: 12 },
              { timestamp: 200, accepted: false, lineNumber: 9, completionLength: 4 },
            ],
            documentVisibilityEvents: [{ timestamp: 50, hidden: false }],
            testRuns: [{ timestamp: 80, passRate: 0.6, duration: 100 }],
          },
        },
      },
    });
    update.mockResolvedValueOnce({});

    // Frontend submission with EMPTY editorBehavior (intentional — see
    // ModuleBPage.tsx top-of-file comment). A naive spread-merge here would
    // wipe the 2 aiCompletionEvents, the visibility event, and the testRun.
    await persistMbSubmission('s1', {
      audit: { violations: [] },
      finalFiles: [],
      finalTestPassRate: 0,
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
    });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.mb.editorBehavior.aiCompletionEvents).toHaveLength(2);
    expect(data.metadata.mb.editorBehavior.documentVisibilityEvents).toHaveLength(1);
    expect(data.metadata.mb.editorBehavior.testRuns).toHaveLength(1);
  });

  it('preserves other top-level metadata keys (moduleC, signalResults, fileSnapshot)', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleC: [{ round: 1 }],
        signalResults: { sFoo: { value: 0.5 } },
        fileSnapshot: { 'a.py': { current: 'x', history: [] } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistMbSubmission('s1', {
      audit: { violations: [] },
      finalFiles: [],
      finalTestPassRate: 0.5,
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
    });

    const { data } = update.mock.calls[0][0];
    expect(data.metadata.moduleC).toEqual([{ round: 1 }]);
    expect(data.metadata.signalResults.sFoo.value).toBe(0.5);
    expect(data.metadata.fileSnapshot['a.py'].current).toBe('x');
  });

  it('no-ops when session is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    await persistMbSubmission('missing', {
      audit: { violations: [] },
      finalFiles: [],
      finalTestPassRate: 0,
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
    });
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
