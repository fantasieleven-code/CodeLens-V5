import React from 'react';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import type { SectionProps } from '../section-registry.js';

/** Layer 2 · Module C(面试官探查)对话回放。 */
export function MCTranscriptSection({ viewModel }: SectionProps): React.ReactElement | null {
  const moduleC = viewModel.submissions.moduleC;
  if (!moduleC || moduleC.length === 0) return null;

  return (
    <Card padding="lg" data-testid="mc-transcript-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        模块 C · 面试官探查回放
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        {moduleC.map((turn, i) => (
          <div
            key={i}
            data-testid={`mc-turn-${turn.round}`}
            style={{
              padding: spacing.md,
              backgroundColor: colors.surface1,
              borderRadius: radii.sm,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: spacing.sm,
                alignItems: 'center',
                marginBottom: spacing.sm,
              }}
            >
              <Badge variant="info">Round {turn.round}</Badge>
              {turn.probeStrategy && (
                <Badge variant="default">策略 · {turn.probeStrategy}</Badge>
              )}
            </div>
            <div style={{ marginBottom: spacing.sm }}>
              <Label>面试官</Label>
              <div style={{ fontSize: fontSizes.sm, color: colors.text, lineHeight: 1.5 }}>
                {turn.question}
              </div>
            </div>
            <div>
              <Label>候选人</Label>
              <div
                style={{
                  fontSize: fontSizes.sm,
                  color: colors.subtext1,
                  lineHeight: 1.5,
                }}
              >
                {turn.answer}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: fontSizes.xs,
        color: colors.overlay2,
        fontWeight: fontWeights.medium,
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  );
}
