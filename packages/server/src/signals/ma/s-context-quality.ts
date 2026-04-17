/**
 * sContextQuality — Task 13b.
 *
 * Measures whether the R1 structuredForm.scenario + reasoning incorporate the
 * distinctive tokens of the exam's `requirement` — i.e. did the candidate
 * actually read and internalize the scenario context, or write generic
 * scheme-agnostic reasoning?
 *
 * backend-agent-tasks.md L60 lists sContextQuality as "纯规则 — technicalJudgment"
 * without explicit weights. V5-native composite (documented deviation):
 *   sContextQuality = keywordCoverage(scenarioField, requirementTokens) × 0.4
 *                   + keywordCoverage(reasoning,     requirementTokens) × 0.6
 *
 * `requirementTokens` are non-trivial tokens extracted from
 * `examData.MA.requirement` (length ≥ 2 chars, dedup, excludes digit-only).
 * We take up to the top 8 tokens to keep coverage interpretable.
 *
 * Fallback: null when round1 or examData.MA.requirement missing.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMaExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sContextQuality@v1';

const SCENARIO_WEIGHT = 0.4;
const REASONING_WEIGHT = 0.6;
const MAX_TOKENS = 8;
const MIN_TOKEN_LENGTH = 2;
const TOKEN_SPLIT = /[\s,.。、;:：()（）/\\\-—"'`]+/;

function extractTokens(requirement: string): string[] {
  if (!requirement) return [];
  const tokens = requirement
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !/^\d+$/.test(t));
  return Array.from(new Set(tokens)).slice(0, MAX_TOKENS);
}

function coverage(text: string, tokens: string[]): { value: number; hits: string[] } {
  if (tokens.length === 0 || !text) return { value: 0, hits: [] };
  const lower = text.toLowerCase();
  const hits = tokens.filter((t) => lower.includes(t));
  return { value: hits.length / tokens.length, hits };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub?.round1) return nullResult(ALGORITHM_VERSION);
  const exam = getMaExamData(input.examData);
  if (!exam?.requirement?.trim()) return nullResult(ALGORITHM_VERSION);

  const tokens = extractTokens(exam.requirement);
  if (tokens.length === 0) return nullResult(ALGORITHM_VERSION);

  const scenario = sub.round1.structuredForm?.scenario ?? '';
  const reasoning = sub.round1.reasoning ?? '';

  const sCov = coverage(scenario, tokens);
  const rCov = coverage(reasoning, tokens);

  const value = sCov.value * SCENARIO_WEIGHT + rCov.value * REASONING_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round1.structuredForm.scenario',
      excerpt: truncate(scenario),
      contribution: sCov.value * SCENARIO_WEIGHT,
      triggeredRule: `scenario_coverage:${sCov.hits.length}/${tokens.length}`,
    },
    {
      source: 'submissions.moduleA.round1.reasoning',
      excerpt: truncate(reasoning),
      contribution: rCov.value * REASONING_WEIGHT,
      triggeredRule: `reasoning_coverage:${rCov.hits.length}/${tokens.length}`,
    },
    {
      source: 'examData.MA.requirement',
      excerpt: truncate(exam.requirement),
      contribution: 0,
      triggeredRule: `requirement_tokens:${tokens.slice(0, 4).join(',')}`,
    },
    {
      source: 'tier',
      excerpt: `s=${sCov.value.toFixed(2)} r=${rCov.value.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sContextQuality: SignalDefinition = {
  id: 'sContextQuality',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CONTEXT_QUALITY_VERSION };
