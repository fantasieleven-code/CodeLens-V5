/**
 * Task 22 / Pattern H gate — behavior:batch → metadata.mb.editorBehavior →
 * sDecisionLatencyQuality compute, end-to-end with no mocks between handler
 * and signal.
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
 * + sDecisionLatencyQuality.compute.
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

import { registerBehaviorHandlers } from '../../socket/behavior-handlers.js';
import { sDecisionLatencyQuality } from '../../signals/mb/cursor/s-decision-latency-quality.js';

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
