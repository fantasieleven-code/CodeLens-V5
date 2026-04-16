/**
 * Four-field structured reasoning form used by Module A Round 1.
 *
 * Signal contract (sReasoningDepth): each field counts toward 0.25 if it
 * reaches ≥20 "meaningful" characters. Field names align with the V5 signal
 * engine's V5ModuleASubmission.round1.structuredForm:
 * scenario / tradeoff / decision / verification.
 *
 * Kept as a standalone component so tests can verify the 20-char hint
 * without mounting the full ModuleAPage.
 */

import React from 'react';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface StructuredReasoning {
  scenario: string;
  tradeoff: string;
  decision: string;
  verification: string;
}

interface Props {
  value: StructuredReasoning;
  onChange: (next: StructuredReasoning) => void;
}

const FIELDS: Array<{
  key: keyof StructuredReasoning;
  label: string;
  placeholder: string;
}> = [
  {
    key: 'scenario',
    label: '1. 场景与约束',
    placeholder: '例：流量峰值 < 1000 QPS；数据库支持行级锁；跨机房部署…',
  },
  {
    key: 'tradeoff',
    label: '2. 关键权衡',
    placeholder: '例：性能 vs 代码简洁度；强一致性 vs 高可用…',
  },
  {
    key: 'decision',
    label: '3. 决策与理由',
    placeholder: '例：选 B 方案，因为在给定约束下它对可扩展性最友好…',
  },
  {
    key: 'verification',
    label: '4. 验证方式',
    placeholder: '例：单元测试覆盖边界；压测脚本模拟 10x 流量…',
  },
];

const MIN_CHARS = 20;

export const StructuredReasoningForm: React.FC<Props> = ({ value, onChange }) => {
  return (
    <div style={styles.container}>
      {FIELDS.map((f) => {
        const text = value[f.key] ?? '';
        const len = text.trim().length;
        const ok = len >= MIN_CHARS;
        return (
          <div key={f.key} style={styles.field}>
            <div style={styles.labelRow}>
              <label style={styles.label}>{f.label}</label>
              <span
                style={{
                  ...styles.counter,
                  color: ok ? colors.green : colors.overlay1,
                }}
                data-testid={`reasoning-counter-${f.key}`}
              >
                {len}/{MIN_CHARS}+
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
              placeholder={f.placeholder}
              rows={3}
              style={styles.textarea}
              data-testid={`reasoning-field-${f.key}`}
            />
          </div>
        );
      })}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  labelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  counter: {
    fontSize: fontSizes.xs,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
  },
  textarea: {
    width: '100%',
    padding: spacing.sm,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    minHeight: 60,
  },
};
