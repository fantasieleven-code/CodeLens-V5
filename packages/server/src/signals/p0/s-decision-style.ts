/**
 * sDecisionStyle — Task 13a.
 *
 * Measures decisiveness / commitment quality in the P0 single-decision prompt
 * (design-reference-p0.md L4915-4917: "保持 V4 逻辑，计算不变"). V4 source
 * is not vendored into the V5 repo; this file reconstructs the V4 intent from
 * the "决策风格" rubric described in clarifications.md L70 + v5-design-
 * reference.md L719. The V5 algorithm is a 3-factor composite:
 *
 *   sDecisionStyle = commitment × 0.4 + specificity × 0.3 + actionability × 0.3
 *
 * where
 *   commitment    — explicit choice + reasoning length + commitment markers
 *                   ("我会" / "决定" / "优先" / "因为" / "基于" etc.)
 *   specificity   — quantitative or named-entity detail (numbers, time
 *                   windows, service / table / function names)
 *   actionability — action verbs indicating concrete next step ("rollback"
 *                   "回滚" "先做" "立刻" "止血" "优先")
 *
 * Deviation documented in Task 13a PR (Observations: v4-source-unavailable).
 * Liam/Steve calibration on the fixture suite is the real contract.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
  type V5Phase0Submission,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sDecisionStyle@v1';

const COMMITMENT_WEIGHT = 0.4;
const SPECIFICITY_WEIGHT = 0.3;
const ACTIONABILITY_WEIGHT = 0.3;

const REASONING_MIN_CHARS = 20;
const REASONING_FULL_CHARS = 80;

const COMMITMENT_MARKERS = [
  '我会',
  '我将',
  '我决定',
  '决定',
  '选择',
  '优先',
  '应该',
  '需要',
  '因为',
  '基于',
  '鉴于',
  'will',
  'decide',
  'choose',
];

const ACTION_MARKERS = [
  '回滚',
  'rollback',
  '止血',
  '先做',
  '先修',
  '立刻',
  '立即',
  '马上',
  '紧急',
  '重启',
  '切换',
  '降级',
  'restart',
  'revert',
  'fix',
];

const NUMBER_PATTERN = /\d+/;
const TIME_PATTERN = /(小时|分钟|秒|天|hour|minute|second|day|\d+\s*(h|m|s|ms))/i;
const QUOTED_NAME_PATTERN = /[`"'](\w[\w\-./]*)[`"']/;
const SERVICE_PATTERN = /(service|api|db|queue|cache|缓存|接口|服务|数据库)/i;

function scoreCommitment(decision: { choice: string; reasoning: string }): {
  value: number;
  hits: string[];
} {
  const hits: string[] = [];
  const hasChoice = typeof decision.choice === 'string' && decision.choice.trim().length > 0;
  const reasoning = decision.reasoning ?? '';

  if (hasChoice) hits.push('choice_made');

  for (const m of COMMITMENT_MARKERS) {
    if (reasoning.includes(m)) {
      hits.push(`marker:${m}`);
      break;
    }
  }

  const lengthScore =
    reasoning.trim().length >= REASONING_FULL_CHARS
      ? 1
      : reasoning.trim().length >= REASONING_MIN_CHARS
        ? 0.5
        : 0;

  const markerScore = hits.some((h) => h.startsWith('marker:')) ? 1 : 0;
  const choiceScore = hasChoice ? 1 : 0;

  const value = clamp01(0.4 * choiceScore + 0.3 * markerScore + 0.3 * lengthScore);
  return { value, hits };
}

function scoreSpecificity(reasoning: string): { value: number; hits: string[] } {
  const hits: string[] = [];
  if (NUMBER_PATTERN.test(reasoning)) hits.push('number');
  if (TIME_PATTERN.test(reasoning)) hits.push('time_window');
  if (QUOTED_NAME_PATTERN.test(reasoning)) hits.push('quoted_name');
  if (SERVICE_PATTERN.test(reasoning)) hits.push('service_ref');

  const value = Math.min(1, hits.length / 2);
  return { value, hits };
}

function scoreActionability(reasoning: string): { value: number; hits: string[] } {
  const hits: string[] = [];
  for (const m of ACTION_MARKERS) {
    if (reasoning.includes(m)) hits.push(m);
  }
  const value = hits.length === 0 ? 0 : hits.length >= 2 ? 1 : 0.6;
  return { value, hits };
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.phase0 as V5Phase0Submission | undefined;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const decision = sub.decision;
  if (!decision || typeof decision.choice !== 'string') {
    return nullResult(ALGORITHM_VERSION);
  }

  const commitment = scoreCommitment(decision);
  const specificity = scoreSpecificity(decision.reasoning ?? '');
  const actionability = scoreActionability(decision.reasoning ?? '');

  const value =
    commitment.value * COMMITMENT_WEIGHT +
    specificity.value * SPECIFICITY_WEIGHT +
    actionability.value * ACTIONABILITY_WEIGHT;

  const reasoningExcerpt = truncate(decision.reasoning ?? '');

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.phase0.decision',
      excerpt: `choice=${decision.choice} ${reasoningExcerpt}`,
      contribution: commitment.value * COMMITMENT_WEIGHT,
      triggeredRule: `commitment:${commitment.hits.slice(0, 3).join(',') || 'none'}`,
    },
    {
      source: 'submissions.phase0.decision.reasoning',
      excerpt: reasoningExcerpt,
      contribution: specificity.value * SPECIFICITY_WEIGHT,
      triggeredRule: `specificity:${specificity.hits.join(',') || 'none'}`,
    },
    {
      source: 'submissions.phase0.decision.reasoning',
      excerpt: reasoningExcerpt,
      contribution: actionability.value * ACTIONABILITY_WEIGHT,
      triggeredRule: `actionability:${actionability.hits.slice(0, 3).join(',') || 'none'}`,
    },
    {
      source: 'tier',
      excerpt: `commit=${commitment.value.toFixed(2)} spec=${specificity.value.toFixed(2)} action=${actionability.value.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sDecisionStyle: SignalDefinition = {
  id: 'sDecisionStyle',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'P0',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as DECISION_STYLE_VERSION };
