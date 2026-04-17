/**
 * sCriticalThinking — Task 13b.
 *
 * Measures whether the candidate acknowledges weaknesses / limitations of
 * their chosen R1 scheme — i.e. balanced judgment vs blind advocacy.
 *
 * backend-agent-tasks.md L61 lists sCriticalThinking as "纯规则 —
 * technicalJudgment" without explicit weights. V5-native composite
 * (documented deviation):
 *   sCriticalThinking = weaknessMarkerPresence × 0.4
 *                     + consTokenCoverage       × 0.6
 *
 * where
 *   weaknessMarkerPresence — reasoning + verification contain hedging /
 *                            limitation vocabulary (weakness, tradeoff, risk,
 *                            缺点 / 局限 / 风险 / 不足 / 但是)
 *   consTokenCoverage      — fraction of the chosen scheme's declared `cons`
 *                            tokens that appear in reasoning + verification
 *
 * Fallback: null when round1 or the chosen scheme's cons array is missing.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMaExamData, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sCriticalThinking@v1';

const WEAKNESS_WEIGHT = 0.4;
const CONS_COVERAGE_WEIGHT = 0.6;

const WEAKNESS_MARKERS = [
  '缺点',
  '局限',
  '风险',
  '不足',
  '弱点',
  '劣势',
  '但是',
  '不过',
  '然而',
  '代价',
  '取舍',
  '权衡',
  'weakness',
  'limitation',
  'tradeoff',
  'trade-off',
  'risk',
  'downside',
  'drawback',
  'however',
  'but',
];

const TOKEN_SPLIT = /[\s,.。、;:：()（）/\\\-—"'`]+/;

function consTokens(cons: string[] | undefined): string[] {
  if (!cons || cons.length === 0) return [];
  const all: string[] = [];
  for (const c of cons) {
    for (const t of c.toLowerCase().split(TOKEN_SPLIT)) {
      if (t.length >= 2 && !/^\d+$/.test(t)) all.push(t);
    }
  }
  return Array.from(new Set(all));
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub?.round1) return nullResult(ALGORITHM_VERSION);

  const reasoning = sub.round1.reasoning ?? '';
  const verification = sub.round1.structuredForm?.verification ?? '';
  const combined = `${reasoning}\n${verification}`;
  const lower = combined.toLowerCase();

  const markerHits = WEAKNESS_MARKERS.filter((m) => lower.includes(m.toLowerCase()));
  const weaknessScore = Math.min(1, markerHits.length / 2);

  const exam = getMaExamData(input.examData);
  const chosenScheme = exam?.schemes?.find((s) => s.id === sub.round1.schemeId);
  if (!chosenScheme) return nullResult(ALGORITHM_VERSION);
  const tokens = consTokens(chosenScheme.cons);
  if (tokens.length === 0) return nullResult(ALGORITHM_VERSION);

  const covHits = tokens.filter((t) => lower.includes(t));
  const coverageScore = covHits.length / tokens.length;

  const value = weaknessScore * WEAKNESS_WEIGHT + coverageScore * CONS_COVERAGE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleA.round1',
      excerpt: truncate(combined),
      contribution: weaknessScore * WEAKNESS_WEIGHT,
      triggeredRule: `weakness_markers:${markerHits.slice(0, 3).join(',') || 'none'}`,
    },
    {
      source: 'submissions.moduleA.round1',
      excerpt: truncate(combined),
      contribution: coverageScore * CONS_COVERAGE_WEIGHT,
      triggeredRule: `cons_token_coverage:${covHits.length}/${tokens.length}`,
    },
    {
      source: 'examData.MA.schemes.cons',
      excerpt: truncate(chosenScheme.cons.join(' / ')),
      contribution: 0,
      triggeredRule: `scheme=${chosenScheme.id}:cons_tokens=${tokens.slice(0, 4).join(',')}`,
    },
    {
      source: 'tier',
      excerpt: `w=${weaknessScore.toFixed(2)} c=${coverageScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sCriticalThinking: SignalDefinition = {
  id: 'sCriticalThinking',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as CRITICAL_THINKING_VERSION };
