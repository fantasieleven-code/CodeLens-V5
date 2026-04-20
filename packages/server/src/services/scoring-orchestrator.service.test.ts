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
  __resetDefaultRegistryForTests,
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
      grade: expect.any(String),
      composite: expect.any(Number),
      dimensions: expect.any(Object),
      confidence: expect.any(String),
      boundaryAnalysis: expect.any(Object),
      reasoning: expect.any(String),
      signals: expect.any(Object),
      capabilityProfiles: expect.any(Array),
    });
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

  it('returns cursorBehaviorLabel = undefined (V5.1 backlog)', async () => {
    const registry = new StubRegistry(
      [makeDef('sTJ', V5Dimension.TECHNICAL_JUDGMENT)],
      () => 0.5,
    );
    const result = await scoreSession(makeInput(), { registry });
    expect(result.cursorBehaviorLabel).toBeUndefined();
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
