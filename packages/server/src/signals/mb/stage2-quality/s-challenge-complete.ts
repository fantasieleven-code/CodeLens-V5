/**
 * sChallengeComplete — Task 13c (MB Stage 2 quality).
 *
 * Measures whether the candidate actually completed the feature. Final
 * test pass rate is the ground truth; test-run count contributes a smaller
 * "they engaged the test loop" signal so a candidate who passed 50 % but
 * never ran tests scores below one who passed 50 % after 4 iterations.
 *
 * backend-agent-tasks.md L1515: "testPassRate 不是强制门槛(即使 0% 也能提交,
 * 但会影响 sChallengeComplete 信号)".
 *
 * V5-native composite:
 *   passScore      = finalTestPassRate
 *   testRunsScore  = clamp01(testRuns.length / 3)
 *
 *   sChallengeComplete = passScore × 0.8 + testRunsScore × 0.2
 *
 * Fallback: null when finalTestPassRate missing AND no testRuns.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sChallengeComplete@v1';
const PASS_WEIGHT = 0.8;
const RUNS_WEIGHT = 0.2;
const RUNS_TARGET = 3;

async function compute(input: SignalInput): Promise<SignalResult> {
  const mb = input.submissions.mb;
  if (!mb) return nullResult(ALGORITHM_VERSION);

  const passRate = mb.finalTestPassRate;
  const testRuns = mb.editorBehavior?.testRuns ?? [];

  if (typeof passRate !== 'number' && testRuns.length === 0) return nullResult(ALGORITHM_VERSION);

  const passScore = clamp01(typeof passRate === 'number' ? passRate : 0);
  const testRunsScore = clamp01(testRuns.length / RUNS_TARGET);

  const value = passScore * PASS_WEIGHT + testRunsScore * RUNS_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.finalTestPassRate',
      excerpt: `pass_rate=${passScore.toFixed(2)}`,
      contribution: passScore * PASS_WEIGHT,
      triggeredRule: `pass_rate:${passScore.toFixed(2)}`,
    },
    {
      source: 'submissions.mb.editorBehavior.testRuns',
      excerpt: `test_runs=${testRuns.length}`,
      contribution: testRunsScore * RUNS_WEIGHT,
      triggeredRule: `test_runs:${testRuns.length}/${RUNS_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `pass=${passScore.toFixed(2)} runs=${testRunsScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sChallengeComplete: SignalDefinition = {
  id: 'sChallengeComplete',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CHALLENGE_COMPLETE_VERSION };
