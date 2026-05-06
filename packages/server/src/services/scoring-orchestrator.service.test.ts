/**
 * Task 17 — ScoringOrchestrator unit tests.
 *
 * Isolated wiring coverage for `scoreSession()`: the orchestrator composes
 * the 5 pure primitives (scoring.service.ts) + the registry, but has no
 * data-driven fixture work of its own. Those are covered by the Golden
 * Path integration suite (`tests/integration/golden-path.test.ts`).
 *
 * We mock langfuse before importing to avoid the real `getLangfuse()` →
 * `config/env.ts` → process.exit cascade when DATABASE_URL is absent; the
 * same pattern the signal-registry test uses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScoreSessionInput,
  SignalDefinition,
  SignalInput,
  SignalRegistry,
  SignalResult,
} from '@codelens-v5/shared';
import { V5Dimension } from '@codelens-v5/shared';

vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

import {
  SCORING_RESULT_ALGORITHM_VERSION,
  __resetDefaultRegistryForTests,
  computeCursorBehaviorLabel,
  scoreSession,
} from './scoring-orchestrator.service.js';

// ──────────────────────────── helpers ────────────────────────────

function okResult(value: number, algo = 'test@v1'): SignalResult {
  return {
    value,
    evidence: [
      {
        source: 'test',
        excerpt: 'deterministic',
        contribution: value,
      },
    ],
    computedAt: Date.now(),
    algorithmVersion: algo,
  };
}

/**
 * Stub registry that returns a fixed `SignalResults` map, so we can assert
 * the orchestrator's plumbing (dimension aggregation, composite, grade
 * decision, capability profiles) without exercising real signal compute.
 */
class StubRegistry implements SignalRegistry {
  constructor(
    private readonly defs: SignalDefinition[],
    private readonly valueFn: (id: string) => number,
  ) {}

  register(): void {
    throw new Error('StubRegistry.register is not used in tests');
  }

  async computeAll(_input: SignalInput): Promise<Record<string, SignalResult>> {
    const out: Record<string, SignalResult> = {};
    for (const def of this.defs) {
      out[def.id] = okResult(this.valueFn(def.id));
    }
    return out;
  }

  getDimensionSignals(dim: V5Dimension): SignalDefinition[] {
    return this.defs.filter((d) => d.dimension === dim);
  }

  getSignalCount(): number {
    return this.defs.length;
  }

  listSignals(): SignalDefinition[] {
    return this.defs;
  }
}

function makeDef(
  id: string,
  dimension: V5Dimension,
  moduleSource: SignalDefinition['moduleSource'] = 'MA',
): SignalDefinition {
  return {
    id,
    dimension,
    moduleSource,
    isLLMWhitelist: false,
    compute: async () => okResult(0.8),
  };
}

function makeInput(): ScoreSessionInput {
  return {
    sessionId: 'sess-orchestrator-test',
    suiteId: 'full_stack',
    submissions: {},
    examData: {},
    participatingModules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
  };
}

function makeCursorBehavior(overrides: Partial<NonNullable<ScoreSessionInput['submissions']['mb']>['editorBehavior']> = {}): NonNullable<ScoreSessionInput['submissions']['mb']>['editorBehavior'] {
  return {
    aiCompletionEvents: [
      { timestamp: 1, accepted: true, lineNumber: 1, completionLength: 20, documentVisibleMs: 1200 },
      { timestamp: 2, accepted: false, lineNumber: 2, completionLength: 18, documentVisibleMs: 1300 },
      { timestamp: 3, accepted: true, lineNumber: 3, completionLength: 24, documentVisibleMs: 1100 },
      { timestamp: 4, accepted: false, lineNumber: 4, completionLength: 15, documentVisibleMs: 1000 },
      { timestamp: 5, accepted: true, lineNumber: 5, completionLength: 19, documentVisibleMs: 1400 },
    ],
    chatEvents: [
      { timestamp: 6, prompt: 'review this approach', responseLength: 300, duration: 1000, documentVisibleMs: 1500 },
      { timestamp: 7, prompt: 'compare alternatives', responseLength: 250, duration: 900, documentVisibleMs: 1600 },
    ],
    diffEvents: [],
    fileNavigationHistory: [
      { timestamp: 8, filePath: 'src/a.ts', action: 'open' },
      { timestamp: 9, filePath: 'src/b.ts', action: 'switch' },
    ],
    editSessions: [
      { filePath: 'src/a.ts', startTime: 10, endTime: 20, keystrokeCount: 30 },
      { filePath: 'src/b.ts', startTime: 21, endTime: 30, keystrokeCount: 25 },
    ],
    testRuns: [{ timestamp: 31, passRate: 1, duration: 1000 }],
    ...overrides,
  };
}

