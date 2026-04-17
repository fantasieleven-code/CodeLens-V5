/**
 * ModuleAPage — skeleton. Real implementation lands in Task 5
 * (R1 scheme selection + challenge response + R2 code review +
 * R3 diagnosis + R4 migration verification).
 */

import React from 'react';
import { useModuleStore } from '../stores/module.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export const ModuleAPage: React.FC = () => {
  const advance = useModuleStore((s) => s.advance);

  return (
    <ModuleShell>
      <section style={styles.card} data-testid="moduleA-skeleton">
        <span style={styles.pill}>Module A · AI 审判</span>
        <h1 style={styles.title}>开发中</h1>
        <p style={styles.body}>
          真实功能由 Task 5 实现:
          <br />
          Round 1 方案权衡 + 挑战对抗 · Round 2 代码审查 · Round 3 故障诊断 ·
          Round 4 迁移验证。
        </p>
        <button
          type="button"
          data-testid="moduleA-finish-stub"
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
