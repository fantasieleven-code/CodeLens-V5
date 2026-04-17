/**
 * sFileNavigationEfficiency — Task 13c (MB Cursor behavior).
 *
 * Kendall-tau rank correlation between the order the candidate first opens
 * each scaffold file and the scaffold's dependencyOrder. High tau means
 * the candidate read bottom-up (repo → service → controller) — low tau
 * means random clicking.
 *
 * Pseudocode: design-reference-full.md L1651-1678.
 *
 *   openOrder = dedup(history.filter(action='open').map(filePath))
 *   tau       = kendallTau(openOrder, dependencyOrder)
 *   score     = (tau + 1) / 2
 *
 * Fallback:
 *   - null when fileNavigationHistory empty OR no opens.
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

const ALGORITHM_VERSION = 'sFileNavigationEfficiency@v1';

async function compute(input: SignalInput): Promise<SignalResult> {
  const history = input.submissions.mb?.editorBehavior?.fileNavigationHistory ?? [];
  if (history.length === 0) return nullResult(ALGORITHM_VERSION);

  const exam = getMbExamData(input.examData);
  const dependencyOrder = exam?.scaffold?.dependencyOrder ?? [];
  if (dependencyOrder.length < 2) return nullResult(ALGORITHM_VERSION);

  const seen = new Set<string>();
  const openOrder: string[] = [];
  for (const event of history) {
    if (event.action === 'open' && !seen.has(event.filePath)) {
      seen.add(event.filePath);
      openOrder.push(event.filePath);
    }
  }
  if (openOrder.length < 2) return nullResult(ALGORITHM_VERSION);

  const tau = kendallTau(openOrder, dependencyOrder);
  if (tau === null) return nullResult(ALGORITHM_VERSION);

  const score = clamp01((tau + 1) / 2);

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.fileNavigationHistory',
      excerpt: truncate(`open_order=[${openOrder.join(',')}]`),
      contribution: 0,
      triggeredRule: `open_order_len:${openOrder.length}`,
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

export const sFileNavigationEfficiency: SignalDefinition = {
  id: 'sFileNavigationEfficiency',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as FILE_NAVIGATION_EFFICIENCY_VERSION };
