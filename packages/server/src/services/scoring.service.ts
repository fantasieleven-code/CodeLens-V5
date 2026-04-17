/**
 * ScoringService — V5 scoring primitives (Task 4 + Round 3 重构 2/4).
 *
 * 纯函数库,不依赖 Prisma:
 * - computeComposite: 维度 → composite(含 N/A rescaling)
 * - computeDimensions: signals → V5DimensionScores(均值聚合,null 维度保留 null)
 * - gradeCandidate: composite + dims + suite → GradeDecision(Round 3 重构 2:confidence + boundaryAnalysis + reasoning + dangerFlag)
 * - computeCapabilityProfile / computeAllProfiles: dims → 4 个 CapabilityProfile(Round 3 重构 4)
 *
 * SignalResult.value 规约假设为 0-100 scale;若 Task 13 实现的信号采用 0-1 scale,
 * 需要在这里乘 100 再进入维度聚合,届时会由 Task 13 一次性调整(本文件加 TODO 不适当)。
 */

import {
  CAPABILITY_PROFILE_DEFINITIONS,
  CAPABILITY_PROFILE_IDS,
  type CapabilityProfile,
  type CapabilityProfileId,
  CONFIDENCE_HIGH_MARGIN,
  CONFIDENCE_MEDIUM_MARGIN,
  DANGER_FLAG_CQ_FLOOR,
  DANGER_FLAG_GAP,
  DANGER_FLAG_TJ_CEILING,
  type GradeBoundaryAnalysis,
  type GradeConfidence,
  type GradeDangerFlag,
  type GradeDecision,
  type SignalDefinition,
  type SignalResults,
  type SuiteDefinition,
  V5_DIMENSIONS,
  V5_GRADE_COMPOSITE_THRESHOLDS,
  V5_GRADE_ORDER,
  V5Dimension,
  type V5DimensionScores,
  type V5Grade,
  scoreToCapabilityLabel,
} from '@codelens-v5/shared';

// ────────────────────────────────────────────────────────────────────────────
// computeComposite — 维度加权平均,未参与维度通过 N/A rescaling 分散权重
// ────────────────────────────────────────────────────────────────────────────

export function computeComposite(dims: V5DimensionScores, suite: SuiteDefinition): number {
  let weightedSum = 0;
  let activeWeight = 0;

  for (const dim of V5_DIMENSIONS) {
    const score = dims[dim];
    const weight = suite.weightProfile[dim] ?? 0;
    if (score == null || weight <= 0) continue;
    weightedSum += score * weight;
    activeWeight += weight;
  }

  if (activeWeight === 0) return 0;
  return weightedSum / activeWeight;
}

// ────────────────────────────────────────────────────────────────────────────
// computeDimensions — 信号聚合到维度(均值,忽略 null)
// ────────────────────────────────────────────────────────────────────────────

