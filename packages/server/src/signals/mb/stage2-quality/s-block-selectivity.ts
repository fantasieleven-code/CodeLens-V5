/**
 * sBlockSelectivity — Task 13c (MB Stage 2 quality).
 *
 * Measures whether the candidate selectively rejects AI output vs. blindly
 * accepting everything or rejecting everything. Inverse-U on rejection
 * rate, peak at 0.3 (mostly accept, sometimes reject when warranted).
 *
 * V4 design-reference-p0.md: "block apply 反 U——C 级应该固定为 100%
 * (无脑全 apply)而不是 0%". Pattern holds in V5: candidates who reject
 * 100 % of AI output (peakRatio=0) or accept 100 % (peakRatio=1) both
 * score low.
 *
 * V5 aggregates:
 *   totalShown    = aiCompletionEvents.length + diffEvents.length
 *   totalRejected = aiCompletionEvents where accepted=false OR rejected=true
 *                    + diffEvents where accepted=false
 *   rejectionRate = totalRejected / totalShown
 *   score         = 1 - 4 × (rejectionRate - 0.3)^2
 *
 * Fallback: null when totalShown < 5.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sBlockSelectivity@v1';
const PEAK_RATIO = 0.3;
const MIN_SHOWN = 5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const completions = behavior.aiCompletionEvents ?? [];
  const diffs = behavior.diffEvents ?? [];
  const totalShown = completions.length + diffs.length;
  if (totalShown < MIN_SHOWN) return nullResult(ALGORITHM_VERSION);

  const completionRejects = completions.filter((e) => !e.accepted || e.rejected === true).length;
  const diffRejects = diffs.filter((e) => !e.accepted).length;
  const totalRejected = completionRejects + diffRejects;

  const rejectionRate = totalRejected / totalShown;
  const score = clamp01(1 - 4 * Math.pow(rejectionRate - PEAK_RATIO, 2));

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.aiCompletionEvents',
      excerpt: `completions=${completions.length} rejects=${completionRejects}`,
      contribution: 0,
      triggeredRule: 'completion_reject_count',
    },
    {
      source: 'submissions.mb.editorBehavior.diffEvents',
      excerpt: `diffs=${diffs.length} rejects=${diffRejects}`,
      contribution: 0,
      triggeredRule: 'diff_reject_count',
    },
    {
      source: 'tier',
      excerpt: `reject_rate=${rejectionRate.toFixed(2)} peak=${PEAK_RATIO} → ${score.toFixed(3)}`,
      contribution: score,
      triggeredRule: 'inverse_u_curve',
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sBlockSelectivity: SignalDefinition = {
  id: 'sBlockSelectivity',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as BLOCK_SELECTIVITY_VERSION };
