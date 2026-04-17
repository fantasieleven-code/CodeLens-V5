/**
 * MB3StandardsPanel — MB Stage 3 (standards authoring) UI.
 *
 * Task 7.6 support component per frontend-agent-tasks.md Section 7.6 L712-718
 * + design-reference-full.md Section 15 Stage 3.
 *
 * Stage 3 asks the candidate to author their own RULES.md (style / forbidden
 * patterns) that Stage 4 will audit three AI-generated snippets against.
 * AGENT.md is optional (V5.0 keeps it freeform; V5.1 may template it).
 *
 * Submit gating:
 *   - rulesContent.trim() must have content (otherwise Stage 4 has nothing
 *     to audit against — the rules parser in ViolationAuditPanel would yield
 *     an empty list and force the degraded path).
 *   - agentContent is optional — empty string is acceptable and the submit
 *     strips trailing whitespace before emitting.
 *
 * Callback shape:
 *   onSubmit({ rulesContent, agentContent }) — no submittedAt (shared
 *   V5MBStandards has no timestamp field; mirrors ViolationAuditPanel).
 *
 * Not in scope for this component:
 *   - Socket emission (`v5:mb:standards:submit`) — ModuleBPage wires the
 *     parent state to the socket.
 *   - Syntax-highlighting for the markdown body — candidates write plain
 *     text lists; the Stage 4 parser is line-oriented and doesn't need
 *     structured markdown.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { V5MBStandards } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface MB3StandardsPanelProps {
  sessionId: string;
  onSubmit: (standards: V5MBStandards) => void;
  disabled?: boolean;
}

export const MB3StandardsPanel: React.FC<MB3StandardsPanelProps> = ({
  sessionId: _sessionId,
  onSubmit,
  disabled = false,
}) => {
  const [rulesContent, setRulesContent] = useState('');
  const [agentContent, setAgentContent] = useState('');

  const canSubmit = useMemo(() => {
    if (disabled) return false;
    return rulesContent.trim().length > 0;
  }, [disabled, rulesContent]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const trimmedAgent = agentContent.trim();
    onSubmit({
      rulesContent,
      ...(trimmedAgent.length > 0 ? { agentContent } : {}),
    });
  }, [canSubmit, rulesContent, agentContent, onSubmit]);

  return (
    <div style={styles.root} data-testid="mb-standards-root">
      <section style={styles.header}>
        <h2 style={styles.h2}>规范 · RULES.md</h2>
        <p style={styles.hint}>
          写下你希望 AI 执行时遵守的规范。下一阶段会给出三段 AI
          生成的代码，请基于你自己写的 RULES.md 来审核它们是否合规。
        </p>
      </section>

      <label style={styles.fieldLabel}>
        <span style={styles.fieldLabelText}>RULES.md（必填）</span>
        <textarea
          style={styles.textarea}
          data-testid="mb-standards-rules"
          value={rulesContent}
          onChange={(e) => setRulesContent(e.target.value)}
          placeholder={
            '示例：\n- 所有函数必须是纯函数，不得修改入参\n- 列表操作优先使用推导式，不得先 sort 再过滤\n- 不允许 catch Exception 再吞掉异常'
          }
          disabled={disabled}
          rows={14}
        />
      </label>

      <label style={styles.fieldLabel}>
        <span style={styles.fieldLabelText}>AGENT.md（可选）</span>
        <textarea
          style={styles.textarea}
          data-testid="mb-standards-agent"
          value={agentContent}
          onChange={(e) => setAgentContent(e.target.value)}
          placeholder="为协作 AI 预留的上下文，比如偏好、禁止项、输出格式。留空即可。"
          disabled={disabled}
          rows={6}
        />
      </label>

      <div style={styles.actions}>
        <button
          type="button"
          style={{
            ...styles.btnPrimary,
            ...(canSubmit ? null : styles.btnDisabled),
          }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="mb-standards-submit"
        >
          提交规范，进入审核
        </button>
        {!canSubmit && !disabled && (
          <span style={styles.warn} data-testid="mb-standards-warn">
            RULES.md 不能为空 — Stage 4 需要规则来审核 AI 输出。
          </span>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.base,
    color: colors.text,
    fontSize: fontSizes.md,
    maxWidth: 880,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  h2: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    margin: 0,
    color: colors.text,
  },
  hint: {
    margin: 0,
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
    alignItems: 'center',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  btnPrimary: {
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
  warn: {
    color: colors.peach,
    fontSize: fontSizes.xs,
  },
};
