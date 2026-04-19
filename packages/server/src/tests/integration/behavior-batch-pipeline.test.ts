/**
 * Task 22 / Pattern H gate — behavior:batch → metadata.mb.editorBehavior →
 * sDecisionLatencyQuality compute, end-to-end with no mocks between handler
 * and signal.
 *
 * Task 30a / Pattern H 7th gate (3-Block suite below) — extends the same
 * behavior:batch handler with chat / diff / file / edit dispatch and proves
 * the full pipe for sPromptQuality + sFileNavigationEfficiency +
 * sTestFirstBehavior + sAiOutputReview. The Pattern H ladder closes on this
 * file: one unified behavior:batch envelope fans out to 5 editorBehavior
 * namespaces, and cross-Task regression defense is exercised against all 5
 * prior-cluster sibling namespaces simultaneously.
 *
 * Why this lives in tests/integration: the unit tests for behavior-handlers
 * mock mb.service, and the unit tests for mb.service mock prisma. Neither
 * proves the real pipe — handler envelope shape, persisted JSON shape, and
 * signal field-read shape — agree. Pattern H demands one test that ties the
 * three together so a future schema drift (rename field, add required key,
 * change number→string) shows up here, not in production silence.
 *
 * Mock surface: prisma only (in-memory replacement for session.metadata).
 * Real code under test: registerBehaviorHandlers + appendAiCompletionEvents
 * + appendChatEvents + appendDiffEvents + appendFileNavigation +
 * appendEditSessions + 4 Cluster A signal computes.
 */

import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MBModuleSpecific, SignalInput, V5Submissions } from '@codelens-v5/shared';

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

import { registerBehaviorHandlers } from '../../socket/behavior-handlers.js';
import { sDecisionLatencyQuality } from '../../signals/mb/cursor/s-decision-latency-quality.js';
import { sPromptQuality } from '../../signals/mb/stage2-exec/s-prompt-quality.js';
import { sFileNavigationEfficiency } from '../../signals/mb/cursor/s-file-navigation-efficiency.js';
import { sTestFirstBehavior } from '../../signals/mb/cursor/s-test-first-behavior.js';
import { sAiOutputReview } from '../../signals/mb/stage2-quality/s-ai-output-review.js';

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-pattern-h', emit }) as unknown as Parameters<
    typeof registerBehaviorHandlers
  >[1];
  return { socket, emit, ee };
}

function dispatch(ee: EventEmitter, event: string, payload: unknown): Promise<void> {
  const last = ee.listeners(event).at(-1) as (p: unknown) => Promise<void> | void;
  return Promise.resolve(last(payload));
}

function eventEnvelope(opts: {
  line: number;
  shownAt: number;
  respondedAt: number;
  documentVisibleMs: number;
  accepted: boolean;
}) {
  return {
    type: 'ai_completion_responded' as const,
    timestamp: new Date(opts.respondedAt).toISOString(),
    payload: {
      module: 'mb',
      filePath: `src/file-${opts.line}.ts`,
      line: opts.line,
      completionLength: 24,
      accepted: opts.accepted,
      shown: true,
      rejected: !opts.accepted,
      shownAt: opts.shownAt,
      respondedAt: opts.respondedAt,
      documentVisibleMs: opts.documentVisibleMs,
    },
  };
}

beforeEach(() => {
  store.metadata = {};
});

