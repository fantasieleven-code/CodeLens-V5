import type { CapabilityLabel, GradeConfidence, V5Grade } from '@codelens-v5/shared';
import { colors } from '../lib/tokens.js';

/** Grade → Badge 变体(用于 Hero 区的大 badge 和 recommendation)。 */
export function gradeBadgeColor(grade: V5Grade): string {
  switch (grade) {
    case 'S+':
    case 'S':
      return colors.green;
    case 'A':
      return colors.teal;
    case 'B+':
      return colors.blue;
    case 'B':
      return colors.yellow;
    case 'C':
      return colors.peach;
    case 'D':
      return colors.red;
  }
}

/** Grade → 推荐动作文案。 */
export function gradeRecommendation(grade: V5Grade): string {
  switch (grade) {
    case 'S+':
      return '强烈推荐录用';
    case 'S':
      return '推荐录用';
    case 'A':
      return '推荐进入终面';
    case 'B+':
      return '有条件推荐';
    case 'B':
      return '谨慎推荐(见风险标注)';
    case 'C':
      return '不推荐';
    case 'D':
      return '不推荐';
  }
}

export function confidenceLabel(confidence: GradeConfidence): string {
  switch (confidence) {
    case 'high':
      return '高置信';
    case 'medium':
      return '中等置信';
    case 'low':
      return '低置信 · 边界候选人';
  }
}

export function confidenceColor(confidence: GradeConfidence): string {
  switch (confidence) {
    case 'high':
      return colors.green;
    case 'medium':
      return colors.yellow;
    case 'low':
      return colors.peach;
  }
}

/** CapabilityLabel → 色值,和 grade 系保持一致视觉语系。 */
export function capabilityLabelColor(label: CapabilityLabel): string {
  switch (label) {
    case '自主':
      return colors.green;
    case '熟练':
      return colors.teal;
    case '有潜力':
      return colors.yellow;
    case '待发展':
      return colors.peach;
  }
}
