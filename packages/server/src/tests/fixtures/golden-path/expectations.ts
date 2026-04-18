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
}

/**
 * Calibrated from the Task 17b Phase 3 Golden Path run (2026-04-18):
 *   Liam  = S   composite 89.78   confidence high
 *   Steve = A   composite 81.24   confidence high
 *   Emma  = B   composite 58.16   confidence medium
 *   Max   = D   composite 18.66   confidence high
 *
 * Archetypes rank monotonically (Liam > Steve > Emma > Max). Composite
 * bands give ±4-5 points of cushion — wide enough to absorb a single
 * signal algorithm tweak without re-baseline, narrow enough to catch a
 * broken pipeline (scale-fix regression, registry skip bug, etc.). Grade
 * alternatives cover the immediate neighbours so a tweak that nudges
 * composite by 2 points across a threshold does not flip the suite red.
 *
 * Steve is held to ['A'] only — Phase 3 calibration put Steve at 81.24
 * mid-A, giving 6.24 headroom to the B+ floor (75) and 3.76 headroom to
 * the S floor (85). The band [77, 85] keeps Steve inside the A bucket on
 * small drift and gives a loud signal if S-floor breaches creep in.
 *
 * Emma ['B', 'C'] tolerates ±3 signal drift without flipping the suite
 * red. Liam ['S', 'S+'] allows composite to drift up into S+ (composite
 * ≥ 90) without re-baseline.
 */
export const FIXTURE_EXPECTATIONS: Record<'liam' | 'steve' | 'emma' | 'max', FixtureExpectation> = {
  liam: {
    grades: ['S', 'S+'],
    compositeRange: [85, 93],
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
    capabilityLabels: {
      independent_delivery: '待发展',
      ai_collaboration: '待发展',
      system_thinking: '待发展',
      learning_agility: '待发展',
    },
  },
};
