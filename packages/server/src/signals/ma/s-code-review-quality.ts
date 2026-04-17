/**
 * sCodeReviewQuality — Task 13b.
 *
 * Measures the quality of the R2 code review: detection precision / recall
 * against ground-truth `defects` + `decoys`, plus V5-specific bonuses for
 * commentType diversity and comment substantivity.
 *
 * backend-agent-tasks.md L63 + L86-87:
 *   - V5 algorithm: precision × recall × diversity × comment-quality
 *   - V4 fallback: "如果所有 commentType 都是 'bug',降级为 V4 sDefectDetection
 *     计算逻辑（确保不退步）" — pure F1 on defect detection.
 *
 * V4 sDefectDetection source is not in the V5 repo (see CLAUDE.md: legacy/v4
 * branch on separate repo). The fallback body is reconstructed as F1 over
 * (TP, FP, FN) where TP matches `defectId` and FP hits decoys by line number
 * or matches neither. Documented deviation.
 *
 * V5 composite (when at least one non-bug commentType is present):
 *   sCodeReviewQuality = f1 × 0.7
 *                      + commentTypeDiversity × 0.15
 *                      + commentSubstantivity × 0.15
 *
 * where
 *   f1                    — 2·P·R / (P+R) with TP by defectId match
 *   commentTypeDiversity  — distinct commentTypes used / 4
 *   commentSubstantivity  — mean over markedDefects of min(1, len(comment)/40)
 *
 * Fallback: null when round2 missing or markedDefects empty.
 */

import {
  V5Dimension,
  type MAModuleSpecific,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
  type V5ModuleASubmission,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMaExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sCodeReviewQuality@v1';

const F1_WEIGHT = 0.7;
const DIVERSITY_WEIGHT = 0.15;
const SUBSTANTIVITY_WEIGHT = 0.15;
const COMMENT_SUBSTANTIVE_CHARS = 40;

type MarkedDefect = V5ModuleASubmission['round2']['markedDefects'][number];
type ExamDefect = MAModuleSpecific['defects'][number];
type Decoy = MAModuleSpecific['decoys'][number];

function classify(
  marked: MarkedDefect[],
  actual: ExamDefect[],
  decoys: Decoy[],
): { tp: number; fp: number; fn: number; tpIds: string[] } {
  const actualIds = new Set(actual.map((d) => d.defectId));
  const decoyLines = new Set(decoys.map((d) => d.line));
  const seenIds = new Set<string>();
  let tp = 0;
  let fp = 0;
  const tpIds: string[] = [];
  for (const m of marked) {
    if (actualIds.has(m.defectId) && !seenIds.has(m.defectId)) {
      tp += 1;
      tpIds.push(m.defectId);
      seenIds.add(m.defectId);
      continue;
    }
    // FP if it matches a decoy's defectId-shape OR references a decoy line in the comment
    const refersToDecoy = Array.from(decoyLines).some((ln) =>
      m.comment?.includes(`line ${ln}`) || m.comment?.includes(`行${ln}`) || m.comment?.includes(`${ln}行`),
    );
    if (!actualIds.has(m.defectId) || refersToDecoy) fp += 1;
  }
  const fn = actual.length - tp;
  return { tp, fp, fn, tpIds };
}

function f1Score(tp: number, fp: number, fn: number): { f1: number; precision: number; recall: number } {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { f1, precision, recall };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA as V5ModuleASubmission | undefined;
  if (!sub?.round2?.markedDefects || sub.round2.markedDefects.length === 0) {
    return nullResult(ALGORITHM_VERSION);
  }
  const exam = getMaExamData(input.examData);
  if (!exam) return nullResult(ALGORITHM_VERSION);

  const marked = sub.round2.markedDefects;
  const { tp, fp, fn, tpIds } = classify(marked, exam.defects ?? [], exam.decoys ?? []);
  const { f1, precision, recall } = f1Score(tp, fp, fn);

  const distinctTypes = new Set(marked.map((m) => m.commentType));
  const allBugs = distinctTypes.size === 1 && distinctTypes.has('bug');

  const meanCommentLen =
    marked.reduce((acc, m) => acc + Math.min(1, (m.comment ?? '').trim().length / COMMENT_SUBSTANTIVE_CHARS), 0) /
    marked.length;

  let value: number;
  let branch: 'v4_fallback' | 'v5_composite';
  if (allBugs) {
    branch = 'v4_fallback';
    value = f1;
  } else {
    branch = 'v5_composite';
    const diversity = distinctTypes.size / 4;
    value = f1 * F1_WEIGHT + diversity * DIVERSITY_WEIGHT + meanCommentLen * SUBSTANTIVITY_WEIGHT;
  }

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round2.markedDefects',
      excerpt: `marked=${marked.length} tp=${tp} fp=${fp} fn=${fn} tpIds=[${tpIds.slice(0, 3).join(',')}]`,
      contribution: f1 * (branch === 'v4_fallback' ? 1 : F1_WEIGHT),
      triggeredRule: `f1=${f1.toFixed(2)} p=${precision.toFixed(2)} r=${recall.toFixed(2)}`,
    },
    {
      source: 'submissions.moduleA.round2.markedDefects[].commentType',
      excerpt: `distinct_types=[${Array.from(distinctTypes).join(',')}]`,
      contribution: branch === 'v4_fallback' ? 0 : (distinctTypes.size / 4) * DIVERSITY_WEIGHT,
      triggeredRule: `comment_type_diversity:${distinctTypes.size}/4`,
    },
    {
      source: 'submissions.moduleA.round2.markedDefects[].comment',
      excerpt: truncate(marked.map((m) => m.comment).filter(Boolean).join(' | ')),
      contribution: branch === 'v4_fallback' ? 0 : meanCommentLen * SUBSTANTIVITY_WEIGHT,
      triggeredRule: `comment_substantivity:${meanCommentLen.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `branch=${branch} allBugs=${allBugs} f1=${f1.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: branch,
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sCodeReviewQuality: SignalDefinition = {
  id: 'sCodeReviewQuality',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CODE_REVIEW_QUALITY_VERSION };
