/**
 * sCalibration — Task A1 (V5.0 Metacognition 7th · first meta-signal).
 *
 * Measures the gap between the candidate's self-reported confidence and
 * the orchestrator's pass-1 composite. A small gap indicates well-calibrated
 * self-assessment; a large gap anchors a Dunning-Kruger (overconfident)
 * or imposter-pattern (underconfident) trait.
 *
 * Meta-signal: consumes the pass-1 composite of the other 47 signals as
 * `partialComposite` (wired by the orchestrator's `computeMetaSignals`
 * seam — see scoring-orchestrator.service.ts). First V5.0 signal to use
 * the 2-arg compute signature widened in Commit 1.
 *
 * Formula (Pattern F #18 scale normalization + narrative-coherent band):
 *   selfConfidence (0-1) × 100 → normalized to composite's 0-100 scale
 *   gap = |normalized - partialComposite|
 *   gap ≤ 5  → score 1.0 (perfect · 5-point tolerance)
 *   gap ≥ 50 → score 0   (severely miscalibrated)
 *   5 < gap < 50 → score = 1 - (gap - 5) / 45 (linear interpolation)
 *
 * Direction (evidence annotation · V5.1 A8 potentialJunior consumer):
 *   selfConfidence > composite → 'overconfident' (Dunning-Kruger anchor)
 *   selfConfidence < composite → 'underconfident' (imposter-pattern anchor)
 *   gap === 0 (exact)          → undefined
 *
 * Pattern H defense: null paths (selfAssess missing, confidence non-finite,
 * partialComposite non-finite) carry an explicit `triggeredRule` annotation
 * so evidence traces can distinguish "not applicable" from "bug".
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { finalize } from './types.js';

const ALGORITHM_VERSION = 'sCalibration@v1';
const TOLERANCE = 5;
const CEILING = 50;

function explainedNull(rule: string, excerpt: string): SignalResult {
  return {
    value: null,
    evidence: [
      {
        source: 'submissions.selfAssess',
        excerpt,
        contribution: 0,
        triggeredRule: rule,
      },
    ],
    computedAt: Date.now(),
    algorithmVersion: ALGORITHM_VERSION,
  };
}

async function compute(
  input: SignalInput,
  partialComposite?: number,
): Promise<SignalResult> {
  const se = input.submissions.selfAssess;
  if (!se) {
    return explainedNull('missing_self_assess', 'selfAssess submission absent');
  }
  if (typeof se.confidence !== 'number' || !Number.isFinite(se.confidence)) {
    return explainedNull('missing_self_assess', 'selfAssess.confidence non-finite');
  }
  if (typeof partialComposite !== 'number' || !Number.isFinite(partialComposite)) {
    return explainedNull(
      'missing_partial_composite',
      'partialComposite not provided — orchestrator two-pass required',
    );
  }

  const selfConfidenceNormalized = se.confidence * 100;
  const gap = Math.abs(selfConfidenceNormalized - partialComposite);

  let score: number;
  if (gap <= TOLERANCE) {
    score = 1;
  } else if (gap >= CEILING) {
    score = 0;
  } else {
    score = 1 - (gap - TOLERANCE) / (CEILING - TOLERANCE);
  }

  let direction: SignalEvidence['direction'];
  if (gap === 0) {
    direction = undefined;
  } else if (selfConfidenceNormalized > partialComposite) {
    direction = 'overconfident';
  } else {
    direction = 'underconfident';
  }

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.selfAssess.confidence',
      excerpt: `self=${selfConfidenceNormalized.toFixed(0)} composite=${partialComposite.toFixed(1)} gap=${gap.toFixed(1)}`,
      contribution: score,
      triggeredRule:
        gap <= TOLERANCE
          ? 'calibrated_within_tolerance'
          : `calibration_gap:${gap.toFixed(1)}`,
      ...(direction ? { direction } : {}),
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sCalibration: SignalDefinition = {
  id: 'sCalibration',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'SE',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CALIBRATION_VERSION };
