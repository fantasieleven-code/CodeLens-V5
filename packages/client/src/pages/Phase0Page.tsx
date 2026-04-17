/**
 * Phase0Page — skeleton. Real implementation lands in Task 4
 * (L1/L2/L3 code-reading ladder + 2× AI output judgment + AI claim detection).
 *
 * For Task 3 this page only provides a navigable placeholder so the flow
 * state machine can be exercised end-to-end.
 */

import React from 'react';
import { useModuleStore } from '../stores/module.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export const Phase0Page: React.FC = () => {
  const advance = useModuleStore((s) => s.advance);

  return (
    <ModuleShell>
      <section style={styles.card} data-testid="phase0-skeleton">
        <span style={styles.pill}>Phase 0 · 基线诊断</span>
        <h1 style={styles.title}>开发中</h1>
        <p style={styles.body}>
          真实功能由 Task 4 实现:
          <br />
          3 层代码阅读(L1/L2/L3)+ 2× AI 输出判断 + AI 声明验证。
        </p>
        <button
          type="button"
          data-testid="phase0-finish-stub"
          onClick={advance}
          style={styles.btn}
        >
          完成模块(占位)
        </button>
      </section>
    </ModuleShell>
  );
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xxl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    alignItems: 'flex-start',
    maxWidth: 560,
    width: '100%',
  },
  pill: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: `${colors.mauve}22`,
    color: colors.mauve,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.5px',
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  body: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  btn: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: spacing.sm,
  },
};
