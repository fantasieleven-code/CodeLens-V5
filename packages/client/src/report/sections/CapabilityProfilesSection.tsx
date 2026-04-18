import React from 'react';
import { Card } from '../../components/ui/Card.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import { V5_DIMENSION_LABELS_ZH } from '../dimension-labels.js';
import { capabilityLabelColor } from '../grade-style.js';
import type { SectionProps } from '../section-registry.js';

/**
 * Layer 1 · Capability Profiles:
 * 4 张画像卡片在 Hero 之后、Radar 之前,给 HR 一个"候选人能不能独立交付/AI 协作成熟度/系统思维/学习敏捷"的快读。
 */
export function CapabilityProfilesSection({ viewModel }: SectionProps): React.ReactElement {
  const { capabilityProfiles } = viewModel;
  return (
    <section data-testid="capability-profiles-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        能力画像
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: spacing.md,
        }}
      >
        {capabilityProfiles.map((profile) => {
          const labelColor = capabilityLabelColor(profile.label);
          return (
            <Card
              key={profile.id}
              padding="md"
              data-testid={`capability-profile-${profile.id}`}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: spacing.sm,
                }}
              >
                <span
                  style={{
                    fontSize: fontSizes.md,
                    fontWeight: fontWeights.semibold,
                    color: colors.text,
                  }}
                >
                  {profile.nameZh}
                </span>
                <span
                  data-testid={`capability-profile-label-${profile.id}`}
                  style={{
                    display: 'inline-block',
                    backgroundColor: labelColor,
                    color: colors.crust,
                    padding: `${spacing.xs} ${spacing.sm}`,
                    borderRadius: radii.full,
                    fontSize: fontSizes.xs,
                    fontWeight: fontWeights.semibold,
                  }}
                >
                  {profile.label}
                </span>
              </div>

              <div
                data-testid={`capability-profile-score-${profile.id}`}
                style={{
                  fontSize: fontSizes.xxl,
                  fontWeight: fontWeights.bold,
                  color: labelColor,
                  lineHeight: 1,
                  marginBottom: spacing.xs,
                }}
              >
                {profile.score?.toFixed(1) ?? '—'}
              </div>

              <p
                style={{
                  margin: 0,
                  marginBottom: spacing.sm,
                  fontSize: fontSizes.sm,
                  color: colors.subtext1,
                  lineHeight: 1.5,
                }}
              >
                {profile.description}
              </p>

              <div
                style={{
                  borderTop: `1px solid ${colors.surface1}`,
                  paddingTop: spacing.sm,
                  fontSize: fontSizes.xs,
                  color: colors.overlay2,
                }}
              >
                <div style={{ marginBottom: spacing.xs }}>主导维度</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
                  {Object.entries(profile.dimensionBreakdown).map(([dim, contribution]) => (
                    <span
                      key={dim}
                      style={{
                        padding: `2px ${spacing.sm}`,
                        backgroundColor: colors.surface1,
                        borderRadius: radii.sm,
                        fontSize: fontSizes.xs,
                        color: colors.subtext0,
                      }}
                    >
                      {V5_DIMENSION_LABELS_ZH[dim as keyof typeof V5_DIMENSION_LABELS_ZH] ?? dim}
                      <span style={{ color: colors.overlay1, marginLeft: 4 }}>
                        +{contribution?.toFixed(1) ?? '—'}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
