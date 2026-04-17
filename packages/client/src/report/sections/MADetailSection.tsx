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

/** Layer 2 · Module A(技术判断)三回合提交。 */
export function MADetailSection({ viewModel }: SectionProps): React.ReactElement | null {
  const moduleA = viewModel.submissions.moduleA;
  if (!moduleA) return null;
  const { round1, round2, round3 } = moduleA;

  return (
    <Card padding="lg" data-testid="ma-detail-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        模块 A · 技术判断
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
        <div data-testid="ma-round1">
          <Header text={`R1 方案选择 · ${round1.schemeId}`} />
          <Field label="推理">{round1.reasoning}</Field>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: spacing.sm,
              marginBottom: spacing.sm,
            }}
          >
            <Field label="Scenario">{round1.structuredForm.scenario}</Field>
            <Field label="Tradeoff">{round1.structuredForm.tradeoff}</Field>
            <Field label="Decision">{round1.structuredForm.decision}</Field>
            <Field label="Verification">{round1.structuredForm.verification}</Field>
          </div>
          <Field label="面对挑战的回应">{round1.challengeResponse}</Field>
        </div>

        <div data-testid="ma-round2">
          <Header text="R2 代码评审标注" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
            {round2.markedDefects.length === 0 ? (
              <span style={{ color: colors.overlay2, fontSize: fontSizes.sm }}>
                候选人未标注任何缺陷
              </span>
            ) : (
              round2.markedDefects.map((defect) => (
                <div
                  key={defect.defectId}
                  style={{
                    padding: spacing.sm,
                    backgroundColor: colors.surface1,
                    borderRadius: radii.sm,
                    fontSize: fontSizes.sm,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: spacing.sm,
                      alignItems: 'center',
                      marginBottom: spacing.xs,
                    }}
                  >
                    <Badge
                      variant={
                        defect.commentType === 'bug'
                          ? 'danger'
                          : defect.commentType === 'suggestion'
                            ? 'info'
                            : 'default'
                      }
                    >
                      {defect.commentType}
                    </Badge>
                    <span style={{ color: colors.overlay2, fontSize: fontSizes.xs }}>
                      {defect.defectId}
                    </span>
                  </div>
                  <div style={{ color: colors.text }}>{defect.comment}</div>
                  {defect.fixSuggestion && (
                    <div
                      style={{
                        marginTop: spacing.xs,
                        color: colors.subtext1,
                        fontSize: fontSizes.xs,
                      }}
                    >
                      修复:{defect.fixSuggestion}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div data-testid="ma-round3">
          <Header text="R3 诊断" />
          <div style={{ marginBottom: spacing.xs }}>
            <Badge variant={round3.correctVersionChoice === 'success' ? 'success' : 'danger'}>
              选择:{round3.correctVersionChoice === 'success' ? '成功版本' : '失败版本'}
            </Badge>
          </div>
          <Field label="Diff 分析">{round3.diffAnalysis}</Field>
          <Field label="根因诊断">{round3.diagnosisText}</Field>
        </div>
      </div>
    </Card>
  );
}

function Header({ text }: { text: string }): React.ReactElement {
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
