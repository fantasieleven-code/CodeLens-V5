/**
 * sAiCompletionAcceptRate — Task 13c (MB Cursor behavior).
 *
 * Inverse-U score over accept-rate, peaking at 0.6. A candidate who blindly
 * accepts every completion (rate=1.0) and one who never uses them (rate=0)
 * both score low; 50-70 % reflects mature tool-assisted coding.
 *
 * Pseudocode: design-reference-full.md L1588-1610.
 *
 *   shown      = aiCompletionEvents with shown=true (or no shown field set)
 *   accepted   = aiCompletionEvents with accepted=true
 *   rate       = accepted / shown
 *   score      = clamp01(1 - 4 * (rate - 0.6)^2)
 *
 * Fallback: null when shown < 5 (sample too small).
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sAiCompletionAcceptRate@v1';
const PEAK_RATE = 0.6;
const MIN_SHOWN = 5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const events = input.submissions.mb?.editorBehavior?.aiCompletionEvents ?? [];
  if (events.length === 0) return nullResult(ALGORITHM_VERSION);

  const shownEvents = events.filter((e) => e.shown !== false);
  const shown = shownEvents.length;
  if (shown < MIN_SHOWN) return nullResult(ALGORITHM_VERSION);

  const accepted = shownEvents.filter((e) => e.accepted).length;
  const rate = accepted / shown;
  const score = clamp01(1 - 4 * Math.pow(rate - PEAK_RATE, 2));

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.aiCompletionEvents',
      excerpt: `shown=${shown} accepted=${accepted} rate=${rate.toFixed(2)}`,
      contribution: score,
      triggeredRule: `accept_rate_vs_peak_${PEAK_RATE}`,
    },
    {
      source: 'tier',
      excerpt: `inverse_U: 1 - 4 * (${rate.toFixed(2)} - ${PEAK_RATE})^2 = ${score.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'inverse_u_curve',
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sAiCompletionAcceptRate: SignalDefinition = {
  id: 'sAiCompletionAcceptRate',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as AI_COMPLETION_ACCEPT_RATE_VERSION };
