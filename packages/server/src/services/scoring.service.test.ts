import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_PROFILE_DEFINITIONS,
  type SignalDefinition,
  type SignalResults,
  SUITES,
  V5_DIMENSIONS,
  V5Dimension,
  type V5DimensionScores,
} from '@codelens-v5/shared';
import {
  computeAllProfiles,
  computeCapabilityProfile,
  computeComposite,
  computeDimensions,
  gradeCandidate,
  participatingDimensionsOf,
} from './scoring.service.js';

function fullDims(partial: Partial<Record<V5Dimension, number>>): V5DimensionScores {
  const out: V5DimensionScores = {};
  for (const d of V5_DIMENSIONS) out[d] = partial[d] ?? null;
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// computeComposite
// ────────────────────────────────────────────────────────────────────────────

describe('computeComposite', () => {
  it('returns weighted average across participating dims', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 80,
      [V5Dimension.AI_ENGINEERING]: 80,
      [V5Dimension.CODE_QUALITY]: 80,
      [V5Dimension.COMMUNICATION]: 80,
      [V5Dimension.METACOGNITION]: 80,
      [V5Dimension.SYSTEM_DESIGN]: 80,
    });
    const composite = computeComposite(dims, SUITES.full_stack);
    expect(composite).toBeCloseTo(80, 1);
  });

  it('N/A rescales when a dim is null', () => {
    // full_stack has all 6 dims weighted; if we drop systemDesign (weight 0.05),
    // remaining 0.95 weight should redistribute proportionally.
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 100,
      [V5Dimension.AI_ENGINEERING]: 100,
      [V5Dimension.CODE_QUALITY]: 100,
      [V5Dimension.COMMUNICATION]: 100,
      [V5Dimension.METACOGNITION]: 100,
      // SYSTEM_DESIGN null
    });
    const composite = computeComposite(dims, SUITES.full_stack);
    expect(composite).toBeCloseTo(100, 5);
  });

  it('returns 0 when all dims are null', () => {
    const dims = fullDims({});
    const composite = computeComposite(dims, SUITES.full_stack);
    expect(composite).toBe(0);
  });

  it('ignores dims with 0 weight in suite profile (quick_screen has SD/COMM = 0)', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 80,
      [V5Dimension.AI_ENGINEERING]: 80,
      [V5Dimension.CODE_QUALITY]: 80,
      [V5Dimension.METACOGNITION]: 80,
      [V5Dimension.COMMUNICATION]: 20, // should be ignored (weight 0)
      [V5Dimension.SYSTEM_DESIGN]: 0,   // should be ignored
    });
    const composite = computeComposite(dims, SUITES.quick_screen);
    expect(composite).toBeCloseTo(80, 1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// gradeCandidate — confidence & boundaryAnalysis
// ────────────────────────────────────────────────────────────────────────────

describe('gradeCandidate — high confidence', () => {
  it('S+ candidate well above threshold has high confidence, no blockingFactor', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 95,
      [V5Dimension.SYSTEM_DESIGN]: 95,
      [V5Dimension.COMMUNICATION]: 90,
      [V5Dimension.CODE_QUALITY]: 90,
      [V5Dimension.METACOGNITION]: 88,
      [V5Dimension.AI_ENGINEERING]: 85,
    });
    const decision = gradeCandidate(96, dims, SUITES.architect);
    expect(decision.grade).toBe('S+');
    expect(decision.confidence).toBe('high');
    expect(decision.boundaryAnalysis.nearestUpperGrade).toBeNull();
    expect(decision.boundaryAnalysis.distanceToUpper).toBeNull();
    expect(decision.boundaryAnalysis.distanceToLower).toBeCloseTo(6, 1);
    expect(decision.reasoning).toContain('稳定落在 S+');
    expect(decision.dangerFlag).toBeUndefined();
  });

  it('B candidate with healthy margins both sides has high confidence', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 60,
      [V5Dimension.AI_ENGINEERING]: 60,
      [V5Dimension.CODE_QUALITY]: 60,
      [V5Dimension.COMMUNICATION]: 60,
      [V5Dimension.METACOGNITION]: 60,
      [V5Dimension.SYSTEM_DESIGN]: 60,
    });
    const decision = gradeCandidate(60, dims, SUITES.full_stack);
    expect(decision.grade).toBe('B');
    expect(decision.confidence).toBe('high');
    expect(decision.boundaryAnalysis.distanceToUpper).toBeCloseTo(5, 1);
    expect(decision.boundaryAnalysis.distanceToLower).toBeCloseTo(5, 1);
  });
});

