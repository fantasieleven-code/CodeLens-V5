import React from 'react';
import { Card } from '../../components/ui/Card.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import { gradeBadgeColor, gradeRecommendation } from '../grade-style.js';
import type { SectionProps } from '../section-registry.js';

/**
 * Layer 1 · 推荐动作:Grade → 文案映射。
 * B + dangerFlag 时在文案后追加"需人工复核"。
 */
export function RecommendationSection({ viewModel }: SectionProps): React.ReactElement {
  const { gradeDecision } = viewModel;
  const baseText = gradeRecommendation(gradeDecision.grade);
  const hasDanger = Boolean(gradeDecision.dangerFlag);
  const lowConfidence = gradeDecision.confidence === 'low';
  const fullText = hasDanger
    ? `${baseText} · 需人工复核(见风险提示)`
    : lowConfidence
      ? `${baseText} · 低置信,建议人工终审`
      : baseText;
  const gradeColor = gradeBadgeColor(gradeDecision.grade);

  return (
    <Card
      padding="lg"
      data-testid="recommendation-section"
      style={{
        borderLeft: `4px solid ${gradeColor}`,
      }}
    >
      <div
        style={{
          fontSize: fontSizes.xs,
          color: colors.overlay2,
          fontWeight: fontWeights.medium,
          marginBottom: spacing.xs,
        }}
      >
        推荐动作
      </div>
      <div
        data-testid="recommendation-text"
        style={{
          fontSize: fontSizes.xl,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        {fullText}
      </div>
      {gradeDecision.boundaryAnalysis.blockingFactor && (
        <div
          style={{
            marginTop: spacing.sm,
            padding: spacing.sm,
            backgroundColor: colors.surface1,
            borderRadius: radii.sm,
            fontSize: fontSizes.sm,
            color: colors.subtext1,
          }}
        >
          阻挡升级的因素:{gradeDecision.boundaryAnalysis.blockingFactor}
        </div>
      )}
    </Card>
  );
}
