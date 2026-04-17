/**
 * ModuleDPage — skeleton. Real implementation lands in Task 8
 * (system design sub-module decomposition + constraint selection +
 * 3 LLM-whitelist signals on MD answers).
 */

import React from 'react';
import { useModuleStore } from '../stores/module.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export const ModuleDPage: React.FC = () => {
  const advance = useModuleStore((s) => s.advance);

  return (
    <ModuleShell>
      <section style={styles.card} data-testid="moduleD-skeleton">
        <span style={styles.pill}>Module D · 系统设计</span>
        <h1 style={styles.title}>开发中</h1>
        <p style={styles.body}>
          真实功能由 Task 8 实现:
          <br />
          子模块拆解 + 约束配置 + 3× LLM 白名单评分(capacity / tradeoff / risk)。
        </p>
        <button
          type="button"
          data-testid="moduleD-finish-stub"
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