// ──────────────────────────── tests ────────────────────────────

beforeEach(() => {
  __resetDefaultRegistryForTests();
});

afterEach(() => {
  __resetDefaultRegistryForTests();
});

describe('scoreSession — wiring', () => {
  it('returns a V5ScoringResult with all required fields', async () => {
    const defs: SignalDefinition[] = [
      makeDef('sA', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sB', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sC', V5Dimension.CODE_QUALITY, 'MB'),
      makeDef('sD', V5Dimension.COMMUNICATION, 'MB'),
      makeDef('sE', V5Dimension.METACOGNITION, 'SE'),
    ];
    const registry = new StubRegistry(defs, () => 0.8);

    const result = await scoreSession(makeInput(), { registry });

    expect(result).toMatchObject({
      computedAt: expect.any(Number),
      algorithmVersion: SCORING_RESULT_ALGORITHM_VERSION,
      grade: expect.any(String),
      composite: expect.any(Number),
      dimensions: expect.any(Object),
      confidence: expect.any(String),
      boundaryAnalysis: expect.any(Object),
      reasoning: expect.any(String),
      signals: expect.any(Object),
      capabilityProfiles: expect.any(Array),
    });
    expect(Number.isFinite(result.computedAt)).toBe(true);
    expect(Object.keys(result.signals)).toEqual(['sA', 'sB', 'sC', 'sD', 'sE']);
  });

  it('converts 0-1 signal values to 0-100 dimension scores', async () => {
    const defs = [makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT)];
    const registry = new StubRegistry(defs, () => 0.8);

    const result = await scoreSession(makeInput(), { registry });

    expect(result.dimensions[V5Dimension.TECHNICAL_JUDGMENT]).toBe(80);
  });

  it('assigns a high grade when all dimensions score high', async () => {
    // Cover every participating dimension so no floor fails.
    const defs: SignalDefinition[] = [
      makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sAE', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sCQ', V5Dimension.CODE_QUALITY, 'MB'),
      makeDef('sCM', V5Dimension.COMMUNICATION, 'MB'),
      makeDef('sMC', V5Dimension.METACOGNITION, 'SE'),
      makeDef('sSD', V5Dimension.SYSTEM_DESIGN, 'MD'),
    ];
    const registry = new StubRegistry(defs, () => 0.9);

    const result = await scoreSession(makeInput(), { registry });
    expect(['A', 'S', 'S+']).toContain(result.grade);
    expect(result.composite).toBeGreaterThanOrEqual(75);
  });

  it('assigns a low grade when every signal is near zero', async () => {
    const defs: SignalDefinition[] = [
      makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sAE', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sCQ', V5Dimension.CODE_QUALITY, 'MB'),
      makeDef('sMC', V5Dimension.METACOGNITION, 'SE'),
    ];
    const registry = new StubRegistry(defs, () => 0.1);

    const result = await scoreSession(makeInput(), { registry });
    expect(['D', 'C']).toContain(result.grade);
  });

  it('builds capability profiles for every participating dimension bundle', async () => {
    const defs: SignalDefinition[] = [
      makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sAE', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sCQ', V5Dimension.CODE_QUALITY, 'MB'),
      makeDef('sCM', V5Dimension.COMMUNICATION, 'MB'),
      makeDef('sMC', V5Dimension.METACOGNITION, 'SE'),
    ];
    const registry = new StubRegistry(defs, () => 0.7);

    const result = await scoreSession(makeInput(), { registry });
    expect(result.capabilityProfiles.length).toBeGreaterThan(0);
    for (const profile of result.capabilityProfiles) {
      expect(profile.score).toBeGreaterThanOrEqual(0);
      expect(profile.score).toBeLessThanOrEqual(100);
      expect(profile.label).toBeTruthy();
    }
  });

  it('returns cursorBehaviorLabel = undefined when MB behavior is absent', async () => {
    const registry = new StubRegistry(
      [makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT)],
      () => 0.5,
    );
    const result = await scoreSession(makeInput(), { registry });
    expect(result.cursorBehaviorLabel).toBeUndefined();
  });

  it('computes a thoughtful cursor behavior label from MB behavior signals', async () => {
    const defs: SignalDefinition[] = [
      makeDef('sAiCompletionAcceptRate', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sChatVsDirectRatio', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sFileNavigationEfficiency', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sTestFirstBehavior', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sEditPatternQuality', V5Dimension.AI_ENGINEERING, 'MB'),
      makeDef('sDecisionLatencyQuality', V5Dimension.AI_ENGINEERING, 'MB'),
    ];
    const registry = new StubRegistry(defs, () => 0.9);
    const input = makeInput();
    input.submissions = { mb: { editorBehavior: makeCursorBehavior() } };

    const result = await scoreSession(input, { registry });

    expect(result.cursorBehaviorLabel).toMatchObject({
      label: '深思熟虑型',
      evidenceSignals: expect.arrayContaining([
        'sAiCompletionAcceptRate',
        'sDecisionLatencyQuality',
        'sChatVsDirectRatio',
      ]),
    });
    expect(result.cursorBehaviorLabel?.summary).toContain('Completion 接受率 60%');
  });

  it('returns a fast-paste label for high accept rate, low latency, no-chat behavior', () => {
    const input = makeInput();
    input.submissions = {
      mb: {
        editorBehavior: makeCursorBehavior({
          aiCompletionEvents: Array.from({ length: 5 }, (_, i) => ({
            timestamp: i + 1,
            accepted: true,
            lineNumber: i + 1,
            completionLength: 20,
            documentVisibleMs: 500,
          })),
          chatEvents: [],
          editSessions: [
            { filePath: 'src/a.ts', startTime: 10, endTime: 20, keystrokeCount: 30 },
          ],
          testRuns: [],
          fileNavigationHistory: [],
        }),
      },
    };

    const label = computeCursorBehaviorLabel(
      {
        ...input,
        submissions: input.submissions,
      },
      {
        sAiCompletionAcceptRate: okResult(0.36),
        sChatVsDirectRatio: okResult(0.36),
        sDecisionLatencyQuality: okResult(1),
        sTestFirstBehavior: okResult(0),
      },
    );

    expect(label?.label).toBe('快速粘贴型');
    expect(label?.summary).toContain('Completion 接受率 100%');
  });

  it('omits cursor behavior label for low-sample behavior', () => {
    const input = makeInput();
    input.submissions = {
      mb: {
        editorBehavior: makeCursorBehavior({
          aiCompletionEvents: [
            { timestamp: 1, accepted: true, lineNumber: 1, completionLength: 20 },
          ],
          chatEvents: [],
          diffEvents: [],
          fileNavigationHistory: [],
          editSessions: [],
          testRuns: [],
        }),
      },
    };

    expect(
      computeCursorBehaviorLabel(
        {
          ...input,
          submissions: input.submissions,
        },
        {
          sAiCompletionAcceptRate: okResult(1),
          sChatVsDirectRatio: okResult(1),
          sDecisionLatencyQuality: okResult(1),
        },
      ),
    ).toBeUndefined();
  });

  it('omits dangerFlag when dimensions are balanced', async () => {
    const defs: SignalDefinition[] = [
      makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sCQ', V5Dimension.CODE_QUALITY, 'MB'),
    ];
    const registry = new StubRegistry(defs, () => 0.75);
    const result = await scoreSession(makeInput(), { registry });
    expect(result.dangerFlag).toBeUndefined();
  });
});

describe('scoreSession — default registry lazy init', () => {
  it('loads the 48-signal registry on first call when none is injected', async () => {
    const input: ScoreSessionInput = {
      sessionId: 'lazy-init-test',
      suiteId: 'full_stack',
      submissions: {},
      examData: {},
      // Empty participatingModules: every signal returns null (skipped) but the
      // pipeline must still return a well-formed result.
      participatingModules: [],
    };

    const result = await scoreSession(input);
    expect(result).toBeDefined();
    expect(result.grade).toBeTruthy();
    // Lazy init must have populated the registry with all 48 signals.
    expect(Object.keys(result.signals).length).toBe(48);
  });

  it('caches the registry across calls', async () => {
    const input: ScoreSessionInput = {
      sessionId: 'cache-test',
      suiteId: 'full_stack',
      submissions: {},
      examData: {},
      participatingModules: [],
    };

    const r1 = await scoreSession(input);
    const r2 = await scoreSession(input);
    expect(Object.keys(r1.signals).length).toBe(Object.keys(r2.signals).length);
  });
});
