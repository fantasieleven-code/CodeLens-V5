/**
 * sHiddenBugFound — Task 13b.
 *
 * Measures whether the candidate caught the high-severity defects in the
 * R2 code-review round. Cosmetic issues (minor severity) do not count toward
 * this signal — the goal is to distinguish candidates who find real bugs
 * from those who only find nits.
 *
 * backend-agent-tasks.md L64 lists sHiddenBugFound as "纯规则 — codeQuality"
 * without explicit weights. V5-native algorithm (documented deviation):
 *
 *   sHiddenBugFound = (critical_hits × 1.0 + major_hits × 0.7)
 *                   / (critical_total × 1.0 + major_total × 0.7)
 *
 * A matched defect must additionally be flagged with commentType 'bug' to
 * count — if the candidate noticed it but labelled it 'nit', that signals
 * under-estimation of severity and is scored at half credit.
 *
 * Fallback: null when round2 missing or exam has no critical/major defects.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMaExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sHiddenBugFound@v1';

const CRITICAL_WEIGHT = 1.0;
const MAJOR_WEIGHT = 0.7;
const MISCLASSIFIED_PENALTY = 0.5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub?.round2?.markedDefects) return nullResult(ALGORITHM_VERSION);
  const exam = getMaExamData(input.examData);
  if (!exam?.defects) return nullResult(ALGORITHM_VERSION);

  const highSeverity = exam.defects.filter((d) => d.severity === 'critical' || d.severity === 'major');
  if (highSeverity.length === 0) return nullResult(ALGORITHM_VERSION);

  const markedMap = new Map(sub.round2.markedDefects.map((m) => [m.defectId, m]));

  let gainedScore = 0;
  let maxScore = 0;
  const hitIds: string[] = [];
  const missIds: string[] = [];
  const misclassifiedIds: string[] = [];

  for (const d of highSeverity) {
    const weight = d.severity === 'critical' ? CRITICAL_WEIGHT : MAJOR_WEIGHT;
    maxScore += weight;
    const m = markedMap.get(d.defectId);
    if (!m) {
      missIds.push(d.defectId);
      continue;
    }
    if (m.commentType === 'bug') {
      gainedScore += weight;
      hitIds.push(d.defectId);
    } else {
      gainedScore += weight * MISCLASSIFIED_PENALTY;
      misclassifiedIds.push(`${d.defectId}:${m.commentType}`);
    }
  }

  const value = maxScore === 0 ? 0 : gainedScore / maxScore;

  const evidence: SignalEvidence[] = [
    {
      source: 'examData.MA.defects',
      excerpt: `high_severity_total=${highSeverity.length} critical=${highSeverity.filter((d) => d.severity === 'critical').length} major=${highSeverity.filter((d) => d.severity === 'major').length}`,
      contribution: 0,
      triggeredRule: 'exam_baseline',
    },
    {
      source: 'submissions.moduleA.round2.markedDefects',
      excerpt: truncate(`hits=[${hitIds.join(',')}] misses=[${missIds.join(',')}]`),
      contribution: value,
      triggeredRule: `high_severity_hits:${hitIds.length}/${highSeverity.length}`,
    },
  ];

  if (misclassifiedIds.length > 0) {
    evidence.push({
      source: 'submissions.moduleA.round2.markedDefects[].commentType',
      excerpt: misclassifiedIds.join(', '),
      contribution: 0,
      triggeredRule: `severity_misclassified:${misclassifiedIds.length}`,
    });
  }

  evidence.push({
    source: 'tier',
    excerpt: `gained=${gainedScore.toFixed(2)} max=${maxScore.toFixed(2)} → ${value.toFixed(3)}`,
    contribution: 0,
    triggeredRule: 'weighted_severity_recall',
  });

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sHiddenBugFound: SignalDefinition = {
  id: 'sHiddenBugFound',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as HIDDEN_BUG_FOUND_VERSION };
