/**
 * sEditPatternQuality — Task 13c (MB Cursor behavior).
 *
 * Kendall-tau rank correlation between the order the candidate first EDITS
 * each scaffold file and the scaffold's dependencyOrder. Differs from
 * sFileNavigationEfficiency: that signal measures which files you opened
 * to read, this signal measures the order you actually modified them in.
 *
 * Pseudocode: design-reference-full.md L1727-1755.
 *
 *   firstEditTime(filePath) = min(editSessions[filePath].startTime)
 *   editOrder = files sorted by firstEditTime, filtered to dependencyOrder
 *   tau       = kendallTau(editOrder, dependencyOrder)
 *   score     = (tau + 1) / 2
 *
 * Fallback:
 *   - null when editSessions empty.
 *   - null when dependencyOrder missing OR fewer than 2 intersected items.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMbExamData, kendallTau, nullResult, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sEditPatternQuality@v1';

async function compute(input: SignalInput): Promise<SignalResult> {
  const sessions = input.submissions.mb?.editorBehavior?.editSessions ?? [];
  if (sessions.length === 0) return nullResult(ALGORITHM_VERSION);

  const exam = getMbExamData(input.examData);
  const dependencyOrder = exam?.scaffold?.dependencyOrder ?? [];
  if (dependencyOrder.length < 2) return nullResult(ALGORITHM_VERSION);

  const firstEdit = new Map<string, number>();
  for (const s of sessions) {
    const prev = firstEdit.get(s.filePath);
    if (prev === undefined || s.startTime < prev) firstEdit.set(s.filePath, s.startTime);
  }

  const editOrder = Array.from(firstEdit.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([p]) => p)
    .filter((p) => dependencyOrder.includes(p));

  if (editOrder.length < 2) return nullResult(ALGORITHM_VERSION);

  const tau = kendallTau(editOrder, dependencyOrder);
  if (tau === null) return nullResult(ALGORITHM_VERSION);

  const score = clamp01((tau + 1) / 2);

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.editSessions',
      excerpt: truncate(`edit_order=[${editOrder.join(',')}]`),
      contribution: 0,
      triggeredRule: `edit_order_len:${editOrder.length}`,
    },
    {
      source: 'examData.MB.scaffold.dependencyOrder',
      excerpt: truncate(`dependency_order=[${dependencyOrder.join(',')}]`),
      contribution: 0,
      triggeredRule: `dependency_order_len:${dependencyOrder.length}`,
    },
    {
      source: 'tier',
      excerpt: `kendall_tau=${tau.toFixed(3)} → ${score.toFixed(3)}`,
      contribution: score,
      triggeredRule: 'kendall_tau_to_01',
    },
  ];

  return finalize(score, evidence, ALGORITHM_VERSION);
}

export const sEditPatternQuality: SignalDefinition = {
  id: 'sEditPatternQuality',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as EDIT_PATTERN_QUALITY_VERSION };
