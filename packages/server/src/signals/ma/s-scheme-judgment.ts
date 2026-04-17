/**
 * sSchemeJudgment — Task 13b.
 *
 * Evaluates the quality of the R1 scheme selection: did the candidate make a
 * definite choice, fill the structured form in full, and ground the reasoning
 * in the chosen scheme's declared characteristics?
 *
 * backend-agent-tasks.md L58 lists sSchemeJudgment as "纯规则 — technicalJudgment"
 * without explicit weights. V5-native composite (documented deviation):
 *   sSchemeJudgment = choiceMade × 0.2
 *                   + structuredFormFilled × 0.3
 *                   + reasoningReferencesScheme × 0.5
 *
 * where
 *   choiceMade                 — 1 if schemeId ∈ {A, B, C}, else 0
 *   structuredFormFilled       — fraction of the 4 structured-form fields
 *                                (scenario / tradeoff / decision / verification)
 *                                with non-empty trimmed content
 *   reasoningReferencesScheme  — bonus for reasoning that mentions the chosen
 *                                scheme's name / pros / cons / performance /
 *                                cost tokens (capped at 1.0 for ≥3 hits)
 *
 * Fallback: null when round1 or the chosen scheme is absent from exam data.
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

const ALGORITHM_VERSION = 'sSchemeJudgment@v1';

const CHOICE_WEIGHT = 0.2;
const STRUCTURED_FORM_WEIGHT = 0.3;
const REASONING_REFERENCE_WEIGHT = 0.5;
const REFERENCE_TARGET_HITS = 3;

function schemeTokens(scheme: MAModuleSpecific['schemes'][number]): string[] {
  const tokens: string[] = [];
  if (scheme.name) tokens.push(scheme.name.toLowerCase());
  for (const p of scheme.pros ?? []) {
    for (const t of p.toLowerCase().split(/[\s,.。、;:]+/)) {
      if (t.length >= 2) tokens.push(t);
    }
  }
  for (const c of scheme.cons ?? []) {
    for (const t of c.toLowerCase().split(/[\s,.。、;:]+/)) {
      if (t.length >= 2) tokens.push(t);
    }
  }
  if (scheme.performance) tokens.push(...scheme.performance.toLowerCase().split(/[\s,.。、]+/).filter((t) => t.length >= 2));
  if (scheme.cost) tokens.push(...scheme.cost.toLowerCase().split(/[\s,.。、]+/).filter((t) => t.length >= 2));
  return Array.from(new Set(tokens));
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA as V5ModuleASubmission | undefined;
  if (!sub?.round1) return nullResult(ALGORITHM_VERSION);

  const exam = getMaExamData(input.examData);
  const { schemeId, reasoning, structuredForm } = sub.round1;

  const choiceMade = schemeId === 'A' || schemeId === 'B' || schemeId === 'C' ? 1 : 0;

  const formFields = [
    structuredForm.scenario,
    structuredForm.tradeoff,
    structuredForm.decision,
    structuredForm.verification,
  ];
  const filled = formFields.filter((f) => typeof f === 'string' && f.trim().length > 0).length;
  const structuredFormFilled = filled / 4;

  const chosenScheme = exam?.schemes?.find((s) => s.id === schemeId);
  let referenceScore = 0;
  let referenceHits: string[] = [];
  if (chosenScheme) {
    const tokens = schemeTokens(chosenScheme);
    const reasoningLower = (reasoning ?? '').toLowerCase();
    for (const t of tokens) {
      if (reasoningLower.includes(t)) referenceHits.push(t);
    }
    referenceScore = Math.min(1, referenceHits.length / REFERENCE_TARGET_HITS);
  }

  const value =
    choiceMade * CHOICE_WEIGHT +
    structuredFormFilled * STRUCTURED_FORM_WEIGHT +
    referenceScore * REASONING_REFERENCE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round1.schemeId',
      excerpt: `choice=${schemeId}`,
      contribution: choiceMade * CHOICE_WEIGHT,
      triggeredRule: choiceMade ? 'choice_made' : 'choice_invalid',
    },
    {
      source: 'submissions.moduleA.round1.structuredForm',
      excerpt: `filled=${filled}/4`,
      contribution: structuredFormFilled * STRUCTURED_FORM_WEIGHT,
      triggeredRule: `structured_form:${filled}/4`,
    },
    {
      source: 'submissions.moduleA.round1.reasoning',
      excerpt: truncate(reasoning ?? ''),
      contribution: referenceScore * REASONING_REFERENCE_WEIGHT,
      triggeredRule: `reasoning_references_scheme:${referenceHits.length}/${REFERENCE_TARGET_HITS}`,
    },
    {
      source: 'tier',
      excerpt: `choice=${choiceMade} form=${structuredFormFilled.toFixed(2)} ref=${referenceScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sSchemeJudgment: SignalDefinition = {
  id: 'sSchemeJudgment',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as SCHEME_JUDGMENT_VERSION };