export function computeDimensions(
  signals: SignalResults,
  signalDefs: readonly SignalDefinition[],
  suite: SuiteDefinition,
): V5DimensionScores {
  const out: V5DimensionScores = {};

  for (const dim of V5_DIMENSIONS) {
    const suiteWeight = suite.weightProfile[dim] ?? 0;
    if (suiteWeight <= 0) {
      out[dim] = null;
      continue;
    }

    const dimSignalIds = signalDefs.filter((d) => d.dimension === dim).map((d) => d.id);
    const values: number[] = [];
    for (const id of dimSignalIds) {
      const v = signals[id]?.value;
      if (v != null) values.push(v);
    }

    out[dim] = values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// gradeCandidate — Round 3 重构 2
// ────────────────────────────────────────────────────────────────────────────

function meetsFloorsForGrade(
  grade: V5Grade,
  dims: V5DimensionScores,
  suite: SuiteDefinition,
): { passes: boolean; failedDim: V5Dimension | null; failedRequired: number | null } {
  const floors = suite.dimensionFloors[grade];
  if (!floors) return { passes: true, failedDim: null, failedRequired: null };

  for (const [dimStr, required] of Object.entries(floors)) {
    if (required == null) continue;
    const dim = dimStr as V5Dimension;
    const actual = dims[dim];
    if (actual == null) continue;
    if (actual < required) {
      return { passes: false, failedDim: dim, failedRequired: required };
    }
  }
  return { passes: true, failedDim: null, failedRequired: null };
}

function pickBaseGrade(composite: number, dims: V5DimensionScores, suite: SuiteDefinition): V5Grade {
  const ordered: V5Grade[] = ['S+', 'S', 'A', 'B+'];
  for (const g of ordered) {
    const threshold = V5_GRADE_COMPOSITE_THRESHOLDS[g];
    if (composite >= threshold && meetsFloorsForGrade(g, dims, suite).passes) {
      return g;
    }
  }
  if (composite >= V5_GRADE_COMPOSITE_THRESHOLDS.B) return 'B';
  if (composite >= V5_GRADE_COMPOSITE_THRESHOLDS.C) return 'C';
  return 'D';
}

function clampToCap(grade: V5Grade, cap: V5Grade): V5Grade {
  const idx = V5_GRADE_ORDER.indexOf(grade);
  const capIdx = V5_GRADE_ORDER.indexOf(cap);
  return idx > capIdx ? cap : grade;
}

function computeDangerFlag(
  composite: number,
  dims: V5DimensionScores,
): GradeDangerFlag | undefined {
  const tj = dims[V5Dimension.TECHNICAL_JUDGMENT];
  const cq = dims[V5Dimension.CODE_QUALITY];
  if (tj == null || cq == null) return undefined;
  if (composite < V5_GRADE_COMPOSITE_THRESHOLDS.B) return undefined;
  if (tj >= DANGER_FLAG_TJ_CEILING) return undefined;
  if (cq < DANGER_FLAG_CQ_FLOOR) return undefined;
  if (cq - tj <= DANGER_FLAG_GAP) return undefined;

  return {
    message: `技术判断力(${tj.toFixed(1)})显著低于代码质量(${cq.toFixed(1)}),可能依赖 AI 补全而缺少设计决策能力——B- 警告。`,
    evidenceSignals: [],
  };
}

function generateReasoning(params: {
  grade: V5Grade;
  composite: number;
  confidence: GradeConfidence;
  boundaryAnalysis: GradeBoundaryAnalysis;
  dangerFlag?: GradeDangerFlag;
}): string {
  const { grade, composite, confidence, boundaryAnalysis } = params;
  const compositeStr = composite.toFixed(1);

  if (params.dangerFlag) {
    return `composite ${compositeStr} 进入 ${grade} 区间,但 ${params.dangerFlag.message}`;
  }

  if (confidence === 'high') {
    const distParts: string[] = [];
    if (boundaryAnalysis.distanceToUpper != null) {
      distParts.push(`距上一级 ${boundaryAnalysis.nearestUpperGrade} 还有 ${boundaryAnalysis.distanceToUpper.toFixed(1)} 分`);
    }
    if (boundaryAnalysis.distanceToLower != null) {
      distParts.push(`距下一级 ${boundaryAnalysis.nearestLowerGrade} 有 ${boundaryAnalysis.distanceToLower.toFixed(1)} 分余量`);
    }
    const tail = distParts.length > 0 ? `,${distParts.join(',')}` : '';
    return `composite ${compositeStr} 稳定落在 ${grade} 区间${tail},所有维度 floor 均以 >= ${CONFIDENCE_HIGH_MARGIN} 分余量通过。`;
  }

  if (boundaryAnalysis.blockingFactor && boundaryAnalysis.distanceToUpper != null) {
    return `composite ${compositeStr} 距 ${boundaryAnalysis.nearestUpperGrade} 阈值仅差 ${boundaryAnalysis.distanceToUpper.toFixed(1)} 分,被 ${boundaryAnalysis.blockingFactor} 阻挡,综合判断 ${grade} 更稳健。`;
  }

  if (boundaryAnalysis.distanceToLower != null && boundaryAnalysis.distanceToLower < CONFIDENCE_MEDIUM_MARGIN) {
    return `composite ${compositeStr} 距下一级 ${boundaryAnalysis.nearestLowerGrade} 阈值仅 ${boundaryAnalysis.distanceToLower.toFixed(1)} 分,${grade} 评级偏低风险,置信度 ${confidence}。`;
  }

  return `composite ${compositeStr},${grade} 评级,置信度 ${confidence}。`;
}

function computeBoundaryAnalysis(
  composite: number,
  dims: V5DimensionScores,
  suite: SuiteDefinition,
  finalGrade: V5Grade,
  baseGrade: V5Grade,
): GradeBoundaryAnalysis {
  const currentIdx = V5_GRADE_ORDER.indexOf(finalGrade);
  const capIdx = V5_GRADE_ORDER.indexOf(suite.gradeCap);
  const atCap = currentIdx === capIdx;
  const basePassedCap = V5_GRADE_ORDER.indexOf(baseGrade) > capIdx;

  const nextIdx = currentIdx + 1;
  const upperGrade: V5Grade | null =
    atCap || nextIdx >= V5_GRADE_ORDER.length ? null : V5_GRADE_ORDER[nextIdx];
  const lowerGrade: V5Grade | null = currentIdx > 0 ? V5_GRADE_ORDER[currentIdx - 1] : null;

  let distanceToUpper: number | null = null;
  let blockingFactor: string | null = null;

  if (atCap && basePassedCap) {
    blockingFactor = 'gradeCap';
  } else if (upperGrade) {
    const upperThreshold = V5_GRADE_COMPOSITE_THRESHOLDS[upperGrade];
    distanceToUpper = upperThreshold - composite;
    if (composite < upperThreshold) {
      blockingFactor = `composite < ${upperThreshold}`;
    } else {
      const floorCheck = meetsFloorsForGrade(upperGrade, dims, suite);
      if (!floorCheck.passes && floorCheck.failedDim && floorCheck.failedRequired != null) {
        blockingFactor = `${floorCheck.failedDim} < ${floorCheck.failedRequired}`;
      }
    }
  }

  const distanceToLower: number | null = lowerGrade
    ? composite - V5_GRADE_COMPOSITE_THRESHOLDS[finalGrade]
    : null;

  return {
    nearestUpperGrade: upperGrade,
    distanceToUpper,
    blockingFactor,
    nearestLowerGrade: lowerGrade,
    distanceToLower,
  };
}

function computeConfidence(
  composite: number,
  dims: V5DimensionScores,
  suite: SuiteDefinition,
  finalGrade: V5Grade,
  boundary: GradeBoundaryAnalysis,
): GradeConfidence {
  const compositeMargin = Math.min(
    boundary.distanceToUpper != null ? Math.max(boundary.distanceToUpper, 0) : Infinity,
    boundary.distanceToLower != null ? Math.max(boundary.distanceToLower, 0) : Infinity,
  );

  const floors = suite.dimensionFloors[finalGrade];
  const floorMargins: number[] = [];
  if (floors) {
    for (const [dimStr, required] of Object.entries(floors)) {
      if (required == null) continue;
      const actual = dims[dimStr as V5Dimension];
      if (actual == null) continue;
      floorMargins.push(actual - required);
    }
  }
  const minFloorMargin = floorMargins.length > 0
    ? Math.min(...floorMargins.map((m) => Math.abs(m)))
    : Infinity;

  const minMargin = Math.min(compositeMargin, minFloorMargin);

  if (minMargin >= CONFIDENCE_HIGH_MARGIN) return 'high';
  if (minMargin >= CONFIDENCE_MEDIUM_MARGIN) return 'medium';
  return 'low';
}

export function gradeCandidate(
  composite: number,
  dims: V5DimensionScores,
  suite: SuiteDefinition,
): GradeDecision {
  const baseGrade = pickBaseGrade(composite, dims, suite);
  const finalGrade = clampToCap(baseGrade, suite.gradeCap);

  const boundaryAnalysis = computeBoundaryAnalysis(composite, dims, suite, finalGrade, baseGrade);
  const confidence = computeConfidence(composite, dims, suite, finalGrade, boundaryAnalysis);
  const dangerFlag = computeDangerFlag(composite, dims);
  const reasoning = generateReasoning({
    grade: finalGrade,
    composite,
    confidence,
    boundaryAnalysis,
    dangerFlag,
  });

  return {
    grade: finalGrade,
    composite,
    dimensions: dims,
    confidence,
    boundaryAnalysis,
    reasoning,
    ...(dangerFlag ? { dangerFlag } : {}),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Capability Profiles — Round 3 重构 4
// ────────────────────────────────────────────────────────────────────────────

export function computeCapabilityProfile(
  profileId: CapabilityProfileId,
  dims: V5DimensionScores,
): CapabilityProfile {
  const def = CAPABILITY_PROFILE_DEFINITIONS[profileId];

  let weightedSum = 0;
  let activeWeight = 0;
  const breakdown: Partial<Record<V5Dimension, number>> = {};

  for (const [dimStr, weight] of Object.entries(def.dimensions)) {
    if (weight == null || weight <= 0) continue;
    const dim = dimStr as V5Dimension;
    const actual = dims[dim];
    if (actual == null) continue;
    weightedSum += actual * weight;
    activeWeight += weight;
    breakdown[dim] = actual * weight;
  }

  const rawScore = activeWeight > 0 ? weightedSum / activeWeight : 0;
  const score = Math.round(rawScore * 10) / 10;
  const label = scoreToCapabilityLabel(score);

  return {
    id: profileId,
    nameZh: def.nameZh,
    nameEn: def.nameEn,
    score,
    label,
    dimensionBreakdown: breakdown,
    evidenceSignals: [...def.evidenceSignalIds],
    description: def.descriptionTemplate(label),
  };
}

export function computeAllProfiles(
  dims: V5DimensionScores,
  participatingDimensions: readonly V5Dimension[],
): CapabilityProfile[] {
  const participatingSet = new Set(participatingDimensions);

  return CAPABILITY_PROFILE_IDS.filter((id) => {
    const def = CAPABILITY_PROFILE_DEFINITIONS[id];
    const declaredDims = Object.keys(def.dimensions) as V5Dimension[];
    return declaredDims.some((d) => participatingSet.has(d));
  }).map((id) => computeCapabilityProfile(id, dims));
}

/** 从 suite.weightProfile 推导参与维度(weight > 0)。 */
export function participatingDimensionsOf(suite: SuiteDefinition): V5Dimension[] {
  return V5_DIMENSIONS.filter((d) => (suite.weightProfile[d] ?? 0) > 0);
}
