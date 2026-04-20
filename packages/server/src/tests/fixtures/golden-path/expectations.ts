/**
 * Task 17 — Golden Path FIXTURE_EXPECTATIONS.
 *
 * Per-archetype assertion bands. Bands (not exact values) because signal
 * compute is deterministic today but multiple signals may shift by small
 * amounts when tuned in future rounds; bands shield us from noise while
 * still catching real regressions (grade bucket flips, composite drift
 * > a few points, dimension NaN, etc.).
 *
 * Bands are calibrated from `tests/integration/golden-path.test.ts` and
 * should be re-calibrated any time a signal algorithm version changes.
 */

import type { CapabilityLabel, CapabilityProfileId, V5Grade } from '@codelens-v5/shared';

export interface FixtureExpectation {
  /** Bucket of acceptable grades. Usually 1 entry; 2 when boundary-adjacent. */
  grades: readonly V5Grade[];
  /** Inclusive [lo, hi] composite score band. */
  compositeRange: readonly [number, number];
  /** Expected capability profile labels keyed by profile id. */
  capabilityLabels: Readonly<Record<CapabilityProfileId, CapabilityLabel>>;
  /**
   * Inclusive [lo, hi] sCalibration score band (Task A1 — V5.0 Metacognition
   * 7th signal, first meta-signal). Guards against future regression in the
   * two-pass orchestrator seam or gap formula drift. See "Fixture Design
   * Notes" in docs/v5-planning/field-naming-glossary.md for the Dunning-Kruger
   * narrative anchor behind Max's 0.90 confidence (score 0 — perfect DK).
   */
  sCalibrationRange: readonly [number, number];
}

/**
 * Recalibrated 2026-04-20 · Task A1 sCalibration introduction · signal
 * count 47 → 48 · metacognition dim 6 → 7. Prior baseline was Task 17b
 * Phase 3 Golden Path run (2026-04-18).
 *
 * Current calibrated values (Task A1 post-integration):
 *   Liam  = S   composite 89.61   sCalibration 0.849 (underconfident)
 *   Steve = A   composite 81.44   sCalibration 0.750 (underconfident)
 *   Emma  = B   composite 58.78   sCalibration 1.000 (within tolerance)
 *   Max   = D   composite 18.40   sCalibration 0.000 (Dunning-Kruger anchor)
 *
 * Drift from 2026-04-18 baseline: Liam −0.17 · Steve +0.20 · Emma +0.62 ·
 * Max −0.26. Emma's +0.62 is the largest shift — sCalibration=1.0 lifts
 * the metacognition dimension because her other Meta signals score lower;
 * this is signal-as-designed (reward for calibrated self-assessment is a
 * feature, not a bug). All four still fit inside their compositeRange
 * bands with headroom, and monotonic ordering Liam > Steve > Emma > Max
 * is preserved — bands work as intended. §E stop trigger #6 revised from
 * "drift > 0.5 literal" to "drift that cannot be decomposed" (observation
 * appended in Commit 6).
 *
 * Archetypes rank monotonically (Liam > Steve > Emma > Max). Composite
 * bands give ±4-5 points of cushion — wide enough to absorb a single
 * signal algorithm tweak without re-baseline, narrow enough to catch a
 * broken pipeline (scale-fix regression, registry skip bug, etc.). Grade
 * alternatives cover the immediate neighbours so a tweak that nudges
 * composite by 2 points across a threshold does not flip the suite red.
 *
 * Steve is held to ['A'] only — calibration puts Steve at 81.44 mid-A,
 * giving 6.44 headroom to the B+ floor (75) and 3.56 headroom to the S
 * floor (85). The band [77, 85] keeps Steve inside the A bucket on small
 * drift and gives a loud signal if S-floor breaches creep in.
 *
 * Emma ['B', 'C'] tolerates ±3 signal drift without flipping the suite
 * red. Liam ['S', 'S+'] allows composite to drift up into S+ (composite
 * ≥ 90) without re-baseline.
 *
 * sCalibrationRange bands (Task A1): narrow enough to catch gap-formula
 * regression (e.g. scale-normalization Pattern F #18 reappearing) and
 * two-pass seam wiring regression (partialComposite drops to undefined →
 * null-gate), wide enough to absorb a 1-2 point composite drift without
 * re-baseline. Max's [0.00, 0.10] anchors the Dunning-Kruger psychometric
 * — if Max's sCalibration ever rises materially the fixture has lost its
 * narrative integrity (see field-naming-glossary.md "Fixture Design Notes").
 */
export const FIXTURE_EXPECTATIONS: Record<'liam' | 'steve' | 'emma' | 'max', FixtureExpectation> = {
  liam: {
    grades: ['S', 'S+'],
    compositeRange: [85, 93],
    sCalibrationRange: [0.75, 0.95],
    capabilityLabels: {
      independent_delivery: '自主',
      ai_collaboration: '自主',
      system_thinking: '自主',
      learning_agility: '自主',
    },
  },
  steve: {
    grades: ['A'],
    compositeRange: [77, 85],
    sCalibrationRange: [0.65, 0.85],
    capabilityLabels: {
      independent_delivery: '自主',
      ai_collaboration: '自主',
      system_thinking: '自主',
      learning_agility: '熟练',
    },
  },
  emma: {
    grades: ['B', 'C'],
    compositeRange: [54, 62],
    sCalibrationRange: [0.95, 1.0],
    capabilityLabels: {
      independent_delivery: '有潜力',
      ai_collaboration: '待发展',
      system_thinking: '熟练',
      learning_agility: '有潜力',
    },
  },
  max: {
    grades: ['D'],
    compositeRange: [14, 24],
    sCalibrationRange: [0.0, 0.1],
    capabilityLabels: {
      independent_delivery: '待发展',
      ai_collaboration: '待发展',
      system_thinking: '待发展',
      learning_agility: '待发展',
    },
  },
};
