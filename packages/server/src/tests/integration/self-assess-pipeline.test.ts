/**
 * Task 24 / Pattern H v2.2 gate — Cluster D end-to-end:
 *   (i)  self-assess:submit (V4 envelope) → handler normalizes → persist →
 *        sMetaCognition computes non-null with the expected weighted score.
 *   (ii) cross-Task regression defense — seed Task 22 aiCompletionEvents +
 *        Task 23 finalTestPassRate / finalFiles into metadata.mb, then fire
 *        self-assess:submit and assert the SE write does NOT clobber any
 *        sibling key. This is the third Pattern H gate (after Cluster A
 *        ingest and Cluster B persistToMetadata) and the first to prove a
 *        non-MB writer respects MB-namespaced state.
 *
 * Why integration: the dual-shape bridge (V4 socket payload → V5 persist
 * shape → V5 signal field-read) crosses three different field-name regimes.
 * Unit tests for each layer mock the next layer; only this test wires real
 * handler + real persist + real signal so a future drift in any layer's
 * field names shows up here, not in production silence.
 *
 * Mock surface: prisma (in-memory metadata) only. Real code under test:
 * registerSelfAssessHandlers + persistSelfAssess + sMetaCognition.
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

vi.mock('../../services/event-bus.service.js', () => ({
  eventBus: { emit: vi.fn() },
}));

import { registerSelfAssessHandlers } from '../../socket/self-assess-handlers.js';
import { sMetaCognition } from '../../signals/se/s-meta-cognition.js';

function makeSocket() {
  const ee = new EventEmitter();
  const emit = vi.fn();
  const socket = Object.assign(ee, { id: 'sock-cluster-d', emit }) as unknown as Parameters<
    typeof registerSelfAssessHandlers
  >[1];
  return { socket, emit, ee };
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

beforeEach(() => {
  store.metadata = {};
});

describe('Pattern H v2.2 — Cluster D pipeline (Task 24)', () => {
  it('(i) V4 envelope → handler normalize → persist → sMetaCognition computes non-null', async () => {
    const { socket, ee } = makeSocket();
    registerSelfAssessHandlers({} as never, socket);

    const sessionId = 'sess-cluster-d-i';
    // Reasoning ≥ 60 chars (CJK char count) so reasoningScore = 1.0 in the signal.
    // 16 CJK chars × 5 repeats = 80 chars > 60 target.
    const reasoning = '我反思认为方案选择有问题需要重新评估这个决定，'.repeat(5);
    const ack = vi.fn();

    await dispatchWithAck(
      ee,
      'self-assess:submit',
      {
        sessionId,
        // 60 / 100 = 0.6 → balancedConfidence peak (1 - 2|0.6-0.6| = 1.0)
        selfConfidence: 60,
        selfIdentifiedRisk: reasoning,
        responseTimeMs: 12345,
      },
      ack,
    );

    expect(ack).toHaveBeenCalledWith(true);

    // Persisted V5 shape (not V4 field names).
    const persisted = store.metadata as { selfAssess?: Record<string, unknown> };
    expect(persisted.selfAssess).toBeDefined();
    expect(persisted.selfAssess?.confidence).toBeCloseTo(0.6, 5);
    expect(persisted.selfAssess?.reasoning).toBe(reasoning);
    // V4-only field stays out — `responseTimeMs` is not a V5 consumer.
    expect(persisted.selfAssess).not.toHaveProperty('responseTimeMs');
    expect(persisted.selfAssess).not.toHaveProperty('selfConfidence');
    expect(persisted.selfAssess).not.toHaveProperty('selfIdentifiedRisk');

    // Signal compute against the persisted snapshot.
    const submissions = store.metadata as unknown as V5Submissions;
    const input: SignalInput = {
      sessionId,
      suiteId: 'full_stack',
      submissions,
      examData: {},
      participatingModules: ['selfAssess'],
    };
    const meta = await sMetaCognition.compute(input);
    expect(meta.value).not.toBeNull();
    // reasoningScore=1.0 × 0.5 + balancedConfidence=1.0 × 0.2 + reviewScore=0 × 0.3
    // = 0.5 + 0.2 + 0 = 0.7
    expect(meta.value).toBeCloseTo(0.7, 5);
  });

  it('(ii) cross-Task regression defense — Task 22 aiCompletionEvents + Task 23 finalTestPassRate / finalFiles survive a SE write', async () => {
    // Seed Task 22 + Task 23 state directly (those pipelines have their own
    // gates in mb-cluster-b-pipeline.test.ts; here we only assert SE writer
    // respects existing state).
    store.metadata = {
      mb: {
        editorBehavior: {
          aiCompletionEvents: [
            { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12, shown: true, shownAt: 100, respondedAt: 800, documentVisibleMs: 700 },
            { timestamp: 2, accepted: false, lineNumber: 6, completionLength: 8, shown: true, shownAt: 200, respondedAt: 1400, documentVisibleMs: 1200 },
          ],
          documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
          testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
        },
        finalTestPassRate: 0.8,
        finalFiles: [{ path: 'src/main.py', content: 'print("hello")' }],
        planning: { decomposition: 'a', dependencies: 'b', fallbackStrategy: 'c' },
        standards: { rulesContent: 'rule x' },
      },
      moduleC: [{ round: 1 }],
    };

    const { socket, ee } = makeSocket();
    registerSelfAssessHandlers({} as never, socket);

    const sessionId = 'sess-cluster-d-ii';
    const ack = vi.fn();
    await dispatchWithAck(
      ee,
      'self-assess:submit',
      {
        sessionId,
        selfConfidence: 70,
        selfIdentifiedRisk: '反思',
        responseTimeMs: 100,
      },
      ack,
    );
    expect(ack).toHaveBeenCalledWith(true);

    // Task 22 / 23 state intact post-SE write.
    const persisted = store.metadata as {
      mb?: {
        editorBehavior?: {
          aiCompletionEvents?: unknown[];
          documentVisibilityEvents?: unknown[];
          testRuns?: unknown[];
        };
        finalTestPassRate?: number;
        finalFiles?: unknown[];
        planning?: unknown;
        standards?: unknown;
      };
      moduleC?: unknown;
      selfAssess?: { confidence?: number; reasoning?: string };
    };
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
    expect(persisted.moduleC).toEqual([{ round: 1 }]);

    // SE state landed at the right namespace.
    expect(persisted.selfAssess?.confidence).toBeCloseTo(0.7, 5);
    expect(persisted.selfAssess?.reasoning).toBe('反思');
  });
});
