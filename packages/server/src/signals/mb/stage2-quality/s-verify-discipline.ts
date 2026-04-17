/**
 * sVerifyDiscipline — Task 13c (MB Stage 2 quality).
 *
 * Measures how often the candidate verified their work by running tests.
 * A candidate who ran tests 6 times (once after each meaningful change)
 * scores higher than one who ran tests only once at submission time.
 *
 * V5-native composite (no V4 pseudocode — this signal historically lived on
 * editSession count, V5 has both testRuns and AI interaction counts):
 *
 *   verifyRate       = testRuns.length / max(1, aiInteractionCount)
 *     aiInteractionCount = chatEvents + accepted completions
 *   verifyRateScore  = clamp01(verifyRate × 2)
 *                      (rate 0.5 → score 1.0, rate 0.25 → 0.5)
 *   testRunsScore    = clamp01(testRuns.length / 5)
 *
 *   sVerifyDiscipline = verifyRateScore × 0.6 + testRunsScore × 0.4
 *
 * Fallback: null when testRuns empty AND no AI interactions.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sVerifyDiscipline@v1';
const RATE_WEIGHT = 0.6;
const RUNS_WEIGHT = 0.4;
const RUNS_TARGET = 5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const testRuns = behavior.testRuns ?? [];
  const chatEvents = behavior.chatEvents ?? [];
  const completionAccepts = (behavior.aiCompletionEvents ?? []).filter((e) => e.accepted).length;
  const aiInteractionCount = chatEvents.length + completionAccepts;

  if (testRuns.length === 0 && aiInteractionCount === 0) return nullResult(ALGORITHM_VERSION);

  const verifyRate = testRuns.length / Math.max(1, aiInteractionCount);
  const verifyRateScore = clamp01(verifyRate * 2);
  const testRunsScore = clamp01(testRuns.length / RUNS_TARGET);

  const value = verifyRateScore * RATE_WEIGHT + testRunsScore * RUNS_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.testRuns',
      excerpt: `test_runs=${testRuns.length}`,
      contribution: testRunsScore * RUNS_WEIGHT,
      triggeredRule: `test_runs:${testRuns.length}/${RUNS_TARGET}`,
    },
    {
      source: 'submissions.mb.editorBehavior.chatEvents+aiCompletionEvents',
      excerpt: `ai_interactions=${aiInteractionCount} rate=${verifyRate.toFixed(2)}`,
      contribution: verifyRateScore * RATE_WEIGHT,
      triggeredRule: `verify_rate:${verifyRate.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `rate=${verifyRateScore.toFixed(2)} runs=${testRunsScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sVerifyDiscipline: SignalDefinition = {
  id: 'sVerifyDiscipline',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as VERIFY_DISCIPLINE_VERSION };
