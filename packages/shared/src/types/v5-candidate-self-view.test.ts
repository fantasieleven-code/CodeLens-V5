import { describe, expect, it } from 'vitest';

import {
  V5CandidateSelfViewSchema,
  type V5CandidateSelfView,
} from './v5-candidate-self-view.js';
import {
  V5Dimension,
  V5_DIMENSIONS,
  V5_DIMENSION_NAME_EN,
  V5_DIMENSION_NAME_ZH,
} from './v5-dimensions.js';
import { V5ScoringResultSchema } from './v5-scoring.js';

const validSelfView: V5CandidateSelfView = {
  sessionId: 'sess-1',
  completedAt: '2026-04-21T00:00:00.000Z',
  capabilityProfiles: [
    {
      id: 'independent_delivery',
      nameZh: '独立交付能力',
      nameEn: 'Independent Delivery',
      label: '熟练',
      description: '候选人能完成大部分交付,偶尔需要方向指导',
    },
  ],
  dimensionRadar: [
    {
      id: 'technicalJudgment',
      nameZh: '技术判断',
      nameEn: 'Technical Judgment',
      relativeStrength: 'strong',
    },
  ],
};

describe('V5CandidateSelfViewSchema · ethics floor gate', () => {
  it('parses a valid V5CandidateSelfView payload', () => {
    expect(() => V5CandidateSelfViewSchema.parse(validSelfView)).not.toThrow();
  });

  it('rejects unknown top-level field "grade" (ethics floor permanent gate)', () => {
    expect(() =>
      V5CandidateSelfViewSchema.parse({ ...validSelfView, grade: 'A' }),
    ).toThrow();
  });

  it('rejects unknown top-level field "score"', () => {
    expect(() =>
      V5CandidateSelfViewSchema.parse({ ...validSelfView, score: 82 }),
    ).toThrow();
  });

  it('rejects unknown top-level field "signals"', () => {
    expect(() =>
      V5CandidateSelfViewSchema.parse({ ...validSelfView, signals: {} }),
    ).toThrow();
  });

  it('rejects invalid capabilityProfile label', () => {
    expect(() =>
      V5CandidateSelfViewSchema.parse({
        ...validSelfView,
        capabilityProfiles: [
          { ...validSelfView.capabilityProfiles[0], label: 'Expert' },
        ],
      }),
    ).toThrow();
  });

  it('rejects invalid dimensionRadar relativeStrength', () => {
    expect(() =>
      V5CandidateSelfViewSchema.parse({
        ...validSelfView,
        dimensionRadar: [
          { ...validSelfView.dimensionRadar[0], relativeStrength: 'excellent' },
        ],
      }),
    ).toThrow();
  });
});

describe('V5_DIMENSION_NAME_ZH / EN · self-view radar consumer', () => {
  it('V5_DIMENSION_NAME_ZH covers all 6 V5Dimension values', () => {
    for (const dim of V5_DIMENSIONS) {
      expect(V5_DIMENSION_NAME_ZH[dim]).toBeTypeOf('string');
      expect(V5_DIMENSION_NAME_ZH[dim].length).toBeGreaterThan(0);
    }
    expect(Object.keys(V5_DIMENSION_NAME_ZH).sort()).toEqual(
      [...V5_DIMENSIONS].sort(),
    );
  });

  it('V5_DIMENSION_NAME_EN covers all 6 V5Dimension values', () => {
    for (const dim of V5_DIMENSIONS) {
      expect(V5_DIMENSION_NAME_EN[dim]).toBeTypeOf('string');
      expect(V5_DIMENSION_NAME_EN[dim].length).toBeGreaterThan(0);
    }
    expect(V5_DIMENSION_NAME_EN[V5Dimension.AI_ENGINEERING]).toBe(
      'AI Collaboration',
    );
  });
});

describe('V5ScoringResultSchema · drift defense (β ratified)', () => {
  const validScoring = {
    grade: 'B+' as const,
    composite: 72,
    dimensions: {
      technicalJudgment: 75,
      aiEngineering: 68,
      systemDesign: null,
      codeQuality: 80,
      communication: 70,
      metacognition: 65,
    },
    confidence: 'high' as const,
    boundaryAnalysis: {
      nearestUpperGrade: 'A',
      distanceToUpper: 3,
      blockingFactor: null,
      nearestLowerGrade: 'B',
      distanceToLower: 7,
    },
    reasoning: '候选人整体能力达到熟练水平',
    signals: {
      sSchemeJudgment: {
        value: 0.75,
        evidence: [],
        computedAt: 1_700_000_000_000,
        algorithmVersion: 'sSchemeJudgment@v1',
      },
    },
    capabilityProfiles: [
      {
        id: 'independent_delivery' as const,
        nameZh: '独立交付能力',
        nameEn: 'Independent Delivery',
        score: 72,
        label: '熟练' as const,
        dimensionBreakdown: { technicalJudgment: 30 },
        evidenceSignals: ['sSchemeJudgment'],
        description: '候选人能完成大部分交付',
      },
    ],
  };

  it('parses a valid V5ScoringResult payload', () => {
    expect(() => V5ScoringResultSchema.parse(validScoring)).not.toThrow();
  });

  it('tolerates unknown top-level fields (non-strict · forward compat)', () => {
    expect(() =>
      V5ScoringResultSchema.parse({ ...validScoring, newV5_1Field: 'ok' }),
    ).not.toThrow();
  });

  it('rejects missing required field "grade"', () => {
    const bad = { ...validScoring } as Record<string, unknown>;
    delete bad.grade;
    expect(() => V5ScoringResultSchema.parse(bad)).toThrow();
  });
});
