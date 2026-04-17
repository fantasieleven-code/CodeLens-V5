/**
 * sReviewPrioritization — Task 13b.
 *
 * Measures whether the candidate prioritized high-severity defects first —
 * i.e. did they flag critical bugs before cosmetic nits?
 *
 * backend-agent-tasks.md L65 lists sReviewPrioritization as "纯规则 —
 * codeQuality" without explicit weights. V5-native algorithm (documented
 * deviation): computes the weighted severity of each markedDefect's position
 * using exponential decay, then normalizes against the theoretical max.
 *
 *   position_weight(i) = 2 ^ -i      (first = 1, second = 0.5, third = 0.25, ...)
 *   severity_value(d)  = 1.0 (critical) / 0.6 (major) / 0.2 (minor) / 0 (unmatched)
 *
 *   gained = sum over marked (severity_value × position_weight)
 *   ideal  = sum over exam defects sorted severity desc (severity_value × position_weight)
 *          (ideal truncated to marked.length — candidate can't beat their own n)
 *
 *   sReviewPrioritization = gained / ideal
 *
 * Fallback: null when round2 has fewer than 2 markedDefects or exam defects
 * missing (signal needs at least 2 items to distinguish prioritization).
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMaExamData, nullResult } from './types.js';

const ALGORITHM_VERSION = 'sReviewPrioritization@v1';

const SEVERITY_VALUE: Record<'critical' | 'major' | 'minor', number> = {
  critical: 1.0,
  major: 0.6,
  minor: 0.2,
};

function positionWeight(index: number): number {
  return Math.pow(2, -index);
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  const marked = sub?.round2?.markedDefects ?? [];
  if (marked.length < 2) return nullResult(ALGORITHM_VERSION);
  const exam = getMaExamData(input.examData);
  if (!exam?.defects || exam.defects.length < 2) return nullResult(ALGORITHM_VERSION);

  const defectMap = new Map(exam.defects.map((d) => [d.defectId, d]));

  let gained = 0;
  const hitSequence: string[] = [];
  marked.forEach((m, i) => {
    const d = defectMap.get(m.defectId);
    if (!d) {
      hitSequence.push(`[${i}]miss`);
      return;
    }
    const sv = SEVERITY_VALUE[d.severity] ?? 0;
    gained += sv * positionWeight(i);
    hitSequence.push(`[${i}]${d.severity}`);
  });

  const idealOrder = [...exam.defects].sort(
    (a, b) => (SEVERITY_VALUE[b.severity] ?? 0) - (SEVERITY_VALUE[a.severity] ?? 0),
  );
  const truncatedIdeal = idealOrder.slice(0, marked.length);
  const ideal = truncatedIdeal.reduce(
    (acc, d, i) => acc + (SEVERITY_VALUE[d.severity] ?? 0) * positionWeight(i),
    0,
  );

  const value = ideal === 0 ? 0 : gained / ideal;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round2.markedDefects',
      excerpt: `sequence=${hitSequence.join(' ')}`,
      contribution: value,
      triggeredRule: `prioritization_gained:${gained.toFixed(3)}`,
    },
    {
      source: 'examData.MA.defects',
      excerpt: `ideal_sequence=[${truncatedIdeal.map((d) => d.severity).join(',')}]`,
      contribution: 0,
      triggeredRule: `ideal_ratio:${ideal.toFixed(3)}`,
    },
    {
      source: 'tier',
      excerpt: `gained=${gained.toFixed(3)} ideal=${ideal.toFixed(3)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'gained_over_ideal',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sReviewPrioritization: SignalDefinition = {
  id: 'sReviewPrioritization',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as REVIEW_PRIORITIZATION_VERSION };
