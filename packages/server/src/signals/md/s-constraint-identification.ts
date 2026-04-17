/**
 * sConstraintIdentification — Task 13d (MD pure-rule).
 *
 * Scores how well the candidate identified non-functional constraint
 * categories during the MD design stage. Pure rule; no LLM.
 *
 * backend-agent-tasks.md L138: 类别覆盖：5+类=1.0, 3-4=0.7, <3=0.3。
 *
 * V5-native extension: "coverage" counts **how many of the exam's
 * `constraintCategories` the candidate picked**, not just raw list size.
 * A candidate who selects 5 items that all map to the same category only
 * scores 1 category covered.
 *
 *   coveredCategories = |selected ∩ examCategories|
 *   tier score        = coveredCategories >= 5 ? 1.0
 *                     : coveredCategories >= 3 ? 0.7
 *                     : coveredCategories >= 1 ? 0.3
 *                     : 0
 *
 * When `examData.MD.constraintCategories` is missing (e.g. older fixtures),
 * fall back to counting the candidate's raw `constraintsSelected.length`.
 *
 * Fallback: null when `submissions.moduleD` missing OR no constraints selected.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { finalize, getMdExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sConstraintIdentification@v1';

function tierScore(coveredCount: number): number {
  if (coveredCount >= 5) return 1.0;
  if (coveredCount >= 3) return 0.7;
  if (coveredCount >= 1) return 0.3;
  return 0;
}

function matchedCategoryCount(selected: string[], examCategories: string[]): string[] {
  if (examCategories.length === 0) return [];
  const hit = new Set<string>();
  const selectedLower = selected.map((s) => s.toLowerCase());
  for (const cat of examCategories) {
    const catLower = cat.toLowerCase();
    const matched = selectedLower.some((s) => s.includes(catLower) || catLower.includes(s));
    if (matched) hit.add(cat);
  }
  return Array.from(hit);
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const md = input.submissions.moduleD;
  if (!md) return nullResult(ALGORITHM_VERSION);

  const selected = md.constraintsSelected ?? [];
  if (selected.length === 0) return nullResult(ALGORITHM_VERSION);

  const exam = getMdExamData(input.examData);
  const examCategories = exam?.constraintCategories ?? [];

  let matched: string[] = [];
  let coveredCount = 0;
  let ruleLabel: string;
  if (examCategories.length > 0) {
    matched = matchedCategoryCount(selected, examCategories);
    coveredCount = matched.length;
    ruleLabel = `categories_matched:${coveredCount}/${examCategories.length}`;
  } else {
    // No exam taxonomy — score by raw selection count, deduped case-insensitively.
    const distinct = new Set(selected.map((s) => s.trim().toLowerCase()).filter(Boolean));
    coveredCount = distinct.size;
    ruleLabel = `distinct_selections:${coveredCount}`;
  }

  const value = tierScore(coveredCount);

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleD.constraintsSelected',
      excerpt: truncate(selected.join(', ')),
      contribution: value,
      triggeredRule: ruleLabel,
    },
    {
      source: 'examData.MD.constraintCategories',
      excerpt:
        examCategories.length > 0
          ? `exam_categories=${examCategories.length}; matched=[${matched.join(',')}]`
          : '(no exam taxonomy — raw-count fallback)',
      contribution: 0,
      triggeredRule: `tier:${value.toFixed(1)}`,
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sConstraintIdentification: SignalDefinition = {
  id: 'sConstraintIdentification',
  dimension: V5Dimension.SYSTEM_DESIGN,
  moduleSource: 'MD',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CONSTRAINT_IDENTIFICATION_VERSION };
