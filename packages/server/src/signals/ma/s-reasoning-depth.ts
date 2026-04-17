/**
 * sReasoningDepth — Task 13b.
 *
 * Measures whether the R1 reasoning + tradeoff articulation is deep enough to
 * distinguish an S-tier candidate from an A-tier one.
 *
 * backend-agent-tasks.md L59 lists sReasoningDepth as "纯规则 — technicalJudgment"
 * without explicit weights. V5-native composite (documented deviation, same
 * substantivity heuristic as sBaselineReading L2/L3):
 *   sReasoningDepth = reasoningSubstantivity × 0.6
 *                   + tradeoffSubstantivity  × 0.4
 *
 * Each substantivity score is length_coverage×0.5 + tech_term_density×0.5
 * against the target thresholds in ma/types.ts.
 *
 * Fallback: null when round1 missing.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  REASONING_SUBSTANTIVE_CHARS,
  clamp01,
  finalize,
  nullResult,
  substantivity,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sReasoningDepth@v1';

const REASONING_WEIGHT = 0.6;
const TRADEOFF_WEIGHT = 0.4;
const REASONING_TARGET_TERMS = 4;
const TRADEOFF_TARGET_TERMS = 3;

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub?.round1) return nullResult(ALGORITHM_VERSION);

  const reasoning = sub.round1.reasoning ?? '';
  const tradeoff = sub.round1.structuredForm?.tradeoff ?? '';

  const rSub = substantivity(reasoning, REASONING_SUBSTANTIVE_CHARS, REASONING_TARGET_TERMS);
  const tSub = substantivity(tradeoff, REASONING_SUBSTANTIVE_CHARS / 2, TRADEOFF_TARGET_TERMS);

  const value = rSub.value * REASONING_WEIGHT + tSub.value * TRADEOFF_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round1.reasoning',
      excerpt: truncate(reasoning),
      contribution: rSub.value * REASONING_WEIGHT,
      triggeredRule: `reasoning_substantivity:${rSub.termHits.slice(0, 3).join(',') || 'length-only'}`,
    },
    {
      source: 'submissions.moduleA.round1.structuredForm.tradeoff',
      excerpt: truncate(tradeoff),
      contribution: tSub.value * TRADEOFF_WEIGHT,
      triggeredRule: `tradeoff_substantivity:${tSub.termHits.slice(0, 3).join(',') || 'length-only'}`,
    },
    {
      source: 'tier',
      excerpt: `r=${rSub.value.toFixed(2)} t=${tSub.value.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sReasoningDepth: SignalDefinition = {
  id: 'sReasoningDepth',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as REASONING_DEPTH_VERSION };
