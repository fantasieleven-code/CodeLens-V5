import { V5Dimension } from '@codelens-v5/shared';

/**
 * V5 六维度 → 中文展示名。`adminConstants.DIMENSION_LABELS` 仍保留 V4 tier 映射，
 * 这里是 V5 的客户端展示常量(不进 shared，因为展示字面量不是跨 agent 契约)。
 */
export const V5_DIMENSION_LABELS_ZH: Record<V5Dimension, string> = {
  [V5Dimension.TECHNICAL_JUDGMENT]: '技术判断力',
  [V5Dimension.AI_ENGINEERING]: 'AI 工程力',
  [V5Dimension.SYSTEM_DESIGN]: '系统设计',
  [V5Dimension.CODE_QUALITY]: '代码质量',
  [V5Dimension.COMMUNICATION]: '沟通',
  [V5Dimension.METACOGNITION]: '元认知',
};

export function getDimensionLabel(dim: V5Dimension): string {
  return V5_DIMENSION_LABELS_ZH[dim] ?? dim;
}
