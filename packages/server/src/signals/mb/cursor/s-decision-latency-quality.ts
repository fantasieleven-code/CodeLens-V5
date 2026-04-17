/**
 * sDecisionLatencyQuality — Task 13c (MB Cursor behavior, Round 3 new signal).
 *
 * Of the completions the candidate was actually shown and responded to,
 * what fraction were decided in the 500-2000 ms "read-and-think" window vs.
 * reflex-accepted (<500 ms) or AFK (>10 s)? Surfaces candidates who accept
 * by muscle memory vs. those who actually read AI output.
 *
 * Algorithm: v5-design-clarifications.md L499-548 (Round 2 Part 3 调整 4).
 *
 *   validEvents = aiCompletionEvents with shownAt && respondedAt &&
 *                 (documentVisibleMs ?? respondedAt - shownAt) >= 100
 *   latencies   = documentVisibleMs or respondedAt - shownAt
 *   useful      = latencies where ms <= 10000 (AFK filter)
 *   goodRange   = useful where 500 <= ms <= 2000
 *   tooFast     = useful where ms < 500
 *
 *   goodRangeRatio >= 0.5 AND tooFastRatio <= 0.2 → 1.0
 *   goodRangeRatio >= 0.3 AND tooFastRatio <= 0.4 → 0.7
 *   tooFastRatio >= 0.7                           → 0.2
 *   otherwise                                     → 0.4
 *
 * Fallback:
 *   - null when validEvents < 5 (sample too small).
 *   - null when usefulLatencies empty after AFK filter.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sDecisionLatencyQuality@v1';
const MIN_VISIBLE_MS = 100;
const MIN_VALID_EVENTS = 5;
const AFK_CUTOFF_MS = 10_000;
const GOOD_MIN_MS = 500;
const GOOD_MAX_MS = 2_000;

async function compute(input: SignalInput): Promise<SignalResult> {
  const events = input.submissions.mb?.editorBehavior?.aiCompletionEvents ?? [];
  if (events.length === 0) return nullResult(ALGORITHM_VERSION);

  const validEvents = events.filter(
    (e) =>
      typeof e.shownAt === 'number' &&
      typeof e.respondedAt === 'number' &&
      (e.documentVisibleMs ?? e.respondedAt - e.shownAt) >= MIN_VISIBLE_MS,
  );
  if (validEvents.length < MIN_VALID_EVENTS) return nullResult(ALGORITHM_VERSION);

  const latencies = validEvents.map((e) => e.documentVisibleMs ?? e.respondedAt! - e.shownAt!);
  const useful = latencies.filter((ms) => ms <= AFK_CUTOFF_MS);
  if (useful.length === 0) return nullResult(ALGORITHM_VERSION);

  const inGood = useful.filter((ms) => ms >= GOOD_MIN_MS && ms <= GOOD_MAX_MS).length;
  const tooFast = useful.filter((ms) => ms < GOOD_MIN_MS).length;
  const goodRangeRatio = inGood / useful.length;
  const tooFastRatio = tooFast / useful.length;

  let score: number;
  let band: string;
  if (goodRangeRatio >= 0.5 && tooFastRatio <= 0.2) {
    score = 1.0;
    band = 'S_reading_and_thinking';
  } else if (goodRangeRatio >= 0.3 && tooFastRatio <= 0.4) {
    score = 0.7;
    band = 'A_mostly_thoughtful';
  } else if (tooFastRatio >= 0.7) {
    score = 0.2;
    band = 'C_reflex_accept';
  } else {
    score = 0.4;
    band = 'B_mixed_signals';
  }

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.aiCompletionEvents',
      excerpt: `valid=${validEvents.length} useful=${useful.length} good=${inGood} fast=${tooFast}`,
      contribution: 0,
      triggeredRule: `sample_filter_${MIN_VISIBLE_MS}ms_visible`,
    },
    {
      source: 'tier',
      excerpt: `goodRangeRatio=${goodRangeRatio.toFixed(2)} tooFastRatio=${tooFastRatio.toFixed(2)}`,
      contribution: 0,
      triggeredRule: `band_thresholds_${GOOD_MIN_MS}_${GOOD_MAX_MS}`,
    },
    {
      source: 'tier',
      excerpt: `band=${band} → ${score.toFixed(2)}`,
      contribution: score,
      triggeredRule: band,
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sDecisionLatencyQuality: SignalDefinition = {
  id: 'sDecisionLatencyQuality',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as DECISION_LATENCY_QUALITY_VERSION };
