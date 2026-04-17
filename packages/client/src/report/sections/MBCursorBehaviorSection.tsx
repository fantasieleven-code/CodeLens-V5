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

/**
 * Layer 2 · MB Cursor 行为数据(从 editorBehavior 聚合而来)。
 * 和 Layer 1 的 cursor-behavior-label 不同:此处展示具体数字和事件分布,供工程评审。
 */
export function MBCursorBehaviorSection({ viewModel }: SectionProps): React.ReactElement | null {
  const mb = viewModel.submissions.mb;
  if (!mb) return null;
  const { editorBehavior } = mb;

  const completionCount = editorBehavior.aiCompletionEvents.length;
  const completionAccepted = editorBehavior.aiCompletionEvents.filter((e) => e.accepted).length;
  const acceptRate =
    completionCount === 0 ? 0 : (completionAccepted / completionCount) * 100;
  const chatCount = editorBehavior.chatEvents.length;
  const diffCount = editorBehavior.diffEvents.length;
  const testRuns = editorBehavior.testRuns.length;

  return (
    <Card padding="lg" data-testid="mb-cursor-behavior-section">
      <h3
        style={{
          margin: 0,
          marginBottom: spacing.md,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        MB Cursor 行为数据
      </h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        <Metric label="Completion 接受率" value={`${acceptRate.toFixed(0)}%`} />
        <Metric label="Completion 事件" value={completionCount.toString()} />
        <Metric label="Chat 事件" value={chatCount.toString()} />
        <Metric label="Diff 事件" value={diffCount.toString()} />
        <Metric label="测试运行" value={testRuns.toString()} />
      </div>

      {editorBehavior.aiCompletionEvents.length > 0 && (
        <div data-testid="mb-completion-events">
          <SubHeader text="Completion 事件样本" />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr 80px 60px',
              gap: spacing.xs,
              fontSize: fontSizes.xs,
              color: colors.subtext0,
            }}
          >
            <div style={{ color: colors.overlay2 }}>时间</div>
            <div style={{ color: colors.overlay2 }}>行号</div>
            <div style={{ color: colors.overlay2 }}>长度</div>
            <div style={{ color: colors.overlay2 }}>接受</div>
            {editorBehavior.aiCompletionEvents.slice(0, 5).map((ev, i) => (
              <React.Fragment key={i}>
                <div>+{i * 1}s</div>
                <div>L{ev.lineNumber}</div>
                <div>{ev.completionLength}</div>
                <div style={{ color: ev.accepted ? colors.green : colors.red }}>
                  {ev.accepted ? 'yes' : 'no'}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
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

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div
      style={{
        padding: spacing.sm,
        backgroundColor: colors.surface1,
        borderRadius: radii.sm,
      }}
    >
      <div style={{ fontSize: fontSizes.xs, color: colors.overlay2, marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.semibold,
          color: colors.text,
        }}
      >
        {value}
      </div>
    </div>
  );
}
