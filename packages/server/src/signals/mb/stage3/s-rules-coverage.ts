/**
 * sRulesCoverage — Task 13c (MB Stage 3 standards).
 *
 * Measures how many of the 5 core rule categories the candidate's RULES.md
 * covers: bug_prevention / code_quality / testing / logging / error_handling.
 * Rules that address all 5 signal a senior who has seen production pain
 * vs. a junior who only wrote "code should be readable".
 *
 * Categories defined in mb/types.ts (RULES_CATEGORY_MARKERS).
 *
 *   covered = categories where ≥1 keyword hits in rulesContent (case-insensitive)
 *   sRulesCoverage = covered / 5
 *
 * Fallback: null when standards.rulesContent missing or empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { categoryCoverage, finalize, nullResult, RULES_CATEGORY_MARKERS, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sRulesCoverage@v1';

async function compute(input: SignalInput): Promise<SignalResult> {
  const rulesContent = input.submissions.mb?.standards?.rulesContent?.trim();
  if (!rulesContent) return nullResult(ALGORITHM_VERSION);

  const { covered, total, hitCategories } = categoryCoverage(rulesContent, RULES_CATEGORY_MARKERS);
  const value = covered / total;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: truncate(rulesContent),
      contribution: 0,
      triggeredRule: `content_length:${rulesContent.length}`,
    },
    {
      source: 'tier',
      excerpt: `covered=[${hitCategories.join(',')}] (${covered}/${total})`,
      contribution: value,
      triggeredRule: `coverage:${covered}/${total}`,
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sRulesCoverage: SignalDefinition = {
  id: 'sRulesCoverage',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as RULES_COVERAGE_VERSION };
