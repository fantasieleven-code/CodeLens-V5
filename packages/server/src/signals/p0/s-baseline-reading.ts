/**
 * sBaselineReading — Task 13a.
 *
 * Measures P0 code-reading comprehension across three layers (L1 surface,
 * L2 design intent, L3 hidden constraints / scalability). Pure-rule signal
 * per design-reference-p0.md L4894-4896:
 *   sBaselineReading = L1×0.2 + L2×0.3 + L3×0.5
 *
 * L1 is MCQ (correctIndex authoritative):
 *   L1_score = 1.0 if the candidate's chosen option text matches
 *   options[correctIndex] verbatim, else 0.0.
 *
 * L2/L3 are free-text. design-reference-p0.md L4896 calls for
 *   `L_score = keywordCoverage(answer, groundTruth.keywords)`
 * but the shared P0ModuleSpecific type does not (yet) carry per-question
 * ground-truth keywords. Until Task 9 grows `codeReadingQuestions.l2/l3` to
 * include a `keywords` field, L2/L3 fall back to a substantivity score:
 *   0.5 × length_coverage + 0.5 × tech_term_density
 * which correlates with keyword coverage in the V4 rubric and is monotone
 * on the Liam / Steve / Max fixtures (see Task 13a tests).
 *
 * Fallback (module absent or submission missing): value = null.
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
  L2_SUBSTANTIVE_CHARS,
  L3_SUBSTANTIVE_CHARS,
  clamp01,
  countTechTerms,
  finalize,
  getP0ExamData,
  nullResult,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sBaselineReading@v1';

const L1_WEIGHT = 0.2;
const L2_WEIGHT = 0.3;
const L3_WEIGHT = 0.5;

/** Target tech-term count to reach full density credit on L2 / L3. */
const L2_TARGET_TERMS = 3;
const L3_TARGET_TERMS = 5;

function scoreL1(
  submission: V5Phase0Submission,
  exam: P0ModuleSpecific,
): { value: number; evidence: SignalEvidence | null } {
  const { l1Answer } = submission.codeReading;
  const { options, correctIndex } = exam.codeReadingQuestions.l1;
  const correctOption = options[correctIndex] ?? '';
  const correct = l1Answer.trim().length > 0 && l1Answer.trim() === correctOption.trim();
  return {
    value: correct ? 1 : 0,
    evidence: {
      source: 'submissions.phase0.codeReading.l1Answer',
      excerpt: truncate(l1Answer),
      contribution: correct ? L1_WEIGHT : 0,
      triggeredRule: correct ? 'l1_correct' : 'l1_incorrect',
    },
  };
}

/** Substantivity-based score for L2 / L3 when ground-truth keywords are absent. */
function scoreSubstantivity(
  text: string,
  minChars: number,
  targetTerms: number,
): { value: number; termHits: string[] } {
  const trimmed = text.trim();
  if (trimmed.length === 0) return { value: 0, termHits: [] };

  const lengthCoverage = Math.min(1, trimmed.length / (minChars * 2));
  const { hits } = countTechTerms(trimmed);
  const densityCoverage = Math.min(1, hits.length / targetTerms);
  const value = 0.5 * lengthCoverage + 0.5 * densityCoverage;
  return { value: clamp01(value), termHits: hits };
}

function scoreL2(submission: V5Phase0Submission): {
  value: number;
  evidence: SignalEvidence | null;
} {
  const { l2Answer } = submission.codeReading;
  if (!l2Answer || l2Answer.trim().length < L2_SUBSTANTIVE_CHARS / 2) {
    return {
      value: 0,
      evidence: {
        source: 'submissions.phase0.codeReading.l2Answer',
        excerpt: truncate(l2Answer),
        contribution: 0,
        triggeredRule: 'l2_below_threshold',
      },
    };
  }
  const { value, termHits } = scoreSubstantivity(l2Answer, L2_SUBSTANTIVE_CHARS, L2_TARGET_TERMS);
  return {
    value,
    evidence: {
      source: 'submissions.phase0.codeReading.l2Answer',
      excerpt: truncate(l2Answer),
      contribution: value * L2_WEIGHT,
      triggeredRule: `l2_substantivity:${termHits.slice(0, 3).join(',') || 'length-only'}`,
    },
  };
}

function scoreL3(submission: V5Phase0Submission): {
  value: number;
  evidence: SignalEvidence | null;
} {
  const { l3Answer } = submission.codeReading;
  if (!l3Answer || l3Answer.trim().length < L3_SUBSTANTIVE_CHARS / 2) {
    return {
      value: 0,
      evidence: {
        source: 'submissions.phase0.codeReading.l3Answer',
        excerpt: truncate(l3Answer),
        contribution: 0,
        triggeredRule: 'l3_below_threshold',
      },
    };
  }
  const { value, termHits } = scoreSubstantivity(l3Answer, L3_SUBSTANTIVE_CHARS, L3_TARGET_TERMS);
  return {
    value,
    evidence: {
      source: 'submissions.phase0.codeReading.l3Answer',
      excerpt: truncate(l3Answer),
      contribution: value * L3_WEIGHT,
      triggeredRule: `l3_substantivity:${termHits.slice(0, 3).join(',') || 'length-only'}`,
    },
  };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.phase0;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const exam = getP0ExamData(input.examData);
  if (!exam) return nullResult(ALGORITHM_VERSION);

  const l1 = scoreL1(sub, exam);
  const l2 = scoreL2(sub);
  const l3 = scoreL3(sub);

  const value = L1_WEIGHT * l1.value + L2_WEIGHT * l2.value + L3_WEIGHT * l3.value;

  const evidence: SignalEvidence[] = [];
  if (l1.evidence) evidence.push(l1.evidence);
  if (l2.evidence) evidence.push(l2.evidence);
  if (l3.evidence) evidence.push(l3.evidence);
  evidence.push({
    source: 'tier',
    excerpt: `L1=${l1.value.toFixed(2)} L2=${l2.value.toFixed(2)} L3=${l3.value.toFixed(2)} → ${value.toFixed(3)}`,
    contribution: 0,
    triggeredRule: 'weighted_composite',
  });

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sBaselineReading: SignalDefinition = {
  id: 'sBaselineReading',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'P0',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as BASELINE_READING_VERSION };
