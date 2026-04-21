import { describe, expect, it } from 'vitest';

import {
  V5CandidateSelfViewSchema,
  V5Dimension,
  type V5DimensionScores,
  type V5ScoringResult,
} from '@codelens-v5/shared';

import {
  computeRelativeStrength,
  transformToCandidateSelfView,
} from './candidate-self-view.service.js';

describe('computeRelativeStrength', () => {
  it('splits 6 dims into 2-2-2 strong/medium/weak tiers (desc by score)', () => {
    const dims: V5DimensionScores = {
      [V5Dimension.TECHNICAL_JUDGMENT]: 90,
      [V5Dimension.AI_ENGINEERING]: 82,
      [V5Dimension.SYSTEM_DESIGN]: 75,
      [V5Dimension.CODE_QUALITY]: 60,
      [V5Dimension.COMMUNICATION]: 55,
      [V5Dimension.METACOGNITION]: 40,
    };
    const ranked = computeRelativeStrength(dims);
    expect(ranked).toHaveLength(6);
    expect(ranked.slice(0, 2).every((r) => r.relativeStrength === 'strong')).toBe(true);
    expect(ranked.slice(2, 4).every((r) => r.relativeStrength === 'medium')).toBe(true);
    expect(ranked.slice(4, 6).every((r) => r.relativeStrength === 'weak')).toBe(true);
    expect(ranked[0].id).toBe(V5Dimension.TECHNICAL_JUDGMENT);
    expect(ranked[5].id).toBe(V5Dimension.METACOGNITION);
  });

  it('skips null / undefined dim values (quick_screen suite may omit dims)', () => {
    const dims: V5DimensionScores = {
      [V5Dimension.TECHNICAL_JUDGMENT]: 85,
      [V5Dimension.AI_ENGINEERING]: 60,
      [V5Dimension.SYSTEM_DESIGN]: null,
      [V5Dimension.CODE_QUALITY]: 40,
    };
    const ranked = computeRelativeStrength(dims);
    expect(ranked).toHaveLength(3);
    expect(ranked.map((r) => r.id)).not.toContain(V5Dimension.SYSTEM_DESIGN);
  });

  it('splits 4 participating dims into 2-1-1 tiers (idx<1.33=strong · idx>=2.67=weak)', () => {
    const dims: V5DimensionScores = {
      [V5Dimension.TECHNICAL_JUDGMENT]: 90,
      [V5Dimension.AI_ENGINEERING]: 70,
      [V5Dimension.SYSTEM_DESIGN]: 60,
      [V5Dimension.CODE_QUALITY]: 40,
    };
    const ranked = computeRelativeStrength(dims);
    expect(ranked.map((r) => r.relativeStrength)).toEqual([
      'strong',
      'strong',
      'medium',
      'weak',
    ]);
  });

  it('handles same-score ties deterministically (stable sort preserves source order)', () => {
    const dims: V5DimensionScores = {
      [V5Dimension.TECHNICAL_JUDGMENT]: 70,
      [V5Dimension.AI_ENGINEERING]: 70,
      [V5Dimension.SYSTEM_DESIGN]: 70,
      [V5Dimension.CODE_QUALITY]: 70,
      [V5Dimension.COMMUNICATION]: 70,
      [V5Dimension.METACOGNITION]: 70,
    };
    const a = computeRelativeStrength(dims);
    const b = computeRelativeStrength(dims);
    expect(a).toEqual(b);
    expect(a[0].id).toBe(V5Dimension.TECHNICAL_JUDGMENT);
  });

  it('returns empty array when 0 participating dims', () => {
    expect(computeRelativeStrength({})).toEqual([]);
  });
});

describe('transformToCandidateSelfView · ethics floor strip', () => {
  const scoringResult: V5ScoringResult = {
    grade: 'A',
    composite: 85,
    dimensions: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 90,
      [V5Dimension.AI_ENGINEERING]: 80,
      [V5Dimension.SYSTEM_DESIGN]: 75,
      [V5Dimension.CODE_QUALITY]: 70,
      [V5Dimension.COMMUNICATION]: 65,
      [V5Dimension.METACOGNITION]: 60,
    },
    confidence: 'high',
    boundaryAnalysis: {
      nearestUpperGrade: 'S',
      distanceToUpper: 5,
      blockingFactor: null,
      nearestLowerGrade: 'B+',
      distanceToLower: 15,
    },
    reasoning: 'admin-only reasoning text',
    signals: {
      sSchemeJudgment: {
        value: 0.8,
        evidence: [],
        computedAt: 1,
        algorithmVersion: 'v1',
      },
    },
    capabilityProfiles: [
      {
        id: 'independent_delivery',
        nameZh: '独立交付能力',
        nameEn: 'Independent Delivery',
        score: 88,
        label: '自主',
        dimensionBreakdown: { [V5Dimension.TECHNICAL_JUDGMENT]: 36 },
        evidenceSignals: ['sSchemeJudgment'],
        description: 'admin-visible detail OK · candidate-safe wording',
      },
    ],
  };
  const session = {
    id: 'sess-xyz',
    completedAt: new Date('2026-04-21T10:00:00.000Z'),
  };

  it('produces output that parses against the strict V5CandidateSelfViewSchema', () => {
    const view = transformToCandidateSelfView(session, scoringResult);
    expect(() => V5CandidateSelfViewSchema.parse(view)).not.toThrow();
  });

  it('omits grade / composite / signals / dangerFlag / reasoning at top level', () => {
    const view = transformToCandidateSelfView(session, scoringResult);
    const topKeys = Object.keys(view).sort();
    expect(topKeys).toEqual(
      ['capabilityProfiles', 'completedAt', 'dimensionRadar', 'sessionId'].sort(),
    );
  });

  it('strips score / dimensionBreakdown / evidenceSignals from capabilityProfiles', () => {
    const view = transformToCandidateSelfView(session, scoringResult);
    const cp = view.capabilityProfiles[0];
    expect(Object.keys(cp).sort()).toEqual(
      ['description', 'id', 'label', 'nameEn', 'nameZh'].sort(),
    );
  });

  it('throws when session.completedAt is null (pre-flight check)', () => {
    expect(() =>
      transformToCandidateSelfView(
        { id: 's', completedAt: null },
        scoringResult,
      ),
    ).toThrow(/completedAt/);
  });
});
