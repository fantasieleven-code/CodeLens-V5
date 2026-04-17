/**
 * Module C signal-local types.
 *
 * Shared across the MC signals folder. `BeliefUpdateInput` mirrors Round 3
 * Part 3 调整 3 L417-L425; other MC signals (sReflectionDepth /
 * sBoundaryAwareness / sCommunicationClarity) land in Task 13 and will share
 * the same extraction helpers.
 */

import type { V5ModuleCAnswer } from '@codelens-v5/shared';

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
