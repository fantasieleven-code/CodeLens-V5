import { describe, expect, it } from 'vitest';
import type { SignalInput, V5SelfAssessSubmission } from '@codelens-v5/shared';
import { sCalibration } from './s-calibration.js';

function makeInput(selfAssess?: Partial<V5SelfAssessSubmission>): SignalInput {
  return {
    sessionId: 'test',
    suiteId: 'full_stack',
    submissions: selfAssess
      ? {
          selfAssess: {
            confidence: 0.5,
            reasoning: '',
            ...selfAssess,
          },
        }
      : {},
    examData: {},
    participatingModules: ['selfAssess'],
  };
}

describe('sCalibration — compute', () => {
  it('happy path: well-calibrated mid-gap produces linear score + underconfident direction', async () => {
    // Liam profile — confidence 0.78, composite 89.78 → gap 11.78.
    const input = makeInput({ confidence: 0.78 });
    const result = await sCalibration.compute(input, 89.78);

    expect(result.value).toBeGreaterThan(0.8);
    expect(result.value).toBeLessThan(0.9);
    expect(result.algorithmVersion).toBe('sCalibration@v1');
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].direction).toBe('underconfident');
    expect(result.evidence[0].triggeredRule).toMatch(/^calibration_gap:/);
  });

  it('overconfident: selfConfidence far above composite tags direction and lowers score', async () => {
    const input = makeInput({ confidence: 0.8 });
    const result = await sCalibration.compute(input, 40);
    // gap = |80 - 40| = 40 → score = 1 - (40-5)/45 = 10/45 ≈ 0.222.
    expect(result.value).toBeGreaterThan(0.2);
    expect(result.value).toBeLessThan(0.25);
    expect(result.evidence[0].direction).toBe('overconfident');
  });

  it('underconfident: selfConfidence far below composite tags direction and lowers score', async () => {
    const input = makeInput({ confidence: 0.4 });
    const result = await sCalibration.compute(input, 80);
    // gap = 40 → same magnitude as overconfident case, mirrored direction.
    expect(result.value).toBeGreaterThan(0.2);
    expect(result.value).toBeLessThan(0.25);
    expect(result.evidence[0].direction).toBe('underconfident');
  });

  it('perfect calibration: gap === 0 → score 1 + direction undefined', async () => {
    const input = makeInput({ confidence: 0.75 });
    const result = await sCalibration.compute(input, 75);
    expect(result.value).toBe(1);
    expect(result.evidence[0].direction).toBeUndefined();
    expect(result.evidence[0].triggeredRule).toBe('calibrated_within_tolerance');
  });

  it('missing selfAssess: value null + triggeredRule=missing_self_assess (Pattern H · no throw)', async () => {
    const input = makeInput();
    const result = await sCalibration.compute(input, 50);
    expect(result.value).toBeNull();
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0].triggeredRule).toBe('missing_self_assess');
    expect(result.algorithmVersion).toBe('sCalibration@v1');
  });

  it('extreme gap (gap ≥ 50): score saturates to 0 with direction still annotated', async () => {
    const input = makeInput({ confidence: 1 });
    const result = await sCalibration.compute(input, 0);
    // gap = 100 ≥ 50 → score = 0; Max c-grade archetype anchor.
    expect(result.value).toBe(0);
    expect(result.evidence[0].direction).toBe('overconfident');
  });

  it('scale normalization: confidence 0.78 is multiplied by 100 before gap (Pattern F #18 catch)', async () => {
    // Composite 78 and confidence 0.78 represent the SAME level on their
    // respective scales. Correct normalization yields gap 0 → score 1.
    // A buggy implementation that treated 0.78 as same-scale would yield
    // gap = |0.78 - 78| = 77.22 → score 0.
    const input = makeInput({ confidence: 0.78 });
    const result = await sCalibration.compute(input, 78);
    expect(result.value).toBe(1);
    expect(result.evidence[0].direction).toBeUndefined();
    expect(result.evidence[0].excerpt).toContain('self=78');
    expect(result.evidence[0].excerpt).toContain('composite=78.0');
  });

  it('partialComposite injection: omitted 2nd arg returns null + triggeredRule=missing_partial_composite', async () => {
    // Orchestrator must supply partialComposite via computeMetaSignals seam;
    // any caller that forgets the 2nd arg should not silently pass compute
    // with a bogus zero — instead null out with an explicit diagnostic rule.
    const input = makeInput({ confidence: 0.5 });
    const result = await sCalibration.compute(input);
    expect(result.value).toBeNull();
    expect(result.evidence[0].triggeredRule).toBe('missing_partial_composite');
  });
});
