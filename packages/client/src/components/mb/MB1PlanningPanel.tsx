/**
 * MB1PlanningPanel — MB Stage 1 (planning) UI.
 *
 * Task 7.4 per frontend-agent-tasks.md Section 7.4 + design-reference-full.md
 * Section 15 Stage 1 state machine.
 *
 * Stage 1 shows the candidate the featureRequirement (description + 5
 * acceptanceCriteria) and collects a freeform plan in three textareas:
 *   - decomposition        — 分步计划
 *   - dependencies         — 接口设计
 *   - fallbackStrategy     — 降级方案 (testid: mb-planning-fallback;
 *                            tasks.md L679 uses short-form for the testid,
 *                            shared V5MBPlanning calls the field
 *                            fallbackStrategy)
 *
 * Submit gating (design-reference L1478): the "提交" button enables once
 * at least one textarea has content. "跳过此环节" is always clickable.
 *
 * Skip UX (Gemini's note, design-reference L1458): the skip button has
 * a distinct secondary style + an inline hint ("跳过此环节将以默认方式
 *评估，建议有经验的候选人填写") so the candidate sees the implication
 * before clicking. Click enters a confirm strip in-place rather than a
 * modal — modals break keyboard flow and this stage already has low
 * complexity. Confirm/cancel are two buttons on the strip.
 *
 * Callback shape:
 *   Single `onSubmit(planning)` for both paths — the `skipped` flag on
 *   V5MBPlanning discriminates. This matches design-reference L1482-1483:
 *     submit → { decomposition, dependencies, fallbackStrategy,
 *                submittedAt, skipped: false }
 *     skip   → { decomposition: '', dependencies: '', fallbackStrategy: '',
 *                submittedAt, skipped: true }
 *
 * Not in scope for this component:
 *   - Socket emission (v5:mb:planning:submit) — Task 7.6 ModuleBPage
 *     integrator wires parent state to the socket.
 *   - Locking on re-entry — Stage 1 is terminal once submitted/skipped;
 *     parent passes disabled=true to lock the UI.
 *   - Client-side persistence (refresh discards state — V5.0 doesn't
 *     support rewind).
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { V5MBPlanning } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface MB1PlanningPanelProps {
  sessionId: string;
  featureRequirement: {
    description: string;
    acceptanceCriteria: string[];
  };
  onSubmit: (planning: V5MBPlanning) => void;
  disabled?: boolean;
}

export const MB1PlanningPanel: React.FC<MB1PlanningPanelProps> = ({
  sessionId: _sessionId,
  featureRequirement,
  onSubmit,
  disabled = false,
}) => {
  const [decomposition, setDecomposition] = useState('');
  const [dependencies, setDependencies] = useState('');
  const [fallbackStrategy, setFallbackStrategy] = useState('');
  const [skipConfirming, setSkipConfirming] = useState(false);

  const canSubmit = useMemo(() => {
    if (disabled) return false;
    return (
      decomposition.trim().length > 0 ||
      dependencies.trim().length > 0 ||
      fallbackStrategy.trim().length > 0
    );
  }, [disabled, decomposition, dependencies, fallbackStrategy]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    onSubmit({
      decomposition,
      dependencies,
      fallbackStrategy,
      submittedAt: Date.now(),
      skipped: false,
    });
  }, [canSubmit, decomposition, dependencies, fallbackStrategy, onSubmit]);

  const handleSkipConfirm = useCallback(() => {
    if (disabled) return;
    onSubmit({
      decomposition: '',
      dependencies: '',
      fallbackStrategy: '',
      submittedAt: Date.now(),
      skipped: true,
    });
  }, [disabled, onSubmit]);

  return (
    <div style={styles.root} data-testid="mb-planning-root">
      <section style={styles.featureSection}>
        <h2 style={styles.h2}>功能需求</h2>
        <p style={styles.description} data-testid="mb-planning-feature-description">
          {featureRequirement.description}
        </p>
        <h3 style={styles.h3}>验收标准</h3>
        <ol style={styles.criteriaList}>
          {featureRequirement.acceptanceCriteria.map((c, i) => (
            <li
              key={i}
              style={styles.criteriaItem}
              data-testid={`mb-planning-feature-criterion-${i}`}
            >
              {c}
            </li>
          ))}
        </ol>
      </section>

      <section style={styles.formSection}>
        <h2 style={styles.h2}>规划</h2>
        <p style={styles.hint}>
          写下你的实现计划。填得越具体，Stage 1 的信号分越高；至少一项有内容才能提交。
        </p>

        <TextareaField
          label="分步计划（decomposition）"
          testId="mb-planning-decomposition"
          value={decomposition}
          onChange={setDecomposition}
          disabled={disabled}
          placeholder="1. 先... 2. 然后... 3. 最后..."
          rows={5}
        />

        <TextareaField
          label="接口设计（dependencies）"
          testId="mb-planning-dependencies"
          value={dependencies}
          onChange={setDependencies}
          disabled={disabled}
          placeholder="列出关键函数签名 + 各自职责。"
          rows={4}
        />

        <TextareaField
          label="降级方案（fallbackStrategy）"
          testId="mb-planning-fallback"
          value={fallbackStrategy}
          onChange={setFallbackStrategy}
          disabled={disabled}
          placeholder="如 X 失败，fallback 到 Y。"
          rows={3}
        />
      </section>

      <section style={styles.actions}>
        <button
          type="button"
          style={{
            ...styles.btnPrimary,
            ...(canSubmit ? null : styles.btnDisabled),
          }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="mb-planning-submit"
        >
          提交
        </button>

        {skipConfirming ? (
          <div style={styles.skipConfirmRow} data-testid="mb-planning-skip-confirm-row">
            <span style={styles.skipConfirmText}>确认跳过规划环节？本阶段的信号会按跳过处理。</span>
            <button
              type="button"
              style={styles.btnDangerOutline}
              onClick={handleSkipConfirm}
              disabled={disabled}
              data-testid="mb-planning-skip-confirm"
            >
              确认跳过
            </button>
            <button
              type="button"
              style={styles.btnSecondary}
              onClick={() => setSkipConfirming(false)}
              disabled={disabled}
              data-testid="mb-planning-skip-cancel"
            >
              取消
            </button>
          </div>
        ) : (
          <div style={styles.skipRow}>
            <button
              type="button"
              style={styles.btnSecondary}
              onClick={() => setSkipConfirming(true)}
              disabled={disabled}
              data-testid="mb-planning-skip"
            >
              跳过此环节
            </button>
            <span style={styles.skipHint}>
              跳过此环节将以默认方式评估，建议有经验的候选人填写。
            </span>
          </div>
        )}
      </section>
    </div>
  );
};

interface TextareaFieldProps {
  label: string;
  testId: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  rows: number;
}

const TextareaField: React.FC<TextareaFieldProps> = ({
  label,
  testId,
  value,
  onChange,
  disabled,
  placeholder,
  rows,
}) => (
  <label style={styles.fieldLabel}>
    <span style={styles.fieldLabelText}>{label}</span>
    <textarea
      style={styles.textarea}
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
    />
  </label>
);

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    padding: spacing.xl,
    backgroundColor: colors.base,
    color: colors.text,
    fontSize: fontSizes.md,
    maxWidth: 880,
    margin: '0 auto',
  },
  featureSection: {
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  formSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  h2: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    margin: `0 0 ${spacing.sm} 0`,
    color: colors.text,
  },
  h3: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    margin: `${spacing.md} 0 ${spacing.sm} 0`,
    color: colors.subtext1,
  },
  description: {
    margin: 0,
    color: colors.subtext0,
    lineHeight: 1.5,
  },
  criteriaList: {
    margin: 0,
    paddingLeft: spacing.lg,
    color: colors.subtext0,
  },
  criteriaItem: {
    marginBottom: spacing.xs,
    lineHeight: 1.5,
  },
  hint: {
    margin: `0 0 ${spacing.sm} 0`,
    color: colors.overlay2,
    fontSize: fontSizes.sm,
    lineHeight: 1.4,
  },
  fieldLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  fieldLabelText: {
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    color: colors.text,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: fontSizes.sm,
    lineHeight: 1.5,
    resize: 'vertical',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  btnPrimary: {
    alignSelf: 'flex-start',
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.blue,
    color: colors.crust,
    border: 'none',
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
  },
  btnDisabled: {
    backgroundColor: colors.surface1,
    color: colors.overlay1,
    cursor: 'not-allowed',
  },
  btnSecondary: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: 'transparent',
    color: colors.subtext0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    cursor: 'pointer',
  },
  btnDangerOutline: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: 'transparent',
    color: colors.peach,
    border: `1px solid ${colors.peach}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
    cursor: 'pointer',
  },
  skipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  skipHint: {
    color: colors.overlay2,
    fontSize: fontSizes.xs,
    lineHeight: 1.4,
    flex: 1,
    minWidth: 200,
  },
  skipConfirmRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.peach}`,
    borderRadius: radii.sm,
  },
  skipConfirmText: {
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    flex: 1,
    minWidth: 240,
  },
};
