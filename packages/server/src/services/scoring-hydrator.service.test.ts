/**
 * ScoringHydratorService — unit tests (Task 15a Deliverable B).
 *
 * Narrow coverage of the hydrator's read/pack/persist/degradation logic.
 * Full end-to-end (real signal registry → 46+ signals non-null → grade)
 * is covered by the Cold Start Validation harness
 * (`src/__tests__/cold-start-validation.test.ts`) — this file keeps the
 * unit surface small and fast: stub prisma + stub ExamDataService + stub
 * orchestrator delegate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { V5ScoringResult, SignalRegistry } from '@codelens-v5/shared';

const scoreSessionMock = vi.hoisted(() =>
  vi.fn<[unknown, unknown?], Promise<V5ScoringResult>>(),
);

vi.mock('./scoring-orchestrator.service.js', () => ({
  scoreSession: scoreSessionMock,
  __resetDefaultRegistryForTests: vi.fn(),
}));

vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

import {
  HydratorExamInstanceNotFoundError,
  HydratorInvalidMetadataError,
  HydratorSessionNotFoundError,
  ScoringHydratorService,
} from './scoring-hydrator.service.js';
import type { ExamDataService } from './exam-data.service.js';

// ───────────── helpers ─────────────

const STUB_RESULT: V5ScoringResult = {
  grade: 'A',
  composite: 72,
  dimensions: {
    technicalJudgment: 75,
    aiEngineering: 70,
    codeQuality: 70,
    communication: 72,
    metacognition: 68,
    systemDesign: 70,
  } as unknown as V5ScoringResult['dimensions'],
  confidence: 'high' as V5ScoringResult['confidence'],
  boundaryAnalysis: {} as V5ScoringResult['boundaryAnalysis'],
  reasoning: 'stubbed',
  signals: {},
  capabilityProfiles: [],
  cursorBehaviorLabel: undefined,
};

function buildPrisma(overrides: {
  findUnique?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): PrismaClient {
  return {
    session: {
      findUnique: overrides.findUnique ?? vi.fn(),
      update: overrides.update ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaClient;
}

function buildExamDataStub(
  overrides: Partial<{
    P0: Record<string, unknown> | null;
    MA: Record<string, unknown> | null;
    MB: Record<string, unknown> | null;
    MD: Record<string, unknown> | null;
    SE: Record<string, unknown> | null;
    MC: Record<string, unknown> | null;
  }> = {},
): ExamDataService {
  const pick = <K extends keyof typeof overrides>(
    key: K,
    dflt: Record<string, unknown>,
  ): Record<string, unknown> | null => (key in overrides ? (overrides[key] ?? null) : dflt);
  const stub = {
    getP0Data: vi.fn().mockResolvedValue(pick('P0', { systemCode: 'p0' })),
    getMAData: vi.fn().mockResolvedValue(pick('MA', { requirement: 'ma' })),
    getMBData: vi.fn().mockResolvedValue(pick('MB', { scaffold: 'mb' })),
    getMDData: vi.fn().mockResolvedValue(pick('MD', { constraints: ['c'] })),
    getSEData: vi.fn().mockResolvedValue(pick('SE', { decisionSummaryTemplate: 'se' })),
    getMCData: vi.fn().mockResolvedValue(pick('MC', { probeStrategies: {} })),
    getBusinessScenario: vi.fn(),
  };
  return stub as unknown as ExamDataService;
}

function fullMetadata() {
  return {
    suiteId: 'full_stack',
    moduleOrder: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    examInstanceId: 'exam-1',
    schemaVersion: 5,
    submissions: {},
    assessmentQuality: 'full',
    phase0: {
      codeReading: { l1Answer: 'l1', l2Answer: 'l2', l3Answer: 'l3', confidence: 0.7 },
      aiOutputJudgment: [{ choice: 'A', reasoning: 'r' }],
      aiClaimVerification: { response: 'r', submittedAt: 1 },
      decision: { choice: 'C', reasoning: 'r' },
    },
    moduleA: {
      round1: {
        schemeId: 'A',
        reasoning: 'r',
        structuredForm: { scenario: 's', tradeoff: 't', decision: 'd', verification: 'v' },
        challengeResponse: 'cr',
      },
      round2: { markedDefects: [] },
      round3: { correctVersionChoice: 'success', diffAnalysis: 'd', diagnosisText: 'dt' },
      round4: { response: 'r', submittedAt: 1, timeSpentSec: 30 },
    },
    mb: {
      editorBehavior: {
        aiCompletionEvents: [{ timestamp: 1, accepted: true, lineNumber: 1, completionLength: 1 }],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [{ timestamp: 1, passRate: 0.9, duration: 100 }],
      },
      finalFiles: [{ path: 'a.ts', content: 'x' }],
      finalTestPassRate: 0.9,
    },
    selfAssess: { confidence: 0.8, reasoning: 'r' },
    moduleC: [{ round: 1, question: 'q', answer: 'a' }],
  };
}

// ───────────── tests ─────────────

beforeEach(() => {
  scoreSessionMock.mockReset();
  scoreSessionMock.mockResolvedValue(STUB_RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ScoringHydratorService — happy path', () => {
  it('loads session + packs submissions + delegates to scoreSession + persists result', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 's1',
      metadata: fullMetadata(),
      scoringResult: null,
    });
    const update = vi.fn().mockResolvedValue({});
    const prisma = buildPrisma({ findUnique, update });
    const service = new ScoringHydratorService(prisma, buildExamDataStub());

    const out = await service.hydrateAndScore('s1');

    expect(scoreSessionMock).toHaveBeenCalledTimes(1);
    const [input] = scoreSessionMock.mock.calls[0];
    expect(input).toMatchObject({
      sessionId: 's1',
      suiteId: 'full_stack',
      participatingModules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    });
    const submissions = (input as { submissions: Record<string, unknown> }).submissions;
    expect(Object.keys(submissions).sort()).toEqual(
      ['mb', 'moduleA', 'moduleC', 'phase0', 'selfAssess'].sort(),
    );
    const examData = (input as { examData: Record<string, unknown> }).examData;
    expect(Object.keys(examData).sort()).toEqual(['MA', 'MB', 'MC', 'P0', 'SE'].sort());

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: 's1' },
      data: { scoringResult: STUB_RESULT },
    });

    expect(out.sessionId).toBe('s1');
    expect(out.suiteId).toBe('full_stack');
    expect(Object.keys(out.submissions).sort()).toEqual(
      ['mb', 'moduleA', 'moduleC', 'phase0', 'selfAssess'].sort(),
    );
    expect(out.scoringResult).toEqual(STUB_RESULT);
    expect(out.hydrationReport.phase0).toBe('present');
    expect(out.hydrationReport.mb).toBe('present');
    expect(out.hydrationReport.examData.P0).toBe('present');
  });

  it('falls back to SUITES.modules when metadata.moduleOrder is missing', async () => {
    const meta = fullMetadata();
    delete (meta as Record<string, unknown>).moduleOrder;
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: meta });
    const service = new ScoringHydratorService(
      buildPrisma({ findUnique }),
      buildExamDataStub(),
    );

    await service.hydrateAndScore('s1');

    const input = scoreSessionMock.mock.calls[0][0] as {
      participatingModules: readonly string[];
    };
    // full_stack default modules per SUITES.
    expect(input.participatingModules).toEqual([
      'phase0',
      'moduleA',
      'mb',
      'selfAssess',
      'moduleC',
    ]);
  });

  it('dryRun skips the scoringResult persist call', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: fullMetadata() });
    const update = vi.fn();
    const service = new ScoringHydratorService(
      buildPrisma({ findUnique, update }),
      buildExamDataStub(),
    );

    await service.hydrateAndScore('s1', { dryRun: true });

    expect(update).not.toHaveBeenCalled();
  });

  it('forwards the injected registry to scoreSession', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: fullMetadata() });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());
    const registry = { marker: 'custom' } as unknown as SignalRegistry;

    await service.hydrateAndScore('s1', { registry });

    const [, options] = scoreSessionMock.mock.calls[0];
    expect((options as { registry?: SignalRegistry }).registry).toBe(registry);
  });
});

describe('ScoringHydratorService — graceful degradation', () => {
  it('marks missing namespaces "absent" without throwing', async () => {
    const meta = fullMetadata();
    delete (meta as Record<string, unknown>).selfAssess;
    delete (meta as Record<string, unknown>).moduleC;
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: meta });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    const out = await service.hydrateAndScore('s1');

    expect(out.hydrationReport.selfAssess).toBe('absent');
    expect(out.hydrationReport.moduleC).toBe('absent');
    expect(out.submissions.selfAssess).toBeUndefined();
    expect(out.submissions.moduleC).toBeUndefined();
    expect(out.submissions.phase0).toBeDefined();
    const submissions = (scoreSessionMock.mock.calls[0][0] as { submissions: Record<string, unknown> })
      .submissions;
    expect(submissions.selfAssess).toBeUndefined();
    expect(submissions.moduleC).toBeUndefined();
    expect(submissions.phase0).toBeDefined();
  });

  it('marks malformed namespaces "malformed" without throwing', async () => {
    const meta = fullMetadata();
    // phase0 expected to be object-shaped; passing a string should narrow to malformed.
    (meta as Record<string, unknown>).phase0 = 'not-an-object';
    // moduleC expected to be an array; passing an object triggers malformed.
    (meta as Record<string, unknown>).moduleC = { foo: 'bar' };
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: meta });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    const out = await service.hydrateAndScore('s1');

    expect(out.hydrationReport.phase0).toBe('malformed');
    expect(out.hydrationReport.moduleC).toBe('malformed');
    expect(out.submissions.phase0).toBeUndefined();
    expect(out.submissions.moduleC).toBeUndefined();
    const submissions = (scoreSessionMock.mock.calls[0][0] as { submissions: Record<string, unknown> })
      .submissions;
    expect(submissions.phase0).toBeUndefined();
    expect(submissions.moduleC).toBeUndefined();
  });

  it('normalizes mb editorBehavior arrays even when absent in metadata', async () => {
    const meta = fullMetadata();
    (meta as Record<string, unknown>).mb = {};
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: meta });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    await service.hydrateAndScore('s1');

    const submissions = (scoreSessionMock.mock.calls[0][0] as {
      submissions: { mb?: { editorBehavior: Record<string, unknown[]>; finalTestPassRate: number } };
    }).submissions;
    expect(submissions.mb).toBeDefined();
    expect(submissions.mb?.editorBehavior.aiCompletionEvents).toEqual([]);
    expect(submissions.mb?.editorBehavior.chatEvents).toEqual([]);
    expect(submissions.mb?.editorBehavior.diffEvents).toEqual([]);
    expect(submissions.mb?.editorBehavior.fileNavigationHistory).toEqual([]);
    expect(submissions.mb?.editorBehavior.editSessions).toEqual([]);
    expect(submissions.mb?.editorBehavior.testRuns).toEqual([]);
    expect(submissions.mb?.finalTestPassRate).toBe(0);
  });

  it('tolerates missing ExamModule rows (status = absent) without failing', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: fullMetadata() });
    const examData = buildExamDataStub({ P0: null, SE: null });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), examData);

    const out = await service.hydrateAndScore('s1');

    expect(out.hydrationReport.examData.P0).toBe('absent');
    expect(out.hydrationReport.examData.SE).toBe('absent');
    expect(out.hydrationReport.examData.MA).toBe('present');
  });

  it('does NOT read metadata.submissions.* V4 ghost namespace as a fallback', async () => {
    // Phase 1 Q9: cutover-only. The hydrator must ignore this even if present.
    const meta = {
      suiteId: 'full_stack',
      examInstanceId: 'exam-1',
      moduleOrder: ['phase0'],
      submissions: {
        phase0: { sentinel: 'v4-ghost-should-not-be-read' },
      },
    };
    const findUnique = vi.fn().mockResolvedValue({ id: 's1', metadata: meta });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    const out = await service.hydrateAndScore('s1');

    expect(out.hydrationReport.phase0).toBe('absent');
    expect(out.submissions.phase0).toBeUndefined();
    const submissions = (scoreSessionMock.mock.calls[0][0] as { submissions: Record<string, unknown> })
      .submissions;
    expect(submissions.phase0).toBeUndefined();
  });
});

describe('ScoringHydratorService — Brief #20 C1 polling race cache', () => {
  it('returns cached scoringResult and skips scoreSession when Session.scoringResult is present', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 's1',
      metadata: fullMetadata(),
      scoringResult: STUB_RESULT,
    });
    const update = vi.fn();
    const service = new ScoringHydratorService(
      buildPrisma({ findUnique, update }),
      buildExamDataStub(),
    );

    const out = await service.hydrateAndScore('s1');

    expect(scoreSessionMock).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(out.cached).toBe(true);
    expect(out.scoringResult).toEqual(STUB_RESULT);
    expect(out.submissions.phase0).toBeDefined();
    expect(out.submissions.mb).toBeDefined();
    expect(out.suiteId).toBe('full_stack');
    expect(out.participatingModules).toEqual([
      'phase0',
      'moduleA',
      'mb',
      'selfAssess',
      'moduleC',
    ]);
  });

  it('re-hydrates and re-persists when forceRefresh=true even if cache present', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 's1',
      metadata: fullMetadata(),
      scoringResult: STUB_RESULT,
    });
    const update = vi.fn().mockResolvedValue({});
    const service = new ScoringHydratorService(
      buildPrisma({ findUnique, update }),
      buildExamDataStub(),
    );

    const out = await service.hydrateAndScore('s1', { forceRefresh: true });

    expect(scoreSessionMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(out.cached).toBeUndefined();
  });
});

describe('ScoringHydratorService — hard errors', () => {
  it('throws HydratorSessionNotFoundError when the session row is missing', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    await expect(service.hydrateAndScore('missing')).rejects.toBeInstanceOf(
      HydratorSessionNotFoundError,
    );
  });

  it('throws HydratorInvalidMetadataError when suiteId is missing or invalid', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: 's1', metadata: { examInstanceId: 'exam-1' } });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    await expect(service.hydrateAndScore('s1')).rejects.toBeInstanceOf(
      HydratorInvalidMetadataError,
    );
  });

  it('throws HydratorExamInstanceNotFoundError when examInstanceId is missing', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: 's1', metadata: { suiteId: 'full_stack' } });
    const service = new ScoringHydratorService(buildPrisma({ findUnique }), buildExamDataStub());

    await expect(service.hydrateAndScore('s1')).rejects.toBeInstanceOf(
      HydratorExamInstanceNotFoundError,
    );
  });
});
