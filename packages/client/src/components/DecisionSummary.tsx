/**
 * DecisionSummary — readonly 3-card recap of the candidate's prior-module
 * decisions, rendered above the SelfAssess reflection textarea so they can
 * review their trajectory before rating themselves.
 *
 * Source of truth: session.store.getDecisionSummary() — a condensed view of
 * submissions.moduleA.round1 / submissions.mb.planning / submissions.moduleD.
 * Fields may be absent when the suite skipped a module (e.g. quick_screen
 * has no MB/MD) or when the candidate hasn't submitted it. Each card renders
 * independently, and the whole section falls back to a quiet hint if no
 * prior decisions exist at all.
 *
 * Purely presentational — no store reads, no mutations. SelfAssessPage
 * passes the summary in so tests can render the component in isolation.
 */

import React from 'react';
import type { DecisionSummary as DecisionSummaryData } from '../stores/session.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export interface DecisionSummaryProps {
  summary: DecisionSummaryData;
}

const REASONING_PREVIEW_CHARS = 80;

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export const DecisionSummary: React.FC<DecisionSummaryProps> = ({ summary }) => {
  const hasAny =
    summary.ma !== undefined || summary.mb !== undefined || summary.md !== undefined;

  return (
    <section style={styles.root} data-testid="decision-summary-root">
      <header style={styles.header}>
        <h2 style={styles.title}>你在前序模块的决策回顾</h2>
        <p style={styles.hint}>
          在自评前，花 30 秒回看一下你做过的决策 —— 有助于校准你对自己表现的判断。
        </p>
      </header>

      {!hasAny && (
        <p style={styles.empty}>本套件没有前序决策模块。</p>
      )}

      <div style={styles.grid}>
        {summary.ma && (
          <article style={styles.card} data-testid="decision-summary-ma">
            <div style={{ ...styles.moduleTag, backgroundColor: `${colors.blue}22`, color: colors.blue }}>
              Module A · 方案选型
            </div>
            <p style={styles.cardBody}>
              你选择了方案 <strong style={styles.emphasis}>{summary.ma.schemeId}</strong>
              {summary.ma.reasoning.trim().length > 0 && (
                <>
                  ，理由：
                  <span style={styles.reasoning}>
                    {truncate(summary.ma.reasoning, REASONING_PREVIEW_CHARS)}
                  </span>
                </>
              )}
            </p>
          </article>
        )}

        {summary.mb && (
          <article style={styles.card} data-testid="decision-summary-mb">
            <div style={{ ...styles.moduleTag, backgroundColor: `${colors.mauve}22`, color: colors.mauve }}>
              Module B · Cursor 协作
            </div>
            <p style={styles.cardBody}>
              你的分步计划开头：
              <span style={styles.reasoning}>
                {summary.mb.decomposition.trim().length > 0
                  ? truncate(summary.mb.decomposition, REASONING_PREVIEW_CHARS)
                  : '（未填写）'}
              </span>
            </p>
          </article>
        )}

        {summary.md && (
          <article style={styles.card} data-testid="decision-summary-md">
            <div style={{ ...styles.moduleTag, backgroundColor: `${colors.peach}22`, color: colors.peach }}>
              Module D · 系统设计
            </div>
            <p style={styles.cardBody}>
              你设计了 <strong style={styles.emphasis}>{summary.md.subModuleCount}</strong> 个模块，
              选中 <strong style={styles.emphasis}>{summary.md.constraintCount}</strong> 类关键约束。
            </p>
          </article>
        )}
      </div>
    </section>
  );
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  title: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  hint: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.5,
  },
  empty: {
    fontSize: fontSizes.sm,
    color: colors.overlay1,
    margin: 0,
    fontStyle: 'italic',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.md,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface0,
    borderRadius: radii.sm,
    border: `1px solid ${colors.surface1}`,
  },
  moduleTag: {
    alignSelf: 'flex-start',
    padding: `2px ${spacing.sm}`,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.3px',
  },
  cardBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext1,
    lineHeight: 1.6,
    margin: 0,
  },
  emphasis: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  reasoning: {
    color: colors.subtext0,
  },
};
