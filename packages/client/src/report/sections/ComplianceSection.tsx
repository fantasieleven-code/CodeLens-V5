import React from 'react';
import { Card } from '../../components/ui/Card.js';
import { Badge } from '../../components/ui/Badge.js';
import {
  colors,
  fontSizes,
  fontWeights,
  spacing,
} from '../../lib/tokens.js';
import type { SectionProps } from '../section-registry.js';

/**
 * Layer 2 · 合规与元信息:sessionId / completedAt / 算法版本摘要。
 * 正式 API 上线后会加上反作弊/完成度字段,占位阶段只显示最基础信息。
 */
export function ComplianceSection({ viewModel }: SectionProps): React.ReactElement {
  const completedAt = viewModel.completedAt
    ? new Date(viewModel.completedAt).toISOString()
    : '—';
  const algorithmVersions = new Set<string>();
  for (const r of Object.values(viewModel.signalResults)) {
    if (r?.algorithmVersion) algorithmVersions.add(r.algorithmVersion);
  }

  return (
    <Card padding="md" data-testid="compliance-section">
      <div
        style={{
          display: 'flex',
          gap: spacing.md,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: spacing.sm,
        }}
      >
        <span
          style={{
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.semibold,
            color: colors.text,
          }}
        >
          会话合规
        </span>
        <Badge variant="info">{viewModel.suite.id}</Badge>
        <Badge variant="default">{viewModel.participatingModules.length} 个模块</Badge>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: spacing.sm,
          fontSize: fontSizes.xs,
          color: colors.subtext1,
        }}
      >
        <Field label="Session ID">
          <code>{viewModel.sessionId}</code>
        </Field>
        <Field label="Completed At">{completedAt}</Field>
        <Field label="算法版本数">{algorithmVersions.size}</Field>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: fontSizes.xs, color: colors.overlay2, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: fontSizes.xs, color: colors.subtext1, fontFamily: 'monospace' }}>
        {children}
      </div>
    </div>
  );
}
