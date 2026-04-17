/**
 * sModifyQuality — Task 13c (MB Stage 2 quality).
 *
 * Measures how much the candidate modifies AI-generated code vs. letting
 * diffs land untouched. A candidate who accepts 500 diff-lines unchanged
 * (modifyRatio → 0) scored lower than one who applies diffs and then
 * keystrokes another 200 characters of fixes on top (modifyRatio ~ 0.3-0.5).
 *
 * V4 had block-level modification events; V5 editorBehavior only aggregates
 * keystrokes on editSessions. V5-native proxy (documented deviation):
 *
 *   totalKeystrokes = sum(editSessions[].keystrokeCount)
 *   totalAiLines    = sum(diffEvents[].linesAdded where accepted=true)
 *                     + count(aiCompletionEvents where accepted=true)
 *   modifyRatio     = totalKeystrokes / (totalKeystrokes + 12 × totalAiLines)
 *     (≈12 chars per line of AI-added code — normalizes the units)
 *   score           = 1 - 4 × (modifyRatio - 0.4)^2   (inverse U, peak 0.4)
 *
 * Fallback: null when no diff/completion accepts AND no editSessions.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sModifyQuality@v1';
const PEAK_RATIO = 0.4;
const CHARS_PER_LINE = 12;

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const keystrokes = (behavior.editSessions ?? []).reduce(
    (acc, s) => acc + (s.keystrokeCount ?? 0),
    0,
  );
  const diffLines = (behavior.diffEvents ?? [])
    .filter((e) => e.accepted)
    .reduce((acc, e) => acc + (e.linesAdded ?? 0), 0);
  const completionAccepts = (behavior.aiCompletionEvents ?? []).filter((e) => e.accepted).length;
  const aiLines = diffLines + completionAccepts;

  if (keystrokes === 0 && aiLines === 0) return nullResult(ALGORITHM_VERSION);

  const denom = keystrokes + CHARS_PER_LINE * aiLines;
  const modifyRatio = denom === 0 ? 0 : keystrokes / denom;
  const score = clamp01(1 - 4 * Math.pow(modifyRatio - PEAK_RATIO, 2));

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.editSessions',
      excerpt: `total_keystrokes=${keystrokes}`,
      contribution: 0,
      triggeredRule: 'keystroke_total',
    },
    {
      source: 'submissions.mb.editorBehavior.diffEvents+aiCompletionEvents',
      excerpt: `ai_diff_lines=${diffLines} completion_accepts=${completionAccepts} ai_units=${aiLines}`,
      contribution: 0,
      triggeredRule: 'ai_output_volume',
    },
    {
      source: 'tier',
      excerpt: `modify_ratio=${modifyRatio.toFixed(2)} peak=${PEAK_RATIO} → ${score.toFixed(3)}`,
      contribution: score,
      triggeredRule: 'inverse_u_curve',
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sModifyQuality: SignalDefinition = {
  id: 'sModifyQuality',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as MODIFY_QUALITY_VERSION };
