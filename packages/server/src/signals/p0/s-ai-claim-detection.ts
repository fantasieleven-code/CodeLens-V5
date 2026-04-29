/**
 * sAiClaimDetection — Task 13a, Round 2 Part 3 调整 1.
 *
 * Detects whether the candidate correctly identifies the deceptive feature
 * claim in the AI-generated code + AI-explanation verification block. Pure-
 * rule signal per v5-design-clarifications.md L89-113:
 *
 *   mentionsDeception && hasEvidence && isCalibrated → 1.0
 *   mentionsDeception && hasEvidence                 → 0.8
 *   mentionsDeception && !hasEvidence                → 0.5  (察觉但没给证据)
 *   !mentionsDeception && hasEvidence                → 0.3  (在看代码但没发现问题)
 *   else                                             → 0.1
 *
 * NOTE: shared `P0ModuleSpecific.aiClaimDetection.claimedFeatures` is kept
 * for future evidence enrichment but not consumed by the current V5.0
 * algorithm (see Round 2 L89-113 scoring rules). The doc's input-type field
 * `aiClaimedFeatures` (L81) is a doc-internal naming inconsistency that the
 * algorithm body never references — the V5 helper aligns with `claimedFeatures`
 * as the shared shape does.
 *
 * Fallback: null when phase0 submission or exam data missing.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { finalize, getP0ExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sAiClaimDetection@v1';

const NEGATION_MARKERS = ['没有', '没看到', '实际', '其实', 'missing', 'not', 'but', '但是'];
const OVERSHOOT_PATTERN = /(ai.*全是错|ai.*都不对|ai.*胡说|ai.*都是错|ai.*都有问题)/i;
const LINE_REFERENCE_PATTERN = /\b(line|行|行号)\s*\d+/i;

type ScoreTier = 'aware_with_evidence_calibrated' | 'aware_with_evidence' | 'aware_no_evidence' | 'evidence_no_awareness' | 'none';

function computeTier(
  mentionsDeception: boolean,
  hasEvidence: boolean,
  isCalibrated: boolean,
): { value: number; tier: ScoreTier } {
  if (mentionsDeception && hasEvidence && isCalibrated) {
    return { value: 1.0, tier: 'aware_with_evidence_calibrated' };
  }
  if (mentionsDeception && hasEvidence) {
    return { value: 0.8, tier: 'aware_with_evidence' };
  }
  if (mentionsDeception && !hasEvidence) {
    return { value: 0.5, tier: 'aware_no_evidence' };
  }
  if (!mentionsDeception && hasEvidence) {
    return { value: 0.3, tier: 'evidence_no_awareness' };
  }
  return { value: 0.1, tier: 'none' };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.phase0;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const exam = getP0ExamData(input.examData);
  if (!exam?.aiClaimDetection) return nullResult(ALGORITHM_VERSION);

  const response = sub.aiClaimVerification?.response ?? '';
  const lower = response.toLowerCase();
  const { actualFeatures, deceptivePoint } = exam.aiClaimDetection;

  const claimedLower = deceptivePoint.claimedFeature.toLowerCase();
  const mentionsClaimed = claimedLower.length > 0 && lower.includes(claimedLower);
  const hasNegation = NEGATION_MARKERS.some((m) => lower.includes(m));
  const mentionsDeception = mentionsClaimed && hasNegation;

  const citesLine = LINE_REFERENCE_PATTERN.test(response);
  const actualFeatureHit = (actualFeatures ?? []).find(
    (f) => typeof f === 'string' && f.trim().length > 0 && lower.includes(f.toLowerCase()),
  );
  const hasEvidence = citesLine || actualFeatureHit !== undefined;

  const isCalibrated = !OVERSHOOT_PATTERN.test(response);

  const { value, tier } = computeTier(mentionsDeception, hasEvidence, isCalibrated);

  const evidence: SignalEvidence[] = [];
  const responseExcerpt = truncate(response);

  if (mentionsDeception) {
    evidence.push({
      source: 'submissions.phase0.aiClaimVerification.response',
      excerpt: responseExcerpt,
      contribution: 0.5,
      triggeredRule: `mentions_deception_point:${deceptivePoint.claimedFeature}`,
    });
  }
  if (hasEvidence) {
    evidence.push({
      source: citesLine
        ? 'submissions.phase0.aiClaimVerification.response'
        : 'examData.P0.aiClaimDetection.actualFeatures',
      excerpt: citesLine
        ? responseExcerpt
        : `actualFeature=${actualFeatureHit ?? ''} in response=${truncate(response, 120)}`,
      contribution: 0.3,
      triggeredRule: citesLine ? 'cites_line_number' : `cites_actual_feature:${actualFeatureHit}`,
    });
  }
  if (!isCalibrated) {
    evidence.push({
      source: 'submissions.phase0.aiClaimVerification.response',
      excerpt: responseExcerpt,
      contribution: -0.2,
      triggeredRule: 'overshoot_skepticism',
    });
  }
  if (mentionsDeception && !hasEvidence && isCalibrated) {
    evidence.push({
      source: 'submissions.phase0.aiClaimVerification.response',
      excerpt: responseExcerpt,
      contribution: 0,
      triggeredRule: 'awareness_without_proof',
    });
  }
  evidence.push({
    source: 'tier',
    excerpt: `tier=${tier} mentionsDeception=${mentionsDeception} hasEvidence=${hasEvidence} isCalibrated=${isCalibrated} → ${value.toFixed(2)}`,
    contribution: 0,
    triggeredRule: 'scoring_tier',
  });

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sAiClaimDetection: SignalDefinition = {
  id: 'sAiClaimDetection',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'P0',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as AI_CLAIM_DETECTION_VERSION };
