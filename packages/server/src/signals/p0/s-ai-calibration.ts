/**
 * sAiCalibration — Task 13a.
 *
 * Measures the candidate's ability to judge AI-generated code quality across
 * two paired A/B snippets. Per Round 2 Part 3 调整 1
 * (v5-design-clarifications.md L68) the weights are:
 *   sAiCalibration = q1Correct×0.25 + q2Correct×0.25 + reasonQuality×0.5
 *
 * This supersedes design-reference-p0.md L4911 which used a 0.6 / 0.4 split
 * for the single-question original.
 *
 * Correctness comes from comparing `submission.aiOutputJudgment[i].choice`
 * to `examData.P0.aiOutputJudgment[i].groundTruth` (4-value union). Reason
 * quality is a substantivity score over the paired reasoning text using tech
 * term density (same heuristic family as sBaselineReading L2/L3).
 *
 * Fallback: null when phase0 submission or exam data missing.
 */

import {
  V5Dimension,
  type P0ModuleSpecific,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
  type V5Phase0Submission,
} from '@codelens-v5/shared';
import {
  REASON_SUBSTANTIVE_CHARS,
  clamp01,
  countTechTerms,
  finalize,
  getP0ExamData,
  nullResult,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sAiCalibration@v1';

const CORRECTNESS_WEIGHT_PER_Q = 0.25;
const REASON_QUALITY_WEIGHT = 0.5;
const REASON_TARGET_TERMS = 3;

type JudgmentChoice = 'A' | 'B' | 'both_good' | 'both_bad';

function isChoice(s: unknown): s is JudgmentChoice {
  return s === 'A' || s === 'B' || s === 'both_good' || s === 'both_bad';
}

function scoreReason(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length < REASON_SUBSTANTIVE_CHARS / 2) return 0;
  const lengthCoverage = Math.min(1, trimmed.length / (REASON_SUBSTANTIVE_CHARS * 2));
  const { count } = countTechTerms(trimmed);
  const densityCoverage = Math.min(1, count / REASON_TARGET_TERMS);
  return clamp01(0.5 * lengthCoverage + 0.5 * densityCoverage);
}

function scorePair(
  submission: V5Phase0Submission,
  exam: P0ModuleSpecific,
  idx: 0 | 1,
): {
  correct: boolean;
  reasonQuality: number;
  evidence: SignalEvidence[];
} {
  const ev: SignalEvidence[] = [];
  const subEntry = submission.aiOutputJudgment[idx];
  const examEntry = exam.aiOutputJudgment?.[idx];
  if (!subEntry || !examEntry) {
    return { correct: false, reasonQuality: 0, evidence: ev };
  }
  const chosen: JudgmentChoice | null = isChoice(subEntry.choice) ? subEntry.choice : null;
  const correct = chosen !== null && chosen === examEntry.groundTruth;
  ev.push({
    source: `submissions.phase0.aiOutputJudgment[${idx}].choice`,
    excerpt: `choice=${chosen ?? 'unknown'} truth=${examEntry.groundTruth}`,
    contribution: correct ? CORRECTNESS_WEIGHT_PER_Q : 0,
    triggeredRule: correct ? `q${idx + 1}_correct` : `q${idx + 1}_incorrect`,
  });

  const reasoning = subEntry.reasoning ?? '';
  const reasonQuality = scoreReason(reasoning);
  if (reasoning.trim().length > 0) {
    ev.push({
      source: `submissions.phase0.aiOutputJudgment[${idx}].reasoning`,
      excerpt: truncate(reasoning),
      contribution: (reasonQuality * REASON_QUALITY_WEIGHT) / 2,
      triggeredRule: `q${idx + 1}_reason_quality:${reasonQuality.toFixed(2)}`,
    });
  }
  return { correct, reasonQuality, evidence: ev };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.phase0;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const exam = getP0ExamData(input.examData);
  if (!exam) return nullResult(ALGORITHM_VERSION);

  const q1 = scorePair(sub, exam, 0);
  const q2 = scorePair(sub, exam, 1);

  const correctnessScore =
    (q1.correct ? CORRECTNESS_WEIGHT_PER_Q : 0) + (q2.correct ? CORRECTNESS_WEIGHT_PER_Q : 0);
  const reasonMean = (q1.reasonQuality + q2.reasonQuality) / 2;
  const value = correctnessScore + reasonMean * REASON_QUALITY_WEIGHT;

  const evidence: SignalEvidence[] = [...q1.evidence, ...q2.evidence];
  evidence.push({
    source: 'tier',
    excerpt: `q1=${q1.correct ? '1' : '0'} q2=${q2.correct ? '1' : '0'} reasonMean=${reasonMean.toFixed(2)} → ${value.toFixed(3)}`,
    contribution: 0,
    triggeredRule: 'weighted_composite',
  });

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sAiCalibration: SignalDefinition = {
  id: 'sAiCalibration',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'P0',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as AI_CALIBRATION_VERSION };
