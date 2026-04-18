/**
 * Task 17 — Golden Path FIXTURE_EXPECTATIONS.
 *
 * Per-archetype assertion bands. Bands (not exact values) because signal
 * compute is deterministic today but multiple signals may shift by small
 * amounts when tuned in future rounds; bands shield us from noise while
 * still catching real regressions (grade bucket flips, composite drift
 * > a few points, dimension NaN, etc.).
 *
 * Bands are calibrated from the first run of
 * `tests/integration/golden-path.test.ts` and should be re-calibrated any
 * time a signal algorithm version changes.
 */

import type { V5Grade } from '@codelens-v5/shared';

export interface FixtureExpectation {
  /** Bucket of acceptable grades. Usually 1 entry; 2 when boundary-adjacent. */
  grades: readonly V5Grade[];
  /** Inclusive [lo, hi] composite score band. */
  compositeRange: readonly [number, number];
}

/**
 * Calibrated from the first clean run of the Golden Path E2E
 * (2026-04-18):
 *   Liam = A   composite 79.7   confidence medium
 *   Steve = C  composite 50.9   confidence medium
 *   Emma  = D  composite 43.6   confidence low
 *   Max   = D  composite 18.7   confidence high
 *
 * Archetypes rank monotonically (Liam > Steve > Emma > Max). Composite
 * bands give ±8 points of cushion — wide enough to absorb a single signal
 * algorithm tweak without re-baseline, narrow enough to catch a broken
 * pipeline (scale-fix regression, registry skip bug, etc.). Grade
 * alternatives cover the immediate neighbours so a tweak that nudges
 * composite by 2 points across a threshold does not flip the suite red.
 *
 * Note: Liam lands in A (not S) under the current Signal calibration
 * because several signals (sRulesQuality, sMetaCognition, sCritical-
 * Thinking) rarely return > 0.9 even with an ideal archetype — tightening
 * those is V5.1 signal-calibration work, tracked separately. The Golden
 * Path gate's job is to verify pipeline correctness, not signal ceiling.
 */
export const FIXTURE_EXPECTATIONS: Record<'liam' | 'steve' | 'emma' | 'max', FixtureExpectation> = {
  liam: {
    grades: ['A', 'B+'],
    compositeRange: [72, 88],
  },
  steve: {
    grades: ['C', 'B'],
    compositeRange: [42, 58],
  },
  emma: {
    grades: ['D', 'C'],
    compositeRange: [36, 50],
  },
  max: {
    grades: ['D'],
    compositeRange: [10, 28],
  },
};
