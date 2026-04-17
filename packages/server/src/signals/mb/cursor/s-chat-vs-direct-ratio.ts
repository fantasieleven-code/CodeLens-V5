/**
 * sChatVsDirectRatio — Task 13c (MB Cursor behavior).
 *
 * Inverse-U on ratio of "chat actions" to all editing actions, peak at 0.4.
 * Candidates who chat-only miss the fast path of inline completions; those
 * who only keystroke miss the planning value of chat.
 *
 * Pseudocode: design-reference-full.md L1617-1648 (event-based, Karpathy
 * correction to an earlier duration-based proposal).
 *
 * V5-native deviation (documented in mb/types.ts):
 *   The shared editorBehavior shape aggregates keystrokes into
 *   editSessions[].keystrokeCount (no raw keystroke stream). Substitute:
 *   each editSession with keystrokeCount >= 10 counts as one direct-keystroke
 *   sequence, per countDirectActionSessions().
 *
 *   chatActions     = chatEvents.length
 *   directActions   = countDirectActionSessions(editSessions, 10)
 *                      + aiCompletionEvents with accepted=true
 *   total           = chatActions + directActions
 *   chatRatio       = chatActions / total
 *   score           = clamp01(1 - 4 * (chatRatio - 0.4)^2)
 *
 * Fallback: null when total < 5 (sample too small).
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, countDirectActionSessions, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sChatVsDirectRatio@v1';
const PEAK_RATIO = 0.4;
const MIN_TOTAL = 5;
const MIN_KEYSTROKES = 10;

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const chatActions = (behavior.chatEvents ?? []).length;
  const keystrokeSequences = countDirectActionSessions(
    behavior.editSessions ?? [],
    MIN_KEYSTROKES,
  );
  const completionAccepts = (behavior.aiCompletionEvents ?? []).filter((e) => e.accepted).length;
  const directActions = keystrokeSequences + completionAccepts;

  const total = chatActions + directActions;
  if (total < MIN_TOTAL) return nullResult(ALGORITHM_VERSION);

  const chatRatio = chatActions / total;
  const score = clamp01(1 - 4 * Math.pow(chatRatio - PEAK_RATIO, 2));

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.chatEvents',
      excerpt: `chat_actions=${chatActions}`,
      contribution: 0,
      triggeredRule: 'chat_action_count',
    },
    {
      source: 'submissions.mb.editorBehavior.editSessions+aiCompletionEvents',
      excerpt: `keystroke_sequences=${keystrokeSequences} completion_accepts=${completionAccepts} direct=${directActions}`,
      contribution: 0,
      triggeredRule: 'direct_action_count',
    },
    {
      source: 'tier',
      excerpt: `chatRatio=${chatRatio.toFixed(2)} peak=${PEAK_RATIO} → ${score.toFixed(3)}`,
      contribution: score,
      triggeredRule: 'inverse_u_curve',
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sChatVsDirectRatio: SignalDefinition = {
  id: 'sChatVsDirectRatio',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CHAT_VS_DIRECT_RATIO_VERSION };
