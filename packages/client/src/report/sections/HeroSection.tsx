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
import {
  confidenceColor,
  confidenceLabel,
  gradeBadgeColor,
} from '../grade-style.js';
import type { SectionProps } from '../section-registry.js';

/** Layer 1 · Hero:大 Grade Badge + confidence + composite + reasoning + dangerFlag。 */
export function HeroSection({ viewModel }: SectionProps): React.ReactElement {
  const { gradeDecision, candidateName, suite } = viewModel;
  const { grade, composite, confidence, reasoning, dangerFlag, boundaryAnalysis } = gradeDecision;
  const gradeColor = gradeBadgeColor(grade);
  const confColor = confidenceColor(confidence);

  return (
    <Card padding="lg" data-testid="hero-section">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.xl, flexWrap: 'wrap' }}>
        <div
          data-testid="hero-grade-badge"
          style={{
            backgroundColor: gradeColor,
            color: colors.crust,
            borderRadius: radii.lg,
            padding: `${spacing.md} ${spacing.xl}`,
            fontSize: 56,
            fontWeight: fontWeights.bold,
            lineHeight: 1,
            minWidth: 120,
            textAlign: 'center',
          }}
        >
          {grade}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.md,
              marginBottom: spacing.sm,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: fontSizes.xxl,
                color: colors.text,
                fontWeight: fontWeights.semibold,
              }}
            >
              {candidateName ?? suite.nameZh}
            </h2>
            <Badge
              variant="default"
              data-testid="hero-confidence-badge"
              style={{ backgroundColor: confColor, color: colors.crust }}
            >
              {confidenceLabel(confidence)}
            </Badge>
          </div>

          <div
            style={{
              fontSize: fontSizes.md,
              color: colors.subtext1,
              marginBottom: spacing.md,
            }}
          >
            <span>{suite.nameZh}</span>
            <span style={{ margin: `0 ${spacing.sm}`, color: colors.overlay1 }}>·</span>
            <span data-testid="hero-composite">综合 {composite?.toFixed(1) ?? '—'}</span>
            {boundaryAnalysis.nearestUpperGrade && boundaryAnalysis.distanceToUpper !== null && (
              <>
                <span style={{ margin: `0 ${spacing.sm}`, color: colors.overlay1 }}>·</span>
                <span data-testid="hero-distance-upper">
                  距 {boundaryAnalysis.nearestUpperGrade} 差 {boundaryAnalysis?.distanceToUpper?.toFixed(1) ?? '—'}
                </span>
              </>
            )}
          </div>

          <p
            data-testid="hero-reasoning"
            style={{
              margin: 0,
              fontSize: fontSizes.md,
              color: colors.text,
              lineHeight: 1.6,
            }}
          >
            {reasoning}
          </p>

          {dangerFlag && (
            <div
              data-testid="hero-danger-flag"
              style={{
                marginTop: spacing.lg,
                padding: spacing.md,
                backgroundColor: `${colors.red}22`,
                borderLeft: `3px solid ${colors.red}`,
                borderRadius: radii.sm,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  marginBottom: spacing.xs,
                }}
              >
                <Badge variant="danger">风险提示</Badge>
                <span
                  style={{
                    fontSize: fontSizes.sm,
                    color: colors.overlay2,
                  }}
                >
                  支撑信号 {dangerFlag.evidenceSignals.length} 条
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
                {dangerFlag.message}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
