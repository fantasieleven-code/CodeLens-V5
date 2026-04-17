/**
 * ViolationAuditPanel — MB Stage 4 (audit) UI.
 *
 * Task 7.5 per frontend-agent-tasks.md Section 7.5 + design-reference-full.md
 * Section 15 Stage 4 state machine.
 *
 * Stage 4 shows 3 AI-execution cards; each card has a snippet of generated code
 * (plus AI's own explanation if present). The candidate marks each card as
 * 合规 (compliant) or 违规 (violation); on violation they pick a rule from the
 * list parsed out of the Stage 3 RULES.md the candidate themselves wrote.
 *
 * Props shape vs shared contract divergence (pre-verify, Pattern C):
 *
 *   MBViolationExample in shared has { exampleIndex, code, isViolation,
 *   violationType?, explanation } where isViolation / violationType are
 *   GROUND TRUTH (backend scoring only — NEVER sent to the client).
 *   Task 7.6 ModuleBPage is responsible for stripping those fields and
 *   mapping `explanation` → `aiClaimedReason` before passing here.
 *
 *   This component therefore accepts the narrower candidate-safe shape
 *   `{ code, aiClaimedReason? }` so there is no way to leak groundTruth
 *   through a prop misuse bug.
 *
 *   V5MBAudit in shared is `{ violations: [...] }` — NO submittedAt field
 *   (the brief suggested one, but shared won; following shared). The
 *   v5:mb:audit:submit socket payload also drops submittedAt. Parent adds
 *   its own timestamp metadata as needed.
 *
 * Submit gating:
 *   Every card must be marked AND violations must have a ruleId selected —
 *   unless the parsed rules list is empty (degraded state when rulesContent
 *   is missing or unparseable, see parseRulesFromContent). In that degraded
 *   case we allow violation without ruleId rather than forcing a dead-end.
 *
 * Rules parser:
 *   `parseRulesFromContent` supports markdown bullet `- text` / `* text`,
 *   numbered `1. text` / `1) text`, and `## heading` lines. V5.0 scope —
 *   V5.1 can swap in a real markdown parser if candidates want richer
 *   RULES.md (code blocks, nested lists, etc.).
 *
 * Not in scope (Task 7.6 ModuleBPage integrator):
 *   - Socket emission (v5:mb:audit:submit).
 *   - Stripping groundTruth fields from MBViolationExample.
 *   - Locking on stage transition (parent passes disabled=true).
 *   - Showing isViolation / violationType groundTruth to the candidate.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { V5MBAudit } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

export interface AuditViolationExample {
  code: string;
  aiClaimedReason?: string;
}

export interface ViolationAuditPanelProps {
  sessionId: string;
  violationExamples: AuditViolationExample[];
  rulesContent: string;
  onSubmit: (audit: V5MBAudit) => void;
  disabled?: boolean;
}

interface ParsedRule {
  id: string;
  text: string;
}

type MarkingStatus = 'unmarked' | 'compliant' | 'violation';

interface Marking {
  status: MarkingStatus;
  ruleId: string;
}

export function parseRulesFromContent(rulesContent: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = rulesContent.split('\n');
  let idx = 0;
  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
    const heading = line.match(/^##\s+(.+)/);
    const match = bullet ?? numbered ?? heading;
    if (!match) continue;
    const text = match[1].trim();
    if (text.length === 0) continue;
    rules.push({ id: `rule_${idx}`, text });
    idx += 1;
  }
  return rules;
}

export const ViolationAuditPanel: React.FC<ViolationAuditPanelProps> = ({
  sessionId: _sessionId,
  violationExamples,
  rulesContent,
  onSubmit,
  disabled = false,
}) => {
  const rules = useMemo(() => parseRulesFromContent(rulesContent), [rulesContent]);
  const noRules = rules.length === 0;

  const [markings, setMarkings] = useState<Marking[]>(() =>
    violationExamples.map(() => ({ status: 'unmarked', ruleId: '' })),
  );

  const setStatus = useCallback(
    (i: number, status: MarkingStatus) => {
      setMarkings((prev) => {
        const next = prev.slice();
        next[i] = { status, ruleId: status === 'violation' ? prev[i].ruleId : '' };
        return next;
      });
    },
    [],
  );

  const setRuleId = useCallback((i: number, ruleId: string) => {
    setMarkings((prev) => {
      const next = prev.slice();
      next[i] = { ...prev[i], ruleId };
      return next;
    });
  }, []);

  const canSubmit = useMemo(() => {
    if (disabled) return false;
    if (markings.length === 0) return false;
    return markings.every((m) => {
      if (m.status === 'unmarked') return false;
      if (m.status === 'violation') {
        return noRules || m.ruleId.length > 0;
      }
      return true;
    });
  }, [disabled, markings, noRules]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    const audit: V5MBAudit = {
      violations: markings.map((m, i) => ({
        exampleIndex: i,
        markedAsViolation: m.status === 'violation',
        violatedRuleId:
          m.status === 'violation' && m.ruleId.length > 0 ? m.ruleId : undefined,
      })),
    };
    onSubmit(audit);
  }, [canSubmit, markings, onSubmit]);

  return (
    <div style={styles.root} data-testid="mb-audit-root">
      <section style={styles.header}>
        <h2 style={styles.h2}>合规审计</h2>
        <p style={styles.hint}>
          下方是 AI 基于你的 RULES.md 生成的 3 段执行代码。对每段判断是否违反你设定的规则；
          若违规，从列表中选出违反的具体 rule。
        </p>
        {noRules ? (
          <p style={styles.noRulesHint} data-testid="mb-audit-no-rules-hint">
            未在 Stage 3 的 RULES.md 中解析到任何规则。你仍可以标注违规，但无法选择具体 rule。
            若要完整评估，建议返回 Stage 3 补充 RULES.md。
          </p>
        ) : null}
      </section>

      <section style={styles.cards}>
        {violationExamples.map((ex, i) => (
          <ViolationCard
            key={i}
            index={i}
            example={ex}
            marking={markings[i]}
            rules={rules}
            disabled={disabled}
            noRules={noRules}
            onStatusChange={(s) => setStatus(i, s)}
            onRuleChange={(id) => setRuleId(i, id)}
          />
        ))}
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
          data-testid="mb-audit-submit"
        >
          完成评估
        </button>
      </section>
    </div>
  );
};

interface ViolationCardProps {
  index: number;
  example: AuditViolationExample;
  marking: Marking;
  rules: ParsedRule[];
  disabled: boolean;
  noRules: boolean;
  onStatusChange: (status: MarkingStatus) => void;
  onRuleChange: (ruleId: string) => void;
}

const ViolationCard: React.FC<ViolationCardProps> = ({
  index,
  example,
  marking,
  rules,
  disabled,
  noRules,
  onStatusChange,
  onRuleChange,
}) => (
  <article style={styles.card} data-testid={`mb-violation-card-${index}`}>
    <header style={styles.cardHeader}>
      <span style={styles.cardTitle}>示例 {index + 1}</span>
    </header>

    <pre
      style={styles.codeBlock}
      data-testid={`mb-violation-card-${index}-code`}
    >
      <code>{example.code}</code>
    </pre>

    {example.aiClaimedReason ? (
      <div style={styles.aiReason} data-testid={`mb-violation-card-${index}-ai-reason`}>
        <span style={styles.aiReasonLabel}>AI 声明理由</span>
        <p style={styles.aiReasonText}>{example.aiClaimedReason}</p>
      </div>
    ) : null}

    <div style={styles.markingRow}>
      <label style={styles.markingLabel}>你的判断</label>
      <select
        style={styles.select}
        value={marking.status}
        onChange={(e) => onStatusChange(e.target.value as MarkingStatus)}
        disabled={disabled}
        data-testid={`mb-violation-toggle-${index}`}
      >
        <option value="unmarked">— 未标注 —</option>
        <option value="compliant">合规</option>
        <option value="violation">违规</option>
      </select>
    </div>

    {marking.status === 'violation' ? (
      <div style={styles.ruleRow}>
        <label style={styles.markingLabel}>违反 rule</label>
        <select
          style={styles.select}
          value={marking.ruleId}
          onChange={(e) => onRuleChange(e.target.value)}
          disabled={disabled || noRules}
          data-testid={`mb-violation-rule-select-${index}`}
        >
          <option value="">{noRules ? '无可用 rule' : '— 选择 rule —'}</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>
              {r.text}
            </option>
          ))}
        </select>
      </div>
    ) : null}
  </article>
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
    maxWidth: 1080,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  h2: {
    margin: 0,
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  hint: {
    margin: 0,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.5,
  },
  noRulesHint: {
    margin: 0,
    padding: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.peach,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.peach}`,
    borderRadius: radii.sm,
    lineHeight: 1.4,
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: spacing.lg,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.subtext1,
  },
  codeBlock: {
    margin: 0,
    padding: spacing.sm,
    backgroundColor: colors.crust,
    color: colors.text,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.sm,
    fontFamily:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  aiReason: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.base,
    border: `1px dashed ${colors.surface1}`,
    borderRadius: radii.sm,
  },
  aiReasonLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.overlay2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  aiReasonText: {
    margin: 0,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.4,
  },
  markingRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  markingLabel: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    color: colors.subtext1,
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    padding: spacing.xs,
    backgroundColor: colors.crust,
    color: colors.text,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    fontSize: fontSizes.sm,
  },
  ruleRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  actions: {
    display: 'flex',
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
};