describe('gradeCandidate — boundary (medium/low confidence)', () => {
  it('A candidate near S threshold gets non-high confidence with composite-block', () => {
    // Steve's canonical boundary fixture: composite 83.8, all A floors well passed,
    // but S threshold 85 is only 1.2 away.
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 82,
      [V5Dimension.AI_ENGINEERING]: 84,
      [V5Dimension.CODE_QUALITY]: 78,
      [V5Dimension.COMMUNICATION]: 85,
      [V5Dimension.METACOGNITION]: 82,
      [V5Dimension.SYSTEM_DESIGN]: 80,
    });
    const decision = gradeCandidate(83.8, dims, SUITES.full_stack);
    expect(decision.grade).toBe('A');
    expect(decision.confidence).not.toBe('high');
    expect(decision.boundaryAnalysis.distanceToUpper).toBeCloseTo(1.2, 1);
    expect(decision.boundaryAnalysis.nearestUpperGrade).toBe('S');
    expect(decision.boundaryAnalysis.blockingFactor).toContain('composite');
  });

  it('S candidate just above threshold gets low confidence (narrow S band)', () => {
    // composite 86 in S means distanceToLower=1 → low
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 86,
      [V5Dimension.SYSTEM_DESIGN]: 86,
      [V5Dimension.COMMUNICATION]: 86,
      [V5Dimension.CODE_QUALITY]: 86,
      [V5Dimension.METACOGNITION]: 86,
      [V5Dimension.AI_ENGINEERING]: 86,
    });
    const decision = gradeCandidate(86, dims, SUITES.architect);
    expect(decision.grade).toBe('S');
    expect(decision.confidence).toBe('low');
    expect(decision.boundaryAnalysis.nearestUpperGrade).toBe('S+');
    expect(decision.boundaryAnalysis.distanceToLower).toBeCloseTo(1, 1);
  });

  it('S grade with floor-failing upper grade cites floor as blockingFactor', () => {
    // composite 88 passes S+ threshold (90? no — 88 < 90, still composite block)
    // So use composite 90+ to force floor-block test.
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 84, // S+ arch floor is 85 — blocks
      [V5Dimension.SYSTEM_DESIGN]: 90,
      [V5Dimension.COMMUNICATION]: 85,
      [V5Dimension.CODE_QUALITY]: 90,
      [V5Dimension.METACOGNITION]: 85,
      [V5Dimension.AI_ENGINEERING]: 85,
    });
    const decision = gradeCandidate(90, dims, SUITES.architect);
    expect(decision.grade).toBe('S');
    expect(decision.boundaryAnalysis.nearestUpperGrade).toBe('S+');
    expect(decision.boundaryAnalysis.blockingFactor).toContain('technicalJudgment');
    expect(decision.boundaryAnalysis.blockingFactor).toContain('85');
  });
});

describe('gradeCandidate — gradeCap', () => {
  it('quick_screen cap at A clamps S-scoring candidate and flags gradeCap', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 95,
      [V5Dimension.AI_ENGINEERING]: 95,
      [V5Dimension.CODE_QUALITY]: 95,
      [V5Dimension.METACOGNITION]: 85,
    });
    const decision = gradeCandidate(92, dims, SUITES.quick_screen);
    expect(decision.grade).toBe('A');
    expect(decision.boundaryAnalysis.nearestUpperGrade).toBeNull();
    expect(decision.boundaryAnalysis.distanceToUpper).toBeNull();
    expect(decision.boundaryAnalysis.blockingFactor).toBe('gradeCap');
  });
});

