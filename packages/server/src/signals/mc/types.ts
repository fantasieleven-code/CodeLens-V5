/**
 * Module C signal-local types + shared helpers.
 *
 * Task 11 landed `BeliefUpdateInput` + `BELIEF_UPDATE_CHALLENGE_ROUND`;
 * Task 13e (sBoundaryAwareness / sCommunicationClarity / sReflectionDepth)
 * shares the marker-counting + answer-filter helpers below. Minimum answer
 * length (30) and minimum MC rounds (3) are fixed by design-reference-full.md
 * L1987-2118.
 */

import {
  SIGNAL_EVIDENCE_LIMIT,
  type SignalEvidence,
  type SignalResult,
  type V5ModuleCAnswer,
} from '@codelens-v5/shared';

/**
 * Input for `sBeliefUpdateMagnitude`. Built inside the signal's `compute`
 * from `SignalInput.submissions.moduleC` + pre-MC stance extraction; this
 * type only documents the logical shape so unit tests can construct minimal
 * fixtures without a full `SignalInput`.
 */
export interface BeliefUpdateInput {
  /** Emma's challenge text at contradiction round (default: round 2). */
  round2ChallengeText: string;
  /** Candidate's response to the challenge. */
  round2Response: string;
  /** Candidate answers in rounds 3-5. */
  round3PlusResponses: string[];
  /**
   * Candidate's pre-MC core stance (from selfAssess.reasoning with fallback
   * to moduleA.round1.reasoning). Retained for evidence citations even though
   * the scoring algorithm reads only the Round 2+ text.
   */
  preModuleCStance: string;
}

/** The contradiction round MC uses as the belief-update anchor (V5.0 = round 2). */
export const BELIEF_UPDATE_CHALLENGE_ROUND = 2;

export type ModuleCAnswers = V5ModuleCAnswer[];

// ───────────────────────── Shared MC helpers ─────────────────────────

/** Minimum answer length for a round to count toward marker averages. */
export const MIN_ANSWER_LEN = 30;
/** Minimum number of MC rounds for the scoring signals to emit non-null. */
export const MIN_MC_ROUNDS = 3;

/** Filter to answers that exist and clear the length threshold. */
export function substantiveAnswers(answers: V5ModuleCAnswer[] | undefined): V5ModuleCAnswer[] {
  if (!answers) return [];
  return answers.filter((a) => typeof a.answer === 'string' && a.answer.length >= MIN_ANSWER_LEN);
}

/**
 * Count marker occurrences in `text`. Includes overlapping matches via
 * `indexOf` sliding rather than counting only distinct markers — this matches
 * the design-reference intent where density matters (e.g. 3 × "可能" counts
 * as 3, not 1).
 */
export function countMarkers(text: string, markers: readonly string[]): number {
  let total = 0;
  for (const m of markers) {
    if (!m) continue;
    let i = text.indexOf(m);
    while (i !== -1) {
      total += 1;
      i = text.indexOf(m, i + m.length);
    }
  }
  return total;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/** Cap an excerpt to the shared evidence length limit (200 chars). */
export function truncate(text: string, max = 200): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/** Standard empty result shared by all MC signals when data is unavailable. */
export function nullResult(algorithmVersion: string): SignalResult {
  return { value: null, evidence: [], computedAt: Date.now(), algorithmVersion };
}

/** Finalize a non-null result with the evidence-cap + timestamp invariants. */
export function finalize(
  value: number,
  evidence: SignalEvidence[],
  algorithmVersion: string,
): SignalResult {
  return {
    value: clamp01(value),
    evidence: evidence.slice(0, SIGNAL_EVIDENCE_LIMIT),
    computedAt: Date.now(),
    algorithmVersion,
  };
}
