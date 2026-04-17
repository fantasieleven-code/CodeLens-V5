import React from 'react';
import { Card } from '../../components/ui/Card.js';
import { ScoreBar } from '../../components/charts/ScoreBar.js';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../lib/tokens.js';
import { V5_DIMENSION_LABELS_ZH } from '../dimension-labels.js';
import type { SectionProps } from '../section-registry.js';
import { V5Dimension } from '@codelens-v5/shared';

/** Layer 2 · 六维度分数与权重。 */
export function DimensionsSection({ viewModel }: SectionProps): React.ReactElement {
  const { dimensions, suite } = viewModel;
  const orderedDims: V5Dimension[] = [
    V5Dimension.TECHNICAL_JUDGMENT,
    V5Dimension.AI_ENGINEERING,
    V5Dimension.SYSTEM_DESIGN,
    V5Dimension.CODE_QUALITY,
    V5Dimension.COMMUNICATION,
    V5Dimension.METACOGNITION,
  ];

  return (
    <Card padding="lg" data-testid="dimensions-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        六维度分数
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {orderedDims.map((dim) => {
          const score = dimensions[dim] ?? 0;
          const weight = suite.weightProfile[dim] ?? 0;
          const label = `${V5_DIMENSION_LABELS_ZH[dim]} · 权重 ${(weight * 100).toFixed(0)}%`;
          return (
            <ScoreBar key={dim} score={score} maxScore={100} label={label} />
          );
        })}
      </div>
    </Card>
  );
}
