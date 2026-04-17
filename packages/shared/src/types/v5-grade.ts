import type { V5Dimension, V5Grade, V5DimensionScores } from './v5-dimensions.js';

/**
 * Round 3 重构 2(Grade with Confidence)——带置信度的可解释评级。
 *
 * gradeCandidate 不再返回离散 { grade, dangerFlag },而是一个结构化 decision:
 * - confidence: composite 与最近阈值、floor 的最小余量决定 high/medium/low
 * - boundaryAnalysis: 说明距上下相邻 grade 的距离和阻挡因素
 * - reasoning: 人类可读的一句话解释,前端 Hero section 直出
 * - dangerFlag: B- 警告,仅在触发时出现(原 V4 逻辑保留)
 */

export type GradeConfidence = 'high' | 'medium' | 'low';

export interface GradeBoundaryAnalysis {
  /** 距上一级 grade(null 表示已到 gradeCap 或无上级)。 */
  nearestUpperGrade: V5Grade | null;
  /** composite 到 upper 阈值的距离(正数,null = 已最高)。 */
  distanceToUpper: number | null;
  /**
   * 升级被什么阻挡:
   * - 'composite < N' 表示 composite 未达阈值
   * - '<dim> < <floor>' 表示某维度 floor 未达标
   * - 'gradeCap' 表示被套件 gradeCap 卡住
   * null 表示无需升级说明(e.g. 已到 cap 或 confidence=high)。
   */
  blockingFactor: string | null;
  /** 距下一级 grade(null 表示已到 D)。 */
  nearestLowerGrade: V5Grade | null;
  /** composite 到 lower 阈值的距离(正数,null = 已最低)。 */
  distanceToLower: number | null;
}

export interface GradeDangerFlag {
  /** 人类可读的警告信息,前端直接显示。 */
  message: string;
  /** 支撑本警告的信号 id 列表(Round 3 重构 1 evidence trace 接点)。 */
  evidenceSignals: string[];
}

export interface GradeDecision {
  grade: V5Grade;
  composite: number;
  dimensions: V5DimensionScores;
  confidence: GradeConfidence;
  boundaryAnalysis: GradeBoundaryAnalysis;
  /** 人类可读的一句话说明,由 generateReasoning 生成。 */
  reasoning: string;
  /** 仅在 B- 风险触发时出现(V4 保留逻辑:composite>=55 且 TJ/CQ 错配)。 */
  dangerFlag?: GradeDangerFlag;
}

/**
 * 每个 V5Grade 的 composite 阈值(lower bound)。
 * D 是兜底:composite < 45 的区间均判 D,无下阈。
 */
export const V5_GRADE_COMPOSITE_THRESHOLDS: Record<V5Grade, number> = {
  D: 0,
  C: 45,
  B: 55,
  'B+': 65,
  A: 75,
  S: 85,
  'S+': 90,
};

/** Confidence 判定的余量阈值(minMargin 单位=composite/floor 分数)。 */
export const CONFIDENCE_HIGH_MARGIN = 5;
export const CONFIDENCE_MEDIUM_MARGIN = 3;

/** dangerFlag 判定阈值——沿用 V4。 */
export const DANGER_FLAG_TJ_CEILING = 50;
export const DANGER_FLAG_CQ_FLOOR = 60;
export const DANGER_FLAG_GAP = 15;

/** 便于外部生成 blockingFactor 字符串时引用的 dim 名称映射(保持与 V5Dimension enum 一致)。 */
export type GradeFloorViolation = {
  dimension: V5Dimension;
  actual: number;
  required: number;
};
