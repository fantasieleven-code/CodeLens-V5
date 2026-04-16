/**
 * V5 六维度评分体系。
 *
 * 每个信号归属于一个维度；suite 通过 weightProfile 决定维度合成 composite 的权重。
 * 未参与的维度在 suite 里权重为 0，composite 计算时通过 N/A rescaling 跳过。
 */
export enum V5Dimension {
  TECHNICAL_JUDGMENT = 'technicalJudgment',
  AI_ENGINEERING = 'aiEngineering',
  SYSTEM_DESIGN = 'systemDesign',
  CODE_QUALITY = 'codeQuality',
  COMMUNICATION = 'communication',
  METACOGNITION = 'metacognition',
}

export const V5_DIMENSIONS: readonly V5Dimension[] = [
  V5Dimension.TECHNICAL_JUDGMENT,
  V5Dimension.AI_ENGINEERING,
  V5Dimension.SYSTEM_DESIGN,
  V5Dimension.CODE_QUALITY,
  V5Dimension.COMMUNICATION,
  V5Dimension.METACOGNITION,
] as const;

/** 维度分数：0-100；缺失（null / undefined）表示该套件不评估该维度。 */
export type V5DimensionScores = Partial<Record<V5Dimension, number | null>>;

export type V5Grade = 'D' | 'C' | 'B' | 'B+' | 'A' | 'S' | 'S+';

/** 从低到高，用于 gradeCap 比较。 */
export const V5_GRADE_ORDER: readonly V5Grade[] = ['D', 'C', 'B', 'B+', 'A', 'S', 'S+'] as const;

export function compareGrade(a: V5Grade, b: V5Grade): number {
  return V5_GRADE_ORDER.indexOf(a) - V5_GRADE_ORDER.indexOf(b);
}
