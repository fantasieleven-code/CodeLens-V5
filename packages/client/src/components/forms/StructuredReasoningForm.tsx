// TODO V5: Verify props interface matches V5ModuleASubmission.round1.structuredForm
//   V5 fields: { scenario, tradeoff, decision, verification }
//   If V4 used different names (assumptions/tradeoffs/risks/verification), rename to V5 names
// TODO V5: Keep unchanged: 4-field structured input UI, validation logic, submit handler
// TODO V5: Used by: packages/client/src/pages/ModuleAPage.tsx (Round 1 section)
// Original V4 path: packages/client/src/components/v4/StructuredReasoningForm.tsx

/**
 * Four-field structured reasoning form used by Module A Round 1.
 *
 * Signal contract (sReasoningDepth): each field counts toward 0.25 if it
 * reaches ≥20 "meaningful" characters. Field names here (assumptions /
 * tradeoffs / risks / verification) map to the signal engine's
 * scenario/tradeoff/decision/verification via scoring-orchestrator-v4.
 *
 * Reused by ModuleAPage Round 1. Kept as a standalone component so tests
 * can verify the 20-char hint without mounting the full page.
 */

import React from 'react';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface StructuredReasoning {
  assumptions: string;
  tradeoffs: string;
  risks: string;
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
    key: 'assumptions',
    label: '1. 你做了哪些假设？',
    placeholder: '例：假设流量峰值 < 1000 QPS；假设数据库可支持行级锁…',
  },
  {
    key: 'tradeoffs',
    label: '2. 你权衡了哪些取舍？',
    placeholder: '例：性能 vs 代码简洁度；一致性 vs 可用性…',
  },
  {
    key: 'risks',
    label: '3. 你看到了哪些风险？',
    placeholder: '例：并发写入可能导致 double-booking；缓存雪崩…',
  },
  {
    key: 'verification',
    label: '4. 你会如何验证？',
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
