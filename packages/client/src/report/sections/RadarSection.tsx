import React from 'react';
import { Card } from '../../components/ui/Card.js';
import { RadarChart } from '../../components/charts/RadarChart.js';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../lib/tokens.js';
import { V5_DIMENSION_LABELS_ZH } from '../dimension-labels.js';
import type { SectionProps } from '../section-registry.js';
import type { V5Dimension } from '@codelens-v5/shared';

/** Round 3 调整:radar 从 Layer 1 降级到 Layer 2,用画像卡替代它作为 summary 主视图。 */
export function RadarSection({ viewModel }: SectionProps): React.ReactElement {
  const chartData: Record<string, number> = {};
  for (const [dim, score] of Object.entries(viewModel.dimensions)) {
    const label = V5_DIMENSION_LABELS_ZH[dim as V5Dimension] ?? dim;
    chartData[label] = score ?? 0;
  }

  return (
    <Card padding="lg" data-testid="radar-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        六维度雷达
      </h3>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RadarChart data={chartData} size={320} />
      </div>
    </Card>
  );
}
