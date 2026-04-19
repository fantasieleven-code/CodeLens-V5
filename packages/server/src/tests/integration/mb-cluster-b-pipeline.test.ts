/**
 * Task 23 / Pattern H v2.2 gate — Cluster B end-to-end:
 *   (i)   v5:mb:run_test → metadata.mb.finalTestPassRate + editorBehavior.testRuns →
 *         sIterationEfficiency + sChallengeComplete compute non-null
 *   (ii)  cross-Task regression defense — behavior:batch persists
 *         aiCompletionEvents (Task 22), THEN v5:mb:submit fires with hardcoded
 *         EMPTY editorBehavior arrays. Verify the aiCompletionEvents survive
 *         AND sDecisionLatencyQuality still computes non-null.
 *   (iii) v5:mb:submit → metadata.mb.finalFiles → sPrecisionFix computes against
 *         examData.MB.scaffold[].knownIssueLines
 *
 * Why integration: unit tests for mb-handlers mock mb.service; unit tests for
 * mb.service mock prisma. Neither proves the full pipe — handler payload shape,
 * persisted JSON shape, and signal field-read shape — agree. Pattern H v2.2
 * demands one test that ties them together so a future schema drift shows up
 * here, not in production silence.
 *
 * Mock surface: prisma (in-memory metadata) + sandboxFactory (canned pytest
 * stdout). Real code under test: registerMBHandlers + registerBehaviorHandlers
 * + persistFinalTestRun + persistMbSubmission + appendAiCompletionEvents +
 * sIterationEfficiency / sChallengeComplete / sDecisionLatencyQuality /
 * sPrecisionFix.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SignalInput, V5Submissions } from '@codelens-v5/shared';

const store = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
}));

vi.mock('../../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(async () => ({ metadata: store.metadata })),
      update: vi.fn(async ({ data }: { data: { metadata: Record<string, unknown> } }) => {
        store.metadata = data.metadata;
        return { metadata: store.metadata };
      }),
    },
  },
}));

const sandboxMocks = vi.hoisted(() => ({
  create: vi.fn(),
  writeFiles: vi.fn(),
  execute: vi.fn(),
  destroy: vi.fn(),
  getProvider: vi.fn(),
}));

vi.mock('../../services/sandbox/index.js', () => ({
  sandboxFactory: { getProvider: sandboxMocks.getProvider },
}));

vi.mock('../../services/event-bus.service.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: { get: vi.fn(async () => 'sys') },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: { stream: vi.fn(), generate: vi.fn() },
}));

vi.mock('../../lib/langfuse.js', () => ({
  getLangfuse: async () => ({ trace: vi.fn() }),
}));

import { registerMBHandlers } from '../../socket/mb-handlers.js';
import { registerBehaviorHandlers } from '../../socket/behavior-handlers.js';
import { fileSnapshotService } from '../../services/file-snapshot.service.js';
import { sIterationEfficiency } from '../../signals/mb/stage2-exec/s-iteration-efficiency.js';
import { sChallengeComplete } from '../../signals/mb/stage2-quality/s-challenge-complete.js';
import { sDecisionLatencyQuality } from '../../signals/mb/cursor/s-decision-latency-quality.js';
import { sPrecisionFix } from '../../signals/mb/stage2-exec/s-precision-fix.js';

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-cluster-b', emit }) as unknown as Parameters<
    typeof registerMBHandlers
  >[1];
  return { socket, emit, ee };
}

function dispatch(ee: EventEmitter, event: string, payload: unknown): Promise<void> {
  const last = ee.listeners(event).at(-1) as (p: unknown) => Promise<void> | void;
  return Promise.resolve(last(payload));
}

function dispatchWithAck(
  ee: EventEmitter,
  event: string,
  payload: unknown,
  ack: (ok: boolean) => void,
): Promise<void> {
  const last = ee.listeners(event).at(-1) as (
    p: unknown,
    a: (ok: boolean) => void,
  ) => Promise<void> | void;
  return Promise.resolve(last(payload, ack));
}

function emptyEditorBehavior() {
  return {
    aiCompletionEvents: [],
    chatEvents: [],
    diffEvents: [],
    fileNavigationHistory: [],
    editSessions: [],
    testRuns: [],
  } as const;
}

beforeEach(() => {
  store.metadata = {};
  fileSnapshotService.__resetAllForTests();
  for (const fn of Object.values(sandboxMocks)) fn.mockReset?.();
});

describe('Pattern H v2.2 — Cluster B pipeline (Task 23)', () => {
  it('(i) run_test persists finalTestPassRate + testRuns → sIterationEfficiency / sChallengeComplete compute non-null', async () => {
    sandboxMocks.getProvider.mockResolvedValue({
      create: sandboxMocks.create,
      writeFiles: sandboxMocks.writeFiles,
      execute: sandboxMocks.execute,
      destroy: sandboxMocks.destroy,
    });
    sandboxMocks.create.mockResolvedValue({ id: 'sbx-1' });
    sandboxMocks.execute.mockResolvedValue({
      stdout: '===== 4 passed, 1 failed in 1.20s =====',
      stderr: '',
      exitCode: 1,
      durationMs: 1200,
    });
    sandboxMocks.destroy.mockResolvedValue(undefined);

    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);

    const sessionId = 'sess-cluster-b-i';
    await dispatch(ee, 'v5:mb:run_test', { sessionId });

    // Persisted shape: 4/(4+1) = 0.8
    const persisted = store.metadata as {
      mb?: {
        finalTestPassRate?: number;
        editorBehavior?: { testRuns?: Array<{ passRate: number; duration: number }> };
      };
    };
    expect(persisted.mb?.finalTestPassRate).toBeCloseTo(0.8, 5);
    expect(persisted.mb?.editorBehavior?.testRuns).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.testRuns?.[0].passRate).toBeCloseTo(0.8, 5);

    // Signal compute against the persisted submission snapshot.
    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {},
      participatingModules: ['mb'],
    };

    const iteration = await sIterationEfficiency.compute(input);
    expect(iteration.value).not.toBeNull();
    // qualityScore=0.8 * 0.6 + iterationScore(5/max(1, 1+0)=5 → clamp 1) * 0.4 = 0.88
    expect(iteration.value).toBeCloseTo(0.88, 5);

    const challenge = await sChallengeComplete.compute(input);
    expect(challenge.value).not.toBeNull();
    // passScore=0.8 * 0.8 + testRunsScore(1/3) * 0.2 ≈ 0.7066…
    expect(challenge.value).toBeGreaterThan(0.7);
    expect(challenge.value).toBeLessThan(0.72);
  });

  it('(ii) cross-Task regression defense — submit with EMPTY editorBehavior preserves Task 22 aiCompletionEvents AND sDecisionLatencyQuality still computes non-null', async () => {
    const { socket: mbSocket, ee: mbEe } = makeSocket();
    registerMBHandlers({} as never, mbSocket);
    const { socket: behSocket, ee: behEe } = makeSocket();
    registerBehaviorHandlers({} as never, behSocket);

    const sessionId = 'sess-cluster-b-ii';

    // Step 1 (Task 22 path): persist 6 ai_completion_responded events all in
    // the 500-2000 ms "thoughtful" band → sDecisionLatencyQuality should land at S=1.0
    const baseAt = 1_745_000_000_000;
    const events = [800, 1200, 950, 1500, 1800, 700].map((latency, i) => ({
      type: 'ai_completion_responded' as const,
      timestamp: new Date(baseAt + i * 5000 + latency).toISOString(),
      payload: {
        module: 'mb',
        filePath: `src/file-${i}.ts`,
        line: i + 1,
        completionLength: 24,
        accepted: i % 2 === 0,
        shown: true,
        rejected: i % 2 !== 0,
        shownAt: baseAt + i * 5000,
        respondedAt: baseAt + i * 5000 + latency,
        documentVisibleMs: latency,
      },
    }));
    await dispatch(behEe, 'behavior:batch', { sessionId, events });

    // Sanity: 6 events landed.
    {
      const persisted = store.metadata as {
        mb?: { editorBehavior?: { aiCompletionEvents?: unknown[] } };
      };
      expect(persisted.mb?.editorBehavior?.aiCompletionEvents).toHaveLength(6);
    }

    // Step 2 (Task 23 v5:mb:submit): submit with hardcoded EMPTY editorBehavior
    // — exactly what ModuleBPage.tsx sends. A naive spread-merge would clobber
    // the 6 aiCompletionEvents persisted in Step 1.
    const ack = vi.fn();
    await dispatchWithAck(
      mbEe,
      'v5:mb:submit',
      {
        sessionId,
        submission: {
          planning: { decomposition: 'd', dependencies: 'dep', fallbackStrategy: 'f' },
          standards: { rulesContent: 'r' },
          audit: { violations: [] },
          finalFiles: [],
          finalTestPassRate: 0.5,
          editorBehavior: emptyEditorBehavior(),
        },
      },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    // Defense assertion: aiCompletionEvents MUST survive the submit.
    const persisted = store.metadata as {
      mb?: {
        planning?: unknown;
        finalTestPassRate?: number;
        editorBehavior?: { aiCompletionEvents?: unknown[] };
      };
    };
    expect(persisted.mb?.planning).toBeDefined();
    expect(persisted.mb?.finalTestPassRate).toBe(0.5);
    expect(persisted.mb?.editorBehavior?.aiCompletionEvents).toHaveLength(6);

    // sDecisionLatencyQuality (Task 22 signal) still computes S band (1.0).
    const submissions = store.metadata as unknown as V5Submissions;
    const decision = await sDecisionLatencyQuality.compute({
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {},
      participatingModules: ['mb'],
    });
    expect(decision.value).toBe(1.0);
  });

  it('(iii) v5:mb:submit persists finalFiles → sPrecisionFix computes against examData.MB.scaffold[].knownIssueLines', async () => {
    const { socket, ee } = makeSocket();
    registerMBHandlers({} as never, socket);

    const sessionId = 'sess-cluster-b-iii';
    const ack = vi.fn();

    // Scaffold: line 2 is the buggy line ("return None"); candidate fixes it
    // ("return total"). sPrecisionFix should see the diff at line 2.
    const scaffoldContent = 'def sum(items):\n  return None\n';
    const fixedContent = 'def sum(items):\n  return sum(items)\n';

    await dispatchWithAck(
      ee,
      'v5:mb:submit',
      {
        sessionId,
        submission: {
          audit: { violations: [] },
          finalFiles: [{ path: 'src/sum.py', content: fixedContent }],
          finalTestPassRate: 1,
          editorBehavior: emptyEditorBehavior(),
        },
      },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    const persistedFinalFiles = (
      store.metadata as { mb?: { finalFiles?: Array<{ path: string; content: string }> } }
    ).mb?.finalFiles;
    expect(persistedFinalFiles).toEqual([{ path: 'src/sum.py', content: fixedContent }]);

    const submissions = store.metadata as unknown as V5Submissions;
    const result = await sPrecisionFix.compute({
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {
        MB: {
          featureRequirement: { description: '', acceptanceCriteria: [] },
          scaffold: {
            files: [{ path: 'src/sum.py', content: scaffoldContent, knownIssueLines: [2] }],
            tests: [],
            dependencyOrder: ['src/sum.py'],
          },
          harnessReference: { keyConstraints: [], constraintCategories: [] },
          violationExamples: [],
        },
      },
      participatingModules: ['mb'],
    });

    expect(result.value).not.toBeNull();
    // coverage = 1/1 = 1; fileAccuracy = 1/1 = 1; weighted = 0.7 + 0.3 = 1.0
    expect(result.value).toBe(1);
  });
});
