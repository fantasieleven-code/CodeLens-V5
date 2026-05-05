/**
 * Tests for V5 mc-probe-engine.
 *
 * Covers:
 *   - V5_DIMENSION_SIGNALS totals (48 = EXPECTED_SIGNAL_COUNT).
 *   - analyzeSignalsForProbing round dispatch (1 / 2-4 / 5 + contradiction).
 *   - PromptRegistry template is loaded per strategy (mocked).
 *   - buildSignalSnapshot reads Session.scoringResult, then overlays MC metadata deltas.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(async (key: string) => `[mock template for ${key}]`),
  },
}));

vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: vi.fn(async () => ({
    trace: vi.fn(),
  })),
}));

vi.mock('../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

import { EXPECTED_SIGNAL_COUNT } from '../signals/index.js';
import {
  V5_DIMENSION_SIGNALS,
  V5_DIMENSION_SIGNAL_TOTAL,
  analyzeSignalsForProbing,
  buildSignalSnapshot,
  type ProbeDecision,
  type SignalSnapshot,
} from './mc-probe-engine.js';
import { promptRegistry } from './prompt-registry.service.js';
import { prisma } from '../config/db.js';

const VALID_SCORING_RESULT = {
  grade: 'B',
  composite: 72,
  dimensions: {
    technicalJudgment: 70,
    aiEngineering: 74,
  },
  confidence: 'medium',
  boundaryAnalysis: {},
  reasoning: 'fixture',
  signals: {},
  capabilityProfiles: [
    {
      id: 'independent_delivery',
      nameZh: '自主交付',
      nameEn: 'Independent Delivery',
      score: 72,
      label: '熟练',
      dimensionBreakdown: {
        technicalJudgment: 70,
      },
      evidenceSignals: ['sSchemeJudgment'],
      description: 'fixture',
    },
  ],
};

describe('V5_DIMENSION_SIGNALS — 6-dimension × 48-signal map', () => {
  it('total equals EXPECTED_SIGNAL_COUNT (48)', () => {
    expect(V5_DIMENSION_SIGNAL_TOTAL).toBe(EXPECTED_SIGNAL_COUNT);
    expect(V5_DIMENSION_SIGNAL_TOTAL).toBe(48);
  });

  it('has exactly 6 dimensions matching the V5 taxonomy', () => {
    expect(Object.keys(V5_DIMENSION_SIGNALS).sort()).toEqual(
      [
        'aiEngineering',
        'codeQuality',
        'communication',
        'metacognition',
        'systemDesign',
        'technicalJudgment',
      ].sort(),
    );
  });

  it('per-dimension counts match Round 3 Part 2 + Task A1 taxonomy (9/14/12/3/7/3)', () => {
    expect(V5_DIMENSION_SIGNALS.technicalJudgment.signals.length).toBe(9);
    expect(V5_DIMENSION_SIGNALS.aiEngineering.signals.length).toBe(14);
    expect(V5_DIMENSION_SIGNALS.codeQuality.signals.length).toBe(12);
    expect(V5_DIMENSION_SIGNALS.communication.signals.length).toBe(3);
    expect(V5_DIMENSION_SIGNALS.metacognition.signals.length).toBe(7);
    expect(V5_DIMENSION_SIGNALS.systemDesign.signals.length).toBe(3);
  });

  it('sBeliefUpdateMagnitude is listed under metacognition', () => {
    expect(V5_DIMENSION_SIGNALS.metacognition.signals).toContain('sBeliefUpdateMagnitude');
  });
});

describe('analyzeSignalsForProbing — round dispatch', () => {
  beforeEach(() => {
    vi.mocked(promptRegistry.get).mockClear();
  });

  it('round 1 always uses baseline strategy', async () => {
    const decision = await analyzeSignalsForProbing('s1', {}, 1, []);
    expect(decision.strategyKey).toBe('baseline');
    expect(decision.probeType).toBe('baseline');
    expect(decision.round).toBe(1);
    expect(decision.targetDimension).toBe('technicalJudgment');
  });

  it('round 5 always uses transfer strategy', async () => {
    const decision = await analyzeSignalsForProbing('s1', {}, 5, []);
    expect(decision.strategyKey).toBe('transfer');
    expect(decision.probeType).toBe('transfer');
    expect(decision.targetDimension).toBe('metacognition');
  });

  it('round 2 triggers contradiction when MA high + boundary low', async () => {
    const snapshot: SignalSnapshot = {
      sSchemeJudgment: 0.9,
      sBoundaryAwareness: 0.2,
    };
    const decision = await analyzeSignalsForProbing('s1', snapshot, 2, []);
    expect(decision.strategyKey).toBe('contradiction');
    expect(decision.probeType).toBe('verify');
    expect(decision.targetDimension).toBe('technicalJudgment');
  });

  it('round 3 falls back to weakness when no contradictions present', async () => {
    const decision = await analyzeSignalsForProbing(
      's1',
      { sSchemeJudgment: 0.5, sPromptQuality: 0.2 },
      3,
      [],
    );
    expect(decision.strategyKey).toBe('weakness');
    expect(decision.probeType).toBe('weakness');
  });

  it('round 4 with composite in 62-72 band triggers escalation', async () => {
    // Composite ~65 — each dim averages 0.65 → composite = 65.
    const snapshot: SignalSnapshot = {
      sSchemeJudgment: 0.65,
      sReasoningDepth: 0.65,
      sPromptQuality: 0.65,
      sCodeReviewQuality: 0.65,
      sBoundaryAwareness: 0.65,
      sMetaCognition: 0.65,
      sDesignDecomposition: 0.65,
    };
    const decision = await analyzeSignalsForProbing('s1', snapshot, 4, []);
    expect(decision.strategyKey).toBe('escalation');
  });

  it('dedup: if contradiction dim already asked, falls back to weakness', async () => {
    const snapshot: SignalSnapshot = {
      sSchemeJudgment: 0.9,
      sBoundaryAwareness: 0.1,
    };
    const priorProbe: ProbeDecision = {
      targetDimension: 'technicalJudgment',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: 'prior',
      promptGuidance: '',
      round: 2,
    };
    const decision = await analyzeSignalsForProbing('s1', snapshot, 3, [priorProbe]);
    expect(decision.strategyKey).not.toBe('contradiction');
  });
});

describe('analyzeSignalsForProbing — PromptRegistry integration', () => {
  beforeEach(() => {
    vi.mocked(promptRegistry.get).mockClear();
  });

  it('calls PromptRegistry with the strategy key and appends template to guidance', async () => {
    const decision = await analyzeSignalsForProbing('s1', {}, 1, []);
    expect(promptRegistry.get).toHaveBeenCalledWith('mc.probe_engine.baseline');
    expect(decision.promptGuidance).toContain('[策略模板]');
    expect(decision.promptGuidance).toContain('[mock template for mc.probe_engine.baseline]');
  });

  it('swallows PromptRegistry errors and keeps guidance fallback', async () => {
    vi.mocked(promptRegistry.get).mockRejectedValueOnce(new Error('not seeded'));
    const decision = await analyzeSignalsForProbing('s1', {}, 5, []);
    // Round 5 guidance should still be the built-in string.
    expect(decision.promptGuidance.length).toBeGreaterThan(0);
    expect(decision.strategyKey).toBe('transfer');
  });
});

describe('buildSignalSnapshot', () => {
  beforeEach(() => {
    vi.mocked(prisma.session.findUnique).mockReset();
  });

  it('returns empty snapshot when session has no metadata', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null as never);
    const snap = await buildSignalSnapshot('missing');
    expect(snap).toEqual({});
  });

  it('returns empty snapshot when neither scoringResult nor metadata.signalResults exists', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      metadata: {},
      scoringResult: null,
    } as never);
    const snap = await buildSignalSnapshot('s1');
    expect(snap).toEqual({});
  });

  it('extracts numeric signal values from cached Session.scoringResult', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      metadata: {},
      scoringResult: {
        ...VALID_SCORING_RESULT,
        signals: {
          sSchemeJudgment: { value: 0.8 },
          sBoundaryAwareness: { value: null },
          sPromptQuality: { value: 0.5 },
          sBogusNonNumeric: { value: 'oops' },
        },
      },
    } as never);
    const snap = await buildSignalSnapshot('s1');
    expect(snap).toEqual({
      sSchemeJudgment: 0.8,
      sPromptQuality: 0.5,
    });
  });

  it('overlays metadata.signalResults over cached scoringResult values', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      metadata: {
        signalResults: {
          sPromptQuality: { value: 0.6 },
          sBeliefUpdateMagnitude: { value: 0.7 },
        },
      },
      scoringResult: {
        ...VALID_SCORING_RESULT,
        signals: {
          sSchemeJudgment: { value: 0.8 },
          sPromptQuality: { value: 0.2 },
        },
      },
    } as never);

    const snap = await buildSignalSnapshot('s1');
    expect(snap).toEqual({
      sSchemeJudgment: 0.8,
      sPromptQuality: 0.6,
      sBeliefUpdateMagnitude: 0.7,
    });
  });

  it('keeps metadata signal values when cached scoringResult has shape drift', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({
      metadata: {
        signalResults: {
          sPromptQuality: { value: 0.5 },
        },
      },
      scoringResult: { grade: 'not-a-v5-grade' },
    } as never);

    const snap = await buildSignalSnapshot('s1');
    expect(snap).toEqual({
      sPromptQuality: 0.5,
    });
  });
});
