/**
 * sDiagnosisAccuracy — Task 13b.
 *
 * Pure-rule signal per backend-agent-tasks.md L89:
 *   sDiagnosisAccuracy = rootCause×0.5 + diffPoint 覆盖×0.3 + correctVersionChoice×0.2
 *
 * Inputs (V5ModuleASubmission.round3 + MAModuleSpecific.failureScenario):
 *   - correctVersionChoice ('success' | 'failed') vs the known-correct one
 *     (the candidate should pick 'success' — the failed code diverges from
 *     the working version, so the 'success' code is the accurate reference).
 *   - diffAnalysis: text covering which diff points the candidate noticed
 *   - diagnosisText: text covering the root-cause explanation
 *
 * Scoring:
 *   rootCauseScore  = 1.0 if diagnosisText contains any of the rootCause key
 *                     tokens (split on punctuation + whitespace, tokens ≥2
 *                     chars), proportional to token hits / min(3, totalTokens).
 *   diffPointScore  = fraction of failureScenario.diffPoints whose line
 *                     number OR description token appears in diffAnalysis.
 *   choiceScore     = 1 if correctVersionChoice === 'success' else 0.
 *                     (per design-reference-p0.md the "success" version is
 *                     the correct reference in the R3 A/B comparison.)
 *
 * Fallback: null when round3 missing or examData.MA.failureScenario missing.
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
import { finalize, getMaExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sDiagnosisAccuracy@v1';

const ROOT_CAUSE_WEIGHT = 0.5;
const DIFF_POINT_WEIGHT = 0.3;
const CHOICE_WEIGHT = 0.2;

const TOKEN_SPLIT = /[\s,.。、；;:\-—/\\(){}[\]"'`]+/;
const MIN_TOKEN_LENGTH = 2;

function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

function rootCauseHits(diagnosisText: string, rootCause: string): { hits: number; total: number } {
  const tokens = Array.from(new Set(tokenize(rootCause))).filter((t) => !/^\d+$/.test(t));
  if (tokens.length === 0) return { hits: 0, total: 0 };
  const lower = diagnosisText.toLowerCase();
  const hit = tokens.filter((t) => lower.includes(t)).length;
  return { hits: hit, total: tokens.length };
}

function diffPointHits(
  diffAnalysis: string,
  diffPoints: MAModuleSpecific['failureScenario']['diffPoints'],
): { hits: number; total: number } {
  if (!diffPoints || diffPoints.length === 0) return { hits: 0, total: 0 };
  const lower = diffAnalysis.toLowerCase();
  let hit = 0;
  for (const dp of diffPoints) {
    const lineHit = lower.includes(`line ${dp.line}`) || lower.includes(`行 ${dp.line}`) || lower.includes(`第${dp.line}`) || lower.includes(`${dp.line}行`);
    const descTokens = tokenize(dp.description).slice(0, 3);
    const descHit = descTokens.some((t) => lower.includes(t));
    if (lineHit || descHit) hit += 1;
  }
  return { hits: hit, total: diffPoints.length };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA as V5ModuleASubmission | undefined;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const exam = getMaExamData(input.examData);
  if (!exam?.failureScenario) return nullResult(ALGORITHM_VERSION);

  const { correctVersionChoice, diffAnalysis, diagnosisText } = sub.round3;
  const { rootCause, diffPoints } = exam.failureScenario;

  const choiceScore = correctVersionChoice === 'success' ? 1 : 0;
  const rc = rootCauseHits(diagnosisText, rootCause);
  const dp = diffPointHits(diffAnalysis, diffPoints);

  const rootCauseScore = rc.total === 0 ? 0 : Math.min(1, rc.hits / Math.max(3, Math.min(rc.total, 5)));
  const diffPointScore = dp.total === 0 ? 0 : dp.hits / dp.total;

  const value =
    rootCauseScore * ROOT_CAUSE_WEIGHT +
    diffPointScore * DIFF_POINT_WEIGHT +
    choiceScore * CHOICE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round3.correctVersionChoice',
      excerpt: `choice=${correctVersionChoice} correct=success`,
      contribution: choiceScore * CHOICE_WEIGHT,
      triggeredRule: choiceScore ? 'choice_correct' : 'choice_incorrect',
    },
    {
      source: 'submissions.moduleA.round3.diagnosisText',
      excerpt: truncate(diagnosisText),
      contribution: rootCauseScore * ROOT_CAUSE_WEIGHT,
      triggeredRule: `root_cause_hit:${rc.hits}/${rc.total}`,
    },
    {
      source: 'submissions.moduleA.round3.diffAnalysis',
      excerpt: truncate(diffAnalysis),
      contribution: diffPointScore * DIFF_POINT_WEIGHT,
      triggeredRule: `diff_point_coverage:${dp.hits}/${dp.total}`,
    },
    {
      source: 'tier',
      excerpt: `rc=${rootCauseScore.toFixed(2)} dp=${diffPointScore.toFixed(2)} ch=${choiceScore} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sDiagnosisAccuracy: SignalDefinition = {
  id: 'sDiagnosisAccuracy',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as DIAGNOSIS_ACCURACY_VERSION };