describe('gradeCandidate — dangerFlag', () => {
  it('B with high CQ and low TJ triggers dangerFlag', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 40,
      [V5Dimension.AI_ENGINEERING]: 60,
      [V5Dimension.CODE_QUALITY]: 70,
      [V5Dimension.COMMUNICATION]: 60,
      [V5Dimension.METACOGNITION]: 55,
      [V5Dimension.SYSTEM_DESIGN]: 55,
    });
    const decision = gradeCandidate(56, dims, SUITES.full_stack);
    expect(decision.dangerFlag).toBeDefined();
    expect(decision.dangerFlag!.message).toContain('AI');
    expect(decision.reasoning).toMatch(/AI|警告/);
  });

  it('does not flag when TJ above ceiling', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 55,
      [V5Dimension.AI_ENGINEERING]: 60,
      [V5Dimension.CODE_QUALITY]: 75,
      [V5Dimension.COMMUNICATION]: 60,
      [V5Dimension.METACOGNITION]: 55,
      [V5Dimension.SYSTEM_DESIGN]: 55,
    });
    const decision = gradeCandidate(60, dims, SUITES.full_stack);
    expect(decision.dangerFlag).toBeUndefined();
  });

  it('does not flag when CQ below floor', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 40,
      [V5Dimension.AI_ENGINEERING]: 60,
      [V5Dimension.CODE_QUALITY]: 55,
      [V5Dimension.COMMUNICATION]: 60,
      [V5Dimension.METACOGNITION]: 55,
      [V5Dimension.SYSTEM_DESIGN]: 55,
    });
    const decision = gradeCandidate(55, dims, SUITES.full_stack);
    expect(decision.dangerFlag).toBeUndefined();
  });
});

describe('gradeCandidate — contract invariants', () => {
  it('returns a well-formed GradeDecision for every fixture', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 70,
      [V5Dimension.AI_ENGINEERING]: 70,
      [V5Dimension.CODE_QUALITY]: 70,
      [V5Dimension.COMMUNICATION]: 70,
      [V5Dimension.METACOGNITION]: 70,
      [V5Dimension.SYSTEM_DESIGN]: 70,
    });
    const decision = gradeCandidate(70, dims, SUITES.full_stack);
    expect(decision.grade).toBeDefined();
    expect(decision.composite).toBe(70);
    expect(decision.dimensions).toBe(dims);
    expect(decision.confidence).toMatch(/^(high|medium|low)$/);
    expect(decision.reasoning).toBeTruthy();
    expect(decision.boundaryAnalysis).toBeDefined();
  });

  it('D grade has nearestLowerGrade=null', () => {
    const dims = fullDims({ [V5Dimension.TECHNICAL_JUDGMENT]: 10 });
    const decision = gradeCandidate(10, dims, SUITES.full_stack);
    expect(decision.grade).toBe('D');
    expect(decision.boundaryAnalysis.nearestLowerGrade).toBeNull();
    expect(decision.boundaryAnalysis.distanceToLower).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeCapabilityProfile & computeAllProfiles — Round 3 重构 4
// ────────────────────────────────────────────────────────────────────────────

describe('computeCapabilityProfile', () => {
  it('independent_delivery aggregates weighted average correctly', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 90,
      [V5Dimension.CODE_QUALITY]: 80,
      [V5Dimension.AI_ENGINEERING]: 70,
    });
    const profile = computeCapabilityProfile('independent_delivery', dims);
    // 90*0.4 + 80*0.35 + 70*0.25 = 36 + 28 + 17.5 = 81.5
    expect(profile.score).toBeCloseTo(81.5, 1);
    expect(profile.label).toBe('自主');
    expect(profile.evidenceSignals).toEqual(
      CAPABILITY_PROFILE_DEFINITIONS.independent_delivery.evidenceSignalIds,
    );
  });

  it('label boundaries: <50 → 待发展, 50-65 → 有潜力, 65-80 → 熟练, >=80 → 自主', () => {
    const bands = [
      { tj: 40, cq: 40, ae: 40, expectedLabel: '待发展' },
      { tj: 55, cq: 55, ae: 55, expectedLabel: '有潜力' },
      { tj: 70, cq: 70, ae: 70, expectedLabel: '熟练' },
      { tj: 85, cq: 85, ae: 85, expectedLabel: '自主' },
    ] as const;
    for (const band of bands) {
      const dims = fullDims({
        [V5Dimension.TECHNICAL_JUDGMENT]: band.tj,
        [V5Dimension.CODE_QUALITY]: band.cq,
        [V5Dimension.AI_ENGINEERING]: band.ae,
      });
      const profile = computeCapabilityProfile('independent_delivery', dims);
      expect(profile.label).toBe(band.expectedLabel);
    }
  });

  it('rescales weights when one dim is null', () => {
    // ai_collaboration: AE 0.7 / CQ 0.3. Drop AE, CQ=80 → score should be 80 (100% weight).
    const dims = fullDims({ [V5Dimension.CODE_QUALITY]: 80 });
    const profile = computeCapabilityProfile('ai_collaboration', dims);
    expect(profile.score).toBeCloseTo(80, 1);
  });

  it('returns score 0 when all declared dims are null', () => {
    const profile = computeCapabilityProfile('ai_collaboration', fullDims({}));
    expect(profile.score).toBe(0);
    expect(profile.label).toBe('待发展');
  });

  it('description template matches the computed label', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 90,
      [V5Dimension.CODE_QUALITY]: 85,
      [V5Dimension.AI_ENGINEERING]: 85,
    });
    const profile = computeCapabilityProfile('independent_delivery', dims);
    const expected =
      CAPABILITY_PROFILE_DEFINITIONS.independent_delivery.descriptionTemplate('自主');
    expect(profile.description).toBe(expected);
  });
});

