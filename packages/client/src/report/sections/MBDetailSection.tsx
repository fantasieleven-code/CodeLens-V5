import React from 'react';
import { Card } from '../../components/ui/Card.js';
import {
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '../../lib/tokens.js';
import type { SectionProps } from '../section-registry.js';

/** Layer 2 · Module B(Cursor 模式)Planning 与 finalFiles 摘要。 */
export function MBDetailSection({ viewModel }: SectionProps): React.ReactElement | null {
  const mb = viewModel.submissions.mb;
  if (!mb) return null;
  const { planning, finalFiles, finalTestPassRate } = mb;

  return (
    <Card padding="lg" data-testid="mb-detail-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        模块 B · Cursor 交付
      </h3>

      <div
        style={{
          display: 'flex',
          gap: spacing.md,
          marginBottom: spacing.md,
          alignItems: 'center',
        }}
      >
        <Stat label="最终测试通过率" value={`${(finalTestPassRate * 100).toFixed(0)}%`} />
        <Stat label="文件数" value={finalFiles.length.toString()} />
      </div>

      {planning && (
        <div data-testid="mb-planning" style={{ marginBottom: spacing.md }}>
          <SubHeader text="Planning" />
          <Field label="Decomposition">{planning.decomposition}</Field>
          <Field label="Dependencies">{planning.dependencies}</Field>
          <Field label="Fallback">{planning.fallbackStrategy}</Field>
        </div>
      )}

      <div data-testid="mb-final-files">
        <SubHeader text="最终文件" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
          {finalFiles.map((file) => (
            <code
              key={file.path}
              style={{
                padding: `${spacing.xs} ${spacing.sm}`,
                backgroundColor: colors.surface1,
                borderRadius: radii.sm,
                fontSize: fontSizes.xs,
                color: colors.subtext1,
                fontFamily: 'monospace',
              }}
            >
              {file.path}
            </code>
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

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: spacing.xs }}>
      <div style={{ fontSize: fontSizes.xs, color: colors.overlay2, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: fontSizes.sm, color: colors.subtext1, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div
      style={{
        padding: `${spacing.sm} ${spacing.md}`,
        backgroundColor: colors.surface1,
        borderRadius: radii.sm,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: fontSizes.xs, color: colors.overlay2 }}>{label}</div>
      <div
        style={{
          fontSize: fontSizes.xl,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}
