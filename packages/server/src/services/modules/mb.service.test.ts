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
