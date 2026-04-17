/**
 * sBoundaryAwareness — Task 13e (MC, communication dimension).
 *
 * Measures whether the candidate acknowledges the limits of their answer
 * (uncertainty, scope-conditionals, gaps in experience). Formula is a
 * direct transcription of design-reference-full.md L1987-2027:
 *
 *   if mcAnswers.length < 3              → null
 *   if no answer ≥ 30 chars              → null
 *   avgMarkers = totalMarkers / totalSubstantiveAnswers
 *   value = min(1.0, avgMarkers / 3)
 *
 * `answer.length < 30` rounds are skipped from both numerator and denominator —
 * sub-30 replies are treated as "not substantive enough to score" rather
 * than as zero-boundary evidence.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  MIN_MC_ROUNDS,
  countMarkers,
  finalize,
  nullResult,
  substantiveAnswers,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sBoundaryAwareness@v1';

/**
 * Design-reference-full.md L1996-2005. Mixed zh+en because actual MC
 * transcripts contain both; the count is density-based so individual
 * marker weights are uniform.
 */
const BOUNDARY_MARKERS = [
  // 承认不确定
  '我不太确定',
  '不是很清楚',
  '可能',
  '也许',
  '估计',
  // 区分场景
  '取决于',
  '要看',
  '如果是',
  '在...情况下',
  // 承认局限
  '没考虑过',
  '这个没经验',
  '理论上',
  '我的理解是',
  // 元认知
  '可能我理解得不对',
  '这个问题要看具体',
] as const;

async function computeBoundaryAwareness(input: SignalInput): Promise<SignalResult> {
  const mc = input.submissions.moduleC;
  if (!mc || mc.length < MIN_MC_ROUNDS) return nullResult(ALGORITHM_VERSION);

  const substantive = substantiveAnswers(mc);
  if (substantive.length === 0) return nullResult(ALGORITHM_VERSION);

  let totalMarkers = 0;
  const hits: SignalEvidence[] = [];

  for (const a of substantive) {
    const count = countMarkers(a.answer, BOUNDARY_MARKERS);
    totalMarkers += count;

    if (count > 0) {
      // Pick the first marker that actually appears for the excerpt, so the
      // evidence row shows what triggered the count rather than a generic
      // answer body.
      const firstMarker = BOUNDARY_MARKERS.find((m) => a.answer.includes(m)) ?? 'marker';
      const idx = a.answer.indexOf(firstMarker);
      const start = Math.max(0, idx - 30);
      const end = Math.min(a.answer.length, idx + firstMarker.length + 30);
      hits.push({
        source: `submissions.moduleC.answers[round=${a.round}]`,
        excerpt: truncate(a.answer.slice(start, end)),
        contribution: count / substantive.length / 3,
        triggeredRule: `boundary_marker_${firstMarker}`,
      });
    }
  }

  const avg = totalMarkers / substantive.length;
  const value = Math.min(1, avg / 3);

  // If nothing was hit, still surface an evidence row explaining the zero
  // so the report author can cite "no boundary markers across N rounds".
  if (hits.length === 0) {
    hits.push({
      source: 'submissions.moduleC',
      excerpt: `${substantive.length} substantive rounds, 0 boundary markers`,
      contribution: 0,
      triggeredRule: 'no_boundary_markers',
    });
  }

  return finalize(value, hits, ALGORITHM_VERSION);
}

export const sBoundaryAwareness: SignalDefinition = {
  id: 'sBoundaryAwareness',
  dimension: V5Dimension.COMMUNICATION,
  moduleSource: 'MC',
  isLLMWhitelist: false,
  compute: computeBoundaryAwareness,
};

export { ALGORITHM_VERSION as BOUNDARY_AWARENESS_VERSION, BOUNDARY_MARKERS };
