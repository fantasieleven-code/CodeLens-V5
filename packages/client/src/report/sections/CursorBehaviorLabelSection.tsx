import React from 'react';
import { Card } from '../../components/ui/Card.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import type { CursorBehaviorLabelId } from '../types.js';
import type { SectionProps } from '../section-registry.js';

/** Round 2 调整 5 的 4 档 Cursor 行为标签在 Hero 区的着色。 */
function labelColor(label: CursorBehaviorLabelId): string {
  switch (label) {
    case '深思熟虑型':
      return colors.green;
    case '熟练接受型':
      return colors.teal;
    case '快速粘贴型':
      return colors.yellow;
    case '无序混乱型':
      return colors.red;
  }
}

/**
 * Layer 1 · Cursor Behavior Label(仅 full_stack / ai_engineer / deep_dive 触发)。
 * Round 2 调整 5:MB 段内行为结论,直接在 summary 层告诉 HR "候选人的 AI 使用模式"。
 */
export function CursorBehaviorLabelSection({ viewModel }: SectionProps): React.ReactElement | null {
  const cbl = viewModel.cursorBehaviorLabel;
  if (!cbl) return null;
  const color = labelColor(cbl.label);

  return (
    <Card padding="md" data-testid="cursor-behavior-label-section">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.sm,
        }}
      >
        <span
          style={{
            backgroundColor: color,
            color: colors.crust,
            padding: `${spacing.xs} ${spacing.md}`,
            borderRadius: radii.full,
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.semibold,
          }}
        >
          {cbl.label}
        </span>
        <span
          style={{
            fontSize: fontSizes.sm,
            color: colors.overlay2,
          }}
        >
          Cursor 模式行为画像 · {cbl.evidenceSignals.length} 条信号支撑
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: fontSizes.md,
          color: colors.text,
          lineHeight: 1.6,
        }}
      >
        {cbl.summary}
      </p>
    </Card>
  );
}