describe('Pattern H gate — behavior:batch → mb.editorBehavior → sDecisionLatencyQuality', () => {
  it('persisted shape matches what sDecisionLatencyQuality reads (S band)', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    // 6 events all in the 500-2000 ms "thoughtful" band → goodRangeRatio=1, S
    const sessionId = 'sess-pattern-h';
    const baseAt = 1_745_000_000_000;
    const events = [800, 1200, 950, 1500, 1800, 700].map((latency, i) =>
      eventEnvelope({
        line: i + 1,
        shownAt: baseAt + i * 5000,
        respondedAt: baseAt + i * 5000 + latency,
        documentVisibleMs: latency,
        accepted: i % 2 === 0,
      }),
    );

    await dispatch(ee, 'behavior:batch', { sessionId, events });

    // Inspect what landed in metadata.
    const persisted = (
      (store.metadata as { mb?: { editorBehavior?: { aiCompletionEvents?: unknown[] } } }).mb
        ?.editorBehavior?.aiCompletionEvents ?? []
    ) as Array<{ shownAt?: number; respondedAt?: number; documentVisibleMs?: number }>;
    expect(persisted).toHaveLength(6);
    expect(persisted[0].shownAt).toBe(baseAt);
    expect(persisted[0].documentVisibleMs).toBe(800);

    // Build SignalInput from the persisted submissions snapshot and compute.
    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {},
      participatingModules: ['mb'],
    };
    const result = await sDecisionLatencyQuality.compute(input);

    expect(result.value).not.toBeNull();
    expect(result.value).toBe(1.0);
  });

  it('returns null when fewer than 5 valid events persisted (sample-too-small fallback)', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    const sessionId = 'sess-small';
    const baseAt = 1_745_000_000_000;
    const events = [800, 1200].map((latency, i) =>
      eventEnvelope({
        line: i + 1,
        shownAt: baseAt + i * 5000,
        respondedAt: baseAt + i * 5000 + latency,
        documentVisibleMs: latency,
        accepted: true,
      }),
    );

    await dispatch(ee, 'behavior:batch', { sessionId, events });

    const submissions = store.metadata as unknown as V5Submissions;
    const result = await sDecisionLatencyQuality.compute({
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {},
      participatingModules: ['mb'],
    });
    expect(result.value).toBeNull();
  });

  it('multi-batch dedup: re-emitting the same events does not double-count', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    const sessionId = 'sess-dedup';
    const baseAt = 1_745_000_000_000;
    const events = [800, 1200, 950, 1500, 1800].map((latency, i) =>
      eventEnvelope({
        line: i + 1,
        shownAt: baseAt + i * 5000,
        respondedAt: baseAt + i * 5000 + latency,
        documentVisibleMs: latency,
        accepted: true,
      }),
    );

    await dispatch(ee, 'behavior:batch', { sessionId, events });
    await dispatch(ee, 'behavior:batch', { sessionId, events }); // duplicate flush
    await dispatch(ee, 'behavior:batch', { sessionId, events }); // and again

    const persisted = (
      (store.metadata as { mb?: { editorBehavior?: { aiCompletionEvents?: unknown[] } } }).mb
        ?.editorBehavior?.aiCompletionEvents ?? []
    ) as unknown[];
    expect(persisted).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Task 30a / Pattern H 7th gate — behavior:batch fan-out to 4 new pipelines.
//
// Block 1: 4-event-type dispatch coverage + silent-drop of unmapped types.
// Block 2: 5-namespace cross-Task regression defense (Task 22 + 23 mb fields +
//          phase0 + moduleA + moduleD + selfAssess + moduleC all survive).
// Block 3: Signal read verification — 4 AE signals compute non-null from the
//          persisted shape. sEditPatternQuality deferred to Task 30b (needs
//          client emit wiring).
// ═══════════════════════════════════════════════════════════════════════════

const BASE_AT = 1_745_000_000_000;

function chatEnvelope(opts: { offsetMs: number; prompt: string; responseLength?: number; duration?: number }) {
  return {
    type: 'chat_prompt_sent' as const,
    timestamp: new Date(BASE_AT + opts.offsetMs).toISOString(),
    payload: {
      prompt: opts.prompt,
      responseLength: opts.responseLength ?? 120,
      duration: opts.duration ?? 800,
    },
  };
}

function diffEnvelope(opts: {
  offsetMs: number;
  accepted: boolean;
  linesAdded: number;
  linesRemoved: number;
}) {
  return {
    type: (opts.accepted ? 'diff_accepted' : 'diff_rejected') as 'diff_accepted' | 'diff_rejected',
    timestamp: new Date(BASE_AT + opts.offsetMs).toISOString(),
    payload: {
      linesAdded: opts.linesAdded,
      linesRemoved: opts.linesRemoved,
    },
  };
}

function fileEnvelope(opts: {
  offsetMs: number;
  action: 'open' | 'close' | 'switch';
  filePath: string;
}) {
  const typeMap = {
    open: 'file_opened',
    close: 'file_closed',
    switch: 'file_switched',
  } as const;
  return {
    type: typeMap[opts.action] as 'file_opened' | 'file_closed' | 'file_switched',
    timestamp: new Date(BASE_AT + opts.offsetMs).toISOString(),
    payload: { filePath: opts.filePath },
  };
}

function editEnvelope(opts: {
  filePath: string;
  startOffsetMs: number;
  endOffsetMs: number;
  keystrokeCount: number;
}) {
  return {
    type: 'edit_session_completed' as const,
    timestamp: new Date(BASE_AT + opts.endOffsetMs).toISOString(),
    payload: {
      filePath: opts.filePath,
      startTime: BASE_AT + opts.startOffsetMs,
      endTime: BASE_AT + opts.endOffsetMs,
      keystrokeCount: opts.keystrokeCount,
    },
  };
}

describe('Pattern H 7th gate — behavior:batch → 4 new pipelines → Cluster A signals', () => {
  it('(Block 1) 4-event-type dispatch: chat + diff + file + edit each land in their own editorBehavior namespace, unmapped types silently drop', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    const sessionId = 'sess-7th-gate-block1';
    const events = [
      chatEnvelope({ offsetMs: 1000, prompt: 'Can you check the inventory race condition?' }),
      diffEnvelope({ offsetMs: 2000, accepted: true, linesAdded: 5, linesRemoved: 2 }),
      fileEnvelope({ offsetMs: 3000, action: 'open', filePath: 'src/service.py' }),
      editEnvelope({
        filePath: 'src/service.py',
        startOffsetMs: 4000,
        endOffsetMs: 9000,
        keystrokeCount: 80,
      }),
      // unmapped event — must silently drop, not error and not persist anywhere.
      { type: 'cursor_move', timestamp: new Date(BASE_AT + 5000).toISOString(), payload: { line: 10 } },
      { type: 'key_press', timestamp: new Date(BASE_AT + 6000).toISOString(), payload: { key: 'a' } },
    ];

    await dispatch(ee, 'behavior:batch', { sessionId, events });

    const persisted = store.metadata as {
      mb?: {
        editorBehavior?: {
          chatEvents?: unknown[];
          diffEvents?: unknown[];
          fileNavigationHistory?: unknown[];
          editSessions?: unknown[];
          aiCompletionEvents?: unknown[];
        };
      };
    };
    expect(persisted.mb?.editorBehavior?.chatEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.diffEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.fileNavigationHistory).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.editSessions).toHaveLength(1);
    // aiCompletionEvents untouched — batch had no ai_completion_responded.
    expect(persisted.mb?.editorBehavior?.aiCompletionEvents ?? []).toHaveLength(0);

    // Shape sanity — confirms persist layer wrote the exact field names
    // signals read (V5MBEditorBehavior schema contract).
    const chat = persisted.mb?.editorBehavior?.chatEvents?.[0] as { prompt: string; timestamp: number };
    expect(chat.prompt).toBe('Can you check the inventory race condition?');
    expect(chat.timestamp).toBe(BASE_AT + 1000);

    const diff = persisted.mb?.editorBehavior?.diffEvents?.[0] as {
      accepted: boolean;
      linesAdded: number;
      linesRemoved: number;
    };
    expect(diff.accepted).toBe(true);
    expect(diff.linesAdded).toBe(5);
    expect(diff.linesRemoved).toBe(2);

    const nav = persisted.mb?.editorBehavior?.fileNavigationHistory?.[0] as {
      filePath: string;
      action: string;
    };
    expect(nav.filePath).toBe('src/service.py');
    expect(nav.action).toBe('open');

    const edit = persisted.mb?.editorBehavior?.editSessions?.[0] as {
      filePath: string;
      startTime: number;
      endTime: number;
      keystrokeCount: number;
    };
    expect(edit.filePath).toBe('src/service.py');
    expect(edit.keystrokeCount).toBe(80);
  });

  it('(Block 2) cross-Task regression defense: Task 22 aiCompletionEvents + Task 23 testRuns/finalTestPassRate + phase0 + moduleA + moduleD + selfAssess + moduleC all survive a behavior:batch write', async () => {
    // Seed 5 sibling namespaces + Task 22/23 mb fields BEFORE dispatching the
    // batch. This is the 7th Pattern H gate: every prior cluster's persisted
    // state must remain byte-identical after the new 4-pipeline fan-out.
    store.metadata = {
      mb: {
        editorBehavior: {
          // Task 22 — must not be clobbered by the new appendXxx methods.
          aiCompletionEvents: [
            {
              timestamp: 1,
              accepted: true,
              lineNumber: 5,
              completionLength: 12,
              shown: true,
              shownAt: 100,
              respondedAt: 800,
              documentVisibleMs: 700,
            },
            {
              timestamp: 2,
              accepted: false,
              lineNumber: 6,
              completionLength: 8,
              shown: true,
              shownAt: 200,
              respondedAt: 1400,
              documentVisibleMs: 1200,
            },
          ],
          documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
          // Task 23 — testRuns.
          testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
        },
        finalTestPassRate: 0.8,
        finalFiles: [{ path: 'src/main.py', content: 'print("hello")' }],
        planning: { decomposition: 'a', dependencies: 'b', fallbackStrategy: 'c' },
        standards: { rulesContent: 'rule x' },
      },
      selfAssess: { confidence: 0.7, reasoning: '反思' },
      phase0: {
        codeReading: { l1Answer: 'L1', l2Answer: 'L2', l3Answer: 'L3', confidence: 0.6 },
        decision: { choice: 'C', reasoning: '止血' },
      },
      moduleA: {
        round1: { schemeId: 'A', reasoning: 'MA reasoning' },
        round4: { response: 'r4', submittedAt: 1700000000000, timeSpentSec: 60 },
      },
      moduleD: { tradeoffText: 'md-tradeoff', subModules: [{ name: 'Svc', responsibility: 'r' }] },
      moduleC: [{ round: 1 }],
    };

    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    const sessionId = 'sess-7th-gate-block2';
    const events = [
      chatEnvelope({ offsetMs: 10_000, prompt: 'verify edge case of qty=0' }),
      diffEnvelope({ offsetMs: 11_000, accepted: false, linesAdded: 3, linesRemoved: 1 }),
      fileEnvelope({ offsetMs: 12_000, action: 'open', filePath: 'src/new.py' }),
      editEnvelope({
        filePath: 'src/new.py',
        startOffsetMs: 13_000,
        endOffsetMs: 18_000,
        keystrokeCount: 42,
      }),
    ];
    await dispatch(ee, 'behavior:batch', { sessionId, events });

    const persisted = store.metadata as {
      mb?: {
        editorBehavior?: {
          aiCompletionEvents?: unknown[];
          documentVisibilityEvents?: unknown[];
          testRuns?: unknown[];
          chatEvents?: unknown[];
          diffEvents?: unknown[];
          fileNavigationHistory?: unknown[];
          editSessions?: unknown[];
        };
        finalTestPassRate?: number;
        finalFiles?: unknown[];
        planning?: unknown;
        standards?: unknown;
      };
      selfAssess?: { confidence?: number; reasoning?: string };
      phase0?: { decision?: { choice?: string; reasoning?: string }; codeReading?: { l1Answer?: string } };
      moduleA?: { round1?: { schemeId?: string }; round4?: { response?: string } };
      moduleD?: { tradeoffText?: string };
      moduleC?: unknown;
    };

    // ── Task 22 / Task 23 mb.* byte-identical ──
    expect(persisted.mb?.editorBehavior?.aiCompletionEvents).toHaveLength(2);
    expect(persisted.mb?.editorBehavior?.documentVisibilityEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.testRuns).toHaveLength(1);
    expect(persisted.mb?.finalTestPassRate).toBe(0.8);
    expect(persisted.mb?.finalFiles).toEqual([{ path: 'src/main.py', content: 'print("hello")' }]);
    expect(persisted.mb?.planning).toEqual({
      decomposition: 'a',
      dependencies: 'b',
      fallbackStrategy: 'c',
    });
    expect(persisted.mb?.standards).toEqual({ rulesContent: 'rule x' });

    // ── 5 prior-cluster sibling namespaces untouched ──
    expect(persisted.selfAssess).toEqual({ confidence: 0.7, reasoning: '反思' });
    expect(persisted.phase0?.decision).toEqual({ choice: 'C', reasoning: '止血' });
    expect(persisted.phase0?.codeReading?.l1Answer).toBe('L1');
    expect(persisted.moduleA?.round1?.schemeId).toBe('A');
    expect(persisted.moduleA?.round4?.response).toBe('r4');
    expect(persisted.moduleD?.tradeoffText).toBe('md-tradeoff');
    expect(persisted.moduleC).toEqual([{ round: 1 }]);

    // ── New 4 pipelines populated ──
    expect(persisted.mb?.editorBehavior?.chatEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.diffEvents).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.fileNavigationHistory).toHaveLength(1);
    expect(persisted.mb?.editorBehavior?.editSessions).toHaveLength(1);
  });

  it('(Block 3) signal read verification: 4 Cluster A signals compute non-null from behavior:batch-persisted shape', async () => {
    const { socket, ee } = makeSocket();
    registerBehaviorHandlers({} as never, socket);

    const sessionId = 'sess-7th-gate-block3';

    // Construct a batch that lights up all 4 signals' minimal requirements.
    //
    //  sPromptQuality            ← chatEvents with substantive prompts
    //  sFileNavigationEfficiency ← fileNavigationHistory with opens +
    //                              examData.MB.scaffold.dependencyOrder
    //  sTestFirstBehavior        ← first file_opened is a tests/ path within
    //                              60s of earliest editorBehavior event
    //  sAiOutputReview           ← chatEvents with review keywords AND
    //                              diffEvents with at least one rejected diff
    //
    // sEditPatternQuality is intentionally NOT covered here — its client emit
    // lands in Task 30b; keystrokeCount alone is insufficient.
    const events = [
      // Test file opened first → sTestFirstBehavior tier 1.0 (Δt=0 < 60s).
      fileEnvelope({ offsetMs: 1000, action: 'open', filePath: 'tests/test_service.py' }),
      fileEnvelope({ offsetMs: 5000, action: 'open', filePath: 'src/service.py' }),
      fileEnvelope({ offsetMs: 10_000, action: 'open', filePath: 'src/controller.py' }),
      // sPromptQuality: >80 chars, specificity (backticks + numeric + ClassName),
      // context ("because"). sAiOutputReview: review markers ("check", "verify",
      // "edge case").
      chatEnvelope({
        offsetMs: 20_000,
        prompt:
          'Please check whether `decrement_inventory` in InventoryRepository has a TOCTOU race because 100 concurrent processes may drive the count below 0 — verify the edge case when qty is 0.',
      }),
      chatEnvelope({
        offsetMs: 30_000,
        prompt:
          'Verify the bug in `processOrder()` so that the response time stays under 100ms in peak traffic scenarios.',
      }),
      // sAiOutputReview: at least one rejected diff so diffRejectRate > 0.
      diffEnvelope({ offsetMs: 40_000, accepted: true, linesAdded: 5, linesRemoved: 2 }),
      diffEnvelope({ offsetMs: 45_000, accepted: false, linesAdded: 3, linesRemoved: 0 }),
      editEnvelope({
        filePath: 'src/service.py',
        startOffsetMs: 50_000,
        endOffsetMs: 60_000,
        keystrokeCount: 120,
      }),
    ];
    await dispatch(ee, 'behavior:batch', { sessionId, events });

    const submissions = store.metadata as unknown as V5Submissions;

    // Build examData.MB with a scaffold so sFileNavigationEfficiency can
    // compute kendall tau. Only scaffold.dependencyOrder is consulted by the
    // 4 signals in this block; other fields can be minimal stubs.
    const mbExam: MBModuleSpecific = {
      featureRequirement: {
        description: 'feat',
        acceptanceCriteria: ['a', 'b', 'c', 'd', 'e'],
      },
      scaffold: {
        files: [],
        tests: [],
        dependencyOrder: ['src/repo.py', 'src/service.py', 'src/controller.py'],
      },
      harnessReference: { keyConstraints: [], constraintCategories: [] },
      violationExamples: [],
    };

    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: { MB: mbExam as unknown as Record<string, unknown> },
      participatingModules: ['mb'],
    };

    const prompt = await sPromptQuality.compute(input);
    const fileNav = await sFileNavigationEfficiency.compute(input);
    const testFirst = await sTestFirstBehavior.compute(input);
    const aiReview = await sAiOutputReview.compute(input);

    expect(prompt.value, 'sPromptQuality').not.toBeNull();
    expect(fileNav.value, 'sFileNavigationEfficiency').not.toBeNull();
    expect(testFirst.value, 'sTestFirstBehavior').not.toBeNull();
    expect(aiReview.value, 'sAiOutputReview').not.toBeNull();

    // Loose bounds — specific calibration lives in per-signal unit tests.
    expect(prompt.value as number).toBeGreaterThan(0);
    expect(fileNav.value as number).toBeGreaterThanOrEqual(0);
    expect(testFirst.value).toBe(1.0); // tests/ opened within 60s of earliest event
    expect(aiReview.value as number).toBeGreaterThan(0);
  });
});
