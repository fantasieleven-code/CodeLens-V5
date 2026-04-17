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

/** Layer 2 · Module D(系统设计)子模块/接口/数据流/权衡/AI 编排 Prompt。 */
export function MDHeroSection({ viewModel }: SectionProps): React.ReactElement | null {
  const md = viewModel.submissions.moduleD;
  if (!md) return null;

  return (
    <Card padding="lg" data-testid="md-hero-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        模块 D · 系统设计
      </h3>

      <div data-testid="md-submodules" style={{ marginBottom: spacing.md }}>
        <SubHeader text="子模块" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {md.subModules.map((sm) => (
            <div
              key={sm.name}
              style={{
                padding: spacing.sm,
                backgroundColor: colors.surface1,
                borderRadius: radii.sm,
              }}
            >
              <div
                style={{
                  fontSize: fontSizes.sm,
                  fontWeight: fontWeights.semibold,
                  color: colors.text,
                }}
              >
                {sm.name}
              </div>
              <div style={{ fontSize: fontSizes.xs, color: colors.subtext1 }}>
                {sm.responsibility}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div data-testid="md-interfaces" style={{ marginBottom: spacing.md }}>
        <SubHeader text="接口定义" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {md.interfaceDefinitions.map((iface, i) => (
            <code
              key={i}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.surface1,
                borderRadius: radii.sm,
                fontSize: fontSizes.xs,
                color: colors.subtext1,
              }}
            >
              {iface}
            </code>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: spacing.md }}>
        <SubHeader text="数据流" />
        <div style={{ fontSize: fontSizes.sm, color: colors.subtext1, lineHeight: 1.5 }}>
          {md.dataFlowDescription}
        </div>
      </div>

      <div style={{ marginBottom: spacing.md }}>
        <SubHeader text="约束" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {md.constraintsSelected.map((c, i) => (
            <Badge key={i} variant="info">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: spacing.md }}>
        <SubHeader text="Tradeoff" />
        <div style={{ fontSize: fontSizes.sm, color: colors.subtext1, lineHeight: 1.5 }}>
          {md.tradeoffText}
        </div>
      </div>

      <div data-testid="md-orchestration">
        <SubHeader text="AI 编排 Prompt" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {md.aiOrchestrationPrompts.map((prompt, i) => (
            <div
              key={i}
              style={{
                padding: spacing.sm,
                backgroundColor: colors.surface1,
                borderRadius: radii.sm,
                fontSize: fontSizes.xs,
                color: colors.subtext1,
                fontFamily: 'monospace',
                lineHeight: 1.5,
              }}
            >
              {prompt}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SubHeader({ text }: { text: string }): React.ReactElement {
  return (
    <div
      style={{
        fontSize: fontSizes.md,
        fontWeight: fontWeights.semibold,
        color: colors.text,
        marginBottom: spacing.sm,
      }}
    >
      {text}
    </div>
  );
}
