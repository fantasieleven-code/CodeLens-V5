/**
 * sMetaCognition — Task 13d (SE pure-rule).
 *
 * Grades the quality of the candidate's self-assessment at session end.
 * Pure rule; no LLM. Dimension: METACOGNITION.
 *
 * V5-native formula (backend-agent-tasks.md L147 calls it "纯规则" without
 * explicit weights; v5-submissions.ts L253 notes `reviewedDecisions` is the
 * new V5 field "用于 sMetaCognition 校准评估"):
 *
 *   reasoningScore     = clamp01(reasoning_volume / 60)           // CJK-aware, target 60 units
 *   balancedConfidence = 1 - min(1, 2 × |confidence - 0.6|)       // peak at 0.6 (mild self-awareness)
 *   reviewScore        = clamp01(reviewedDecisions.length / 3)    // encourage reviewing ≥3 prior steps
 *
 *   sMetaCognition = reasoningScore × 0.5
 *                  + balancedConfidence × 0.2
 *                  + reviewScore × 0.3
 *
 * Rationale: confidence alone is uninformative without substance, so the
 * dominant weight is on reasoning depth. The balanced-confidence term gently
 * penalizes both extreme over-/under-confidence (peak 0.6 matches the
 * observed archetype median where senior candidates hedge slightly). Review
 * depth rewards candidates who explicitly recall prior decisions rather than
 * writing a generic "I did my best" summary.
 *
 * Fallback: null when `submissions.selfAssess` missing.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sMetaCognition@v1';
const REASONING_TARGET = 60;
const REVIEW_TARGET = 3;
const CONFIDENCE_PEAK = 0.6;
const REASONING_WEIGHT = 0.5;
const BALANCE_WEIGHT = 0.2;
const REVIEW_WEIGHT = 0.3;

function textVolume(text: string): number {
  if (!text) return 0;
  const latin = text.trim().split(/\s+/).filter(Boolean).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return Math.max(latin, cjk);
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const se = input.submissions.selfAssess;
  if (!se) return nullResult(ALGORITHM_VERSION);

  const reasoning = (se.reasoning ?? '').trim();
  const reasoningScore = clamp01(textVolume(reasoning) / REASONING_TARGET);

  const confidence = typeof se.confidence === 'number' && Number.isFinite(se.confidence)
    ? clamp01(se.confidence)
    : 0;
  const balancedConfidence = clamp01(1 - 2 * Math.abs(confidence - CONFIDENCE_PEAK));

  const reviewed = se.reviewedDecisions ?? [];
  const reviewScore = clamp01(reviewed.length / REVIEW_TARGET);

  const value =
    reasoningScore * REASONING_WEIGHT +
    balancedConfidence * BALANCE_WEIGHT +
    reviewScore * REVIEW_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.selfAssess.reasoning',
      excerpt: truncate(reasoning || '(empty)'),
      contribution: reasoningScore * REASONING_WEIGHT,
      triggeredRule: `reasoning_volume:${textVolume(reasoning)}/${REASONING_TARGET}`,
    },
    {
      source: 'submissions.selfAssess.confidence',
      excerpt: `confidence=${confidence.toFixed(2)} peak=${CONFIDENCE_PEAK}`,
      contribution: balancedConfidence * BALANCE_WEIGHT,
      triggeredRule: `balance:${balancedConfidence.toFixed(2)}`,
    },
    {
      source: 'submissions.selfAssess.reviewedDecisions',
      excerpt: `reviewed=${reviewed.length}/${REVIEW_TARGET} items=[${reviewed.slice(0, 3).join(' | ')}]`,
      contribution: reviewScore * REVIEW_WEIGHT,
      triggeredRule: `review:${reviewed.length}/${REVIEW_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `reason=${reasoningScore.toFixed(2)} balance=${balancedConfidence.toFixed(2)} review=${reviewScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sMetaCognition: SignalDefinition = {
  id: 'sMetaCognition',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'SE',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as META_COGNITION_VERSION };
