/**
 * sIterationEfficiency — Task 13c (MB Stage 2 execution).
 *
 * Measures how efficiently the candidate iterated to reach their final
 * quality. A candidate who hits 100 % pass rate in 3 test runs is more
 * efficient than one who needs 15 test runs to reach the same point.
 *
 * backend-agent-tasks.md L100: "迭代次数 vs 最终质量（纯规则）" without
 * explicit weights. V5-native:
 *
 *   qualityScore     = finalTestPassRate
 *   iterationScore   = clamp01(BASELINE_RUNS / max(1, actualIterations))
 *     actualIterations = testRuns.length + chatEvents.length
 *   sIterationEfficiency = quality × 0.6 + iteration × 0.4
 *
 * Fallback: null when finalTestPassRate undefined AND no testRuns/chatEvents.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sIterationEfficiency@v1';
const QUALITY_WEIGHT = 0.6;
const ITERATION_WEIGHT = 0.4;
const BASELINE_RUNS = 5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const mb = input.submissions.mb;
  if (!mb) return nullResult(ALGORITHM_VERSION);

  const testRuns = mb.editorBehavior?.testRuns ?? [];
  const chatEvents = mb.editorBehavior?.chatEvents ?? [];
  const finalPass = mb.finalTestPassRate;

  const hasAnySignal = testRuns.length > 0 || chatEvents.length > 0 || typeof finalPass === 'number';
  if (!hasAnySignal) return nullResult(ALGORITHM_VERSION);

  const qualityScore = clamp01(typeof finalPass === 'number' ? finalPass : 0);
  const actualIterations = testRuns.length + chatEvents.length;
  const iterationScore = clamp01(BASELINE_RUNS / Math.max(1, actualIterations));

  const value = qualityScore * QUALITY_WEIGHT + iterationScore * ITERATION_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.finalTestPassRate',
      excerpt: `pass_rate=${qualityScore.toFixed(2)}`,
      contribution: qualityScore * QUALITY_WEIGHT,
      triggeredRule: `quality_score:${qualityScore.toFixed(2)}`,
    },
    {
      source: 'submissions.mb.editorBehavior.testRuns+chatEvents',
      excerpt: `test_runs=${testRuns.length} chat_events=${chatEvents.length} total=${actualIterations}`,
      contribution: iterationScore * ITERATION_WEIGHT,
      triggeredRule: `iteration_ratio:${BASELINE_RUNS}/${Math.max(1, actualIterations)}`,
    },
    {
      source: 'tier',
      excerpt: `quality=${qualityScore.toFixed(2)} iter=${iterationScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sIterationEfficiency: SignalDefinition = {
  id: 'sIterationEfficiency',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as ITERATION_EFFICIENCY_VERSION };