describe('computeAllProfiles', () => {
  it('returns all 4 profiles for full_stack (all 6 dims participate)', () => {
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 80,
      [V5Dimension.AI_ENGINEERING]: 80,
      [V5Dimension.CODE_QUALITY]: 80,
      [V5Dimension.COMMUNICATION]: 80,
      [V5Dimension.METACOGNITION]: 80,
      [V5Dimension.SYSTEM_DESIGN]: 80,
    });
    const participating = participatingDimensionsOf(SUITES.full_stack);
    const profiles = computeAllProfiles(dims, participating);
    expect(profiles.map((p) => p.id).sort()).toEqual(
      ['ai_collaboration', 'independent_delivery', 'learning_agility', 'system_thinking'],
    );
  });

  it('quick_screen still surfaces system_thinking because TJ/AE participate', () => {
    // quick_screen has SD/COMM weight = 0, but TJ/AE > 0. system_thinking declares
    // SD+TJ+AE — partial overlap should keep the profile.
    const dims = fullDims({
      [V5Dimension.TECHNICAL_JUDGMENT]: 70,
      [V5Dimension.AI_ENGINEERING]: 70,
      [V5Dimension.CODE_QUALITY]: 70,
      [V5Dimension.METACOGNITION]: 70,
    });
    const participating = participatingDimensionsOf(SUITES.quick_screen);
    const profiles = computeAllProfiles(dims, participating);
    const systemThinking = profiles.find((p) => p.id === 'system_thinking');
    expect(systemThinking).toBeDefined();
  });

  it('filters out a profile whose declared dims are ALL absent from participating', () => {
    // Synthesize a scenario: participating only [CODE_QUALITY] — learning_agility
    // declares METACOGNITION / COMMUNICATION / TECHNICAL_JUDGMENT, none of which
    // participate → should be filtered.
    const dims = fullDims({ [V5Dimension.CODE_QUALITY]: 70 });
    const profiles = computeAllProfiles(dims, [V5Dimension.CODE_QUALITY]);
    const learningAgility = profiles.find((p) => p.id === 'learning_agility');
    const systemThinking = profiles.find((p) => p.id === 'system_thinking');
    // learning_agility's declared dims: METACOGNITION, COMMUNICATION, TECHNICAL_JUDGMENT
    //   → none in participating → filtered out.
    // system_thinking's declared dims: SYSTEM_DESIGN, TECHNICAL_JUDGMENT, AI_ENGINEERING
    //   → none in participating → filtered out.
    expect(learningAgility).toBeUndefined();
    expect(systemThinking).toBeUndefined();
    // independent_delivery includes CODE_QUALITY → kept
    // ai_collaboration includes CODE_QUALITY → kept
    expect(profiles.map((p) => p.id).sort()).toEqual(['ai_collaboration', 'independent_delivery']);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// computeDimensions — signal aggregation
// ────────────────────────────────────────────────────────────────────────────

describe('computeDimensions', () => {
  // Task 17 scale contract: signal.value ∈ [0, 1]; computeDimensions multiplies
  // by 100 before averaging so dimensions / composite / thresholds all share
  // the 0-100 scale.
  it('averages signal values per dimension (0-1 → 0-100)', () => {
    const defs: SignalDefinition[] = [
      makeDef('sA', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sB', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sC', V5Dimension.CODE_QUALITY),
    ];
    const signals: SignalResults = {
      sA: res(0.8),
      sB: res(0.6),
      sC: res(0.7),
    };
    const dims = computeDimensions(signals, defs, SUITES.full_stack);
    expect(dims[V5Dimension.TECHNICAL_JUDGMENT]).toBe(70);
    expect(dims[V5Dimension.CODE_QUALITY]).toBe(70);
  });

  it('returns null for dim with no participating signals', () => {
    const defs: SignalDefinition[] = [makeDef('sA', V5Dimension.TECHNICAL_JUDGMENT)];
    const signals: SignalResults = { sA: res(0.8) };
    const dims = computeDimensions(signals, defs, SUITES.full_stack);
    expect(dims[V5Dimension.METACOGNITION]).toBeNull();
  });

  it('ignores null signal values when averaging', () => {
    const defs: SignalDefinition[] = [
      makeDef('sA', V5Dimension.TECHNICAL_JUDGMENT),
      makeDef('sB', V5Dimension.TECHNICAL_JUDGMENT),
    ];
    const signals: SignalResults = {
      sA: res(0.8),
      sB: res(null),
    };
    const dims = computeDimensions(signals, defs, SUITES.full_stack);
    expect(dims[V5Dimension.TECHNICAL_JUDGMENT]).toBe(80);
  });

  it('returns null for dims with 0 weight in the suite profile', () => {
    const defs: SignalDefinition[] = [
      makeDef('sA', V5Dimension.COMMUNICATION),
      makeDef('sB', V5Dimension.SYSTEM_DESIGN),
    ];
    const signals: SignalResults = { sA: res(0.8), sB: res(0.8) };
    const dims = computeDimensions(signals, defs, SUITES.quick_screen);
    expect(dims[V5Dimension.COMMUNICATION]).toBeNull();
    expect(dims[V5Dimension.SYSTEM_DESIGN]).toBeNull();
  });

  it('signal value 1.0 → dimension 100; signal value 0.0 → dimension 0', () => {
    const defs: SignalDefinition[] = [makeDef('sA', V5Dimension.TECHNICAL_JUDGMENT)];
    expect(
      computeDimensions({ sA: res(1.0) }, defs, SUITES.full_stack)[V5Dimension.TECHNICAL_JUDGMENT],
    ).toBe(100);
    expect(
      computeDimensions({ sA: res(0.0) }, defs, SUITES.full_stack)[V5Dimension.TECHNICAL_JUDGMENT],
    ).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────────────

function makeDef(id: string, dim: V5Dimension): SignalDefinition {
  return {
    id,
    dimension: dim,
    moduleSource: 'MA',
    isLLMWhitelist: false,
    compute: async () => res(0),
  };
}

function res(value: number | null) {
  return {
    value,
    evidence: [],
    computedAt: 0,
    algorithmVersion: 'test@v1',
  };
}
