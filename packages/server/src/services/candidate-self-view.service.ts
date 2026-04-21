/**
 * Task B-A10-lite — candidate self-view transform + relative-strength ranking.
 *
 * 输入 `Session.scoringResult` (V5ScoringResult) · 输出 V5CandidateSelfView ·
 * 刻意 strip grade / composite / signals / dangerFlag / dimensionBreakdown
 * abs score / evidenceSignals。`.strict()` on V5CandidateSelfViewSchema
 * catches accidental re-introduction of stripped fields at test time.
 */

import {
  V5_DIMENSION_NAME_EN,
  V5_DIMENSION_NAME_ZH,
  type V5Dimension,
  type CandidateDimensionStrength,
  type V5CandidateSelfView,
  type V5DimensionScores,
  type V5ScoringResult,
} from '@codelens-v5/shared';

/**
 * 将 dim 绝对分数映射到 strong/medium/weak 3 档。
 *
 * 算法 · sort desc by score · 3-tier split by index position:
 *   - idx < total/3 → 'strong'
 *   - idx >= total*2/3 → 'weak'
 *   - else → 'medium'
 *
 * null / undefined 值跳过(未参与维度 · suite 裁剪)· 同分用 stable sort
 * (Node sort since v11 · 保留插入序)· 不按 abs 值聚类 · deterministic。
 *
 * 相对分档 vs 绝对阈值的选择:
 *  1. 避免泄露 abs band(候选人无法倒推绝对分)
 *  2. 每 session 都有 strong / weak(体感:人人有擅长的)
 *  3. 跨 suite 比较 by design 不可能(防互比刷分)
 */
export function computeRelativeStrength(
  dimensions: V5DimensionScores,
): Array<{ id: V5Dimension; relativeStrength: CandidateDimensionStrength }> {
  const participating = Object.entries(dimensions)
    .filter(([, score]) => typeof score === 'number')
    .map(([id, score]) => ({ id: id as V5Dimension, score: score as number }));

  participating.sort((a, b) => b.score - a.score);

  const total = participating.length;

  return participating.map(({ id }, idx) => ({
    id,
    relativeStrength:
      idx < total / 3
        ? 'strong'
        : idx >= (total * 2) / 3
          ? 'weak'
          : 'medium',
  }));
}

/** Reduce V5ScoringResult to the candidate-safe V5CandidateSelfView. */
export function transformToCandidateSelfView(
  session: { id: string; completedAt: Date | null },
  scoringResult: V5ScoringResult,
): V5CandidateSelfView {
  if (!session.completedAt) {
    throw new Error('transformToCandidateSelfView: session.completedAt required');
  }
  return {
    sessionId: session.id,
    completedAt: session.completedAt.toISOString(),
    capabilityProfiles: scoringResult.capabilityProfiles.map((cp) => ({
      id: cp.id,
      nameZh: cp.nameZh,
      nameEn: cp.nameEn,
      label: cp.label,
      description: cp.description,
    })),
    dimensionRadar: computeRelativeStrength(scoringResult.dimensions).map(
      ({ id, relativeStrength }) => ({
        id,
        nameZh: V5_DIMENSION_NAME_ZH[id],
        nameEn: V5_DIMENSION_NAME_EN[id],
        relativeStrength,
      }),
    ),
  };
}
