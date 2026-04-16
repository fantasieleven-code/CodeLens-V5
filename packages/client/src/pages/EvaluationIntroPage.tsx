/**
 * EvaluationIntroPage — pre-flight screen shown before the first module.
 *
 * Reads sessionId / suiteId from useSessionStore, pulls the suite definition
 * from SUITES, and renders a summary (duration, module count, module list)
 * plus house rules ("can't pause / can't revise after submit"). Clicking the
 * start button calls moduleStore.advance(), which transitions from 'intro'
 * to the first module in moduleOrder.
 *
 * loadSession is kicked off on mount. Once it resolves the session will
 * either start fresh (currentModule == 'intro') or jump to the in-progress
 * module; ExamRouter handles the branch by switching on currentModule.
 */

import React, { useEffect } from 'react';
import type { V5ModuleKey } from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

const MODULE_LABELS: Record<V5ModuleKey, string> = {
  phase0: '基线诊断',
  moduleA: 'AI 审判 — 方案权衡与代码审查',
  mb: 'AI 协作编程（Cursor 模式）',
  moduleD: '系统设计',
  selfAssess: '自我评估',
  moduleC: '语音追问',
};

const HOUSE_RULES = [
  '本次评估围绕一个真实业务系统展开',
  '所有模块都针对同一系统的不同切面',
  '支持 AI 协作（请在允许的模块内使用）',
  '评估不可暂停',
  '提交后无法返回修改',
];

export const EvaluationIntroPage: React.FC = () => {
  const sessionId = useSessionStore((s) => s.sessionId);
  const suiteId = useSessionStore((s) => s.suiteId);
  const loadSession = useSessionStore((s) => s.loadSession);
  const moduleOrderFromSession = useSessionStore((s) => s.moduleOrder);
  const moduleOrderFromStore = useModuleStore((s) => s.moduleOrder);
  const advance = useModuleStore((s) => s.advance);

  useEffect(() => {
    if (sessionId) {
      void loadSession(sessionId);
    }
  }, [sessionId, loadSession]);

  const moduleOrder =
    moduleOrderFromStore.length > 0 ? moduleOrderFromStore : moduleOrderFromSession;
  const suite = suiteId ? SUITES[suiteId] : null;

  const canStart = Boolean(suite && moduleOrder.length > 0);

  return (
    <div data-testid="evaluation-intro-container" style={styles.container}>
      <div style={styles.content}>
        <header style={styles.header}>
          <span style={styles.brand}>CodeLens</span>
          <h1 style={styles.title}>欢迎参加技术评估</h1>
          {suite && (
            <p style={styles.subtitle}>
              你本次的评估套件：
              <strong data-testid="evaluation-intro-suite-name" style={styles.suiteName}>
                {suite.nameZh}
              </strong>
            </p>
          )}
        </header>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>本次评估</h2>
          <div style={styles.metaRow}>
            <div style={styles.metaCell}>
              <span style={styles.metaLabel}>预计时长</span>
              <span
                data-testid="evaluation-intro-estimated-minutes"
                style={styles.metaValue}
              >
                {suite?.estimatedMinutes ?? '—'} <span style={styles.metaUnit}>分钟</span>
              </span>
            </div>
            <div style={styles.metaCell}>
              <span style={styles.metaLabel}>包含模块</span>
              <span style={styles.metaValue}>
                {moduleOrder.length} <span style={styles.metaUnit}>个</span>
              </span>
            </div>
          </div>

          <ul data-testid="evaluation-intro-module-list" style={styles.moduleList}>
            {moduleOrder.map((id, idx) => (
              <li key={id} style={styles.moduleItem}>
                <span style={styles.moduleIndex}>{idx + 1}</span>
                <span style={styles.moduleLabel}>{MODULE_LABELS[id] ?? id}</span>
              </li>
            ))}
          </ul>
        </section>

        <section style={styles.card}>
          <h2 style={styles.cardTitle}>评估说明</h2>
          <ul style={styles.rulesList}>
            {HOUSE_RULES.map((rule, i) => (
              <li key={i} style={styles.ruleItem}>
                <span style={styles.ruleBullet}>·</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <div style={styles.ctaRow}>
          <button
            type="button"
            data-testid="evaluation-intro-start-button"
            onClick={advance}
            disabled={!canStart}
            style={{
              ...styles.startBtn,
              ...(canStart ? {} : styles.startBtnDisabled),
            }}
          >
            我已理解，开始评估
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: colors.base,
    padding: `${spacing.xxl} ${spacing.lg}`,
    overflowY: 'auto',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    maxWidth: 560,
    width: '100%',
    paddingTop: 40,
    paddingBottom: 48,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center' as const,
    gap: spacing.sm,
  },
  brand: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.mauve,
    letterSpacing: '1px',
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    margin: 0,
  },
  suiteName: {
    color: colors.mauve,
    marginLeft: spacing.xs,
    fontWeight: fontWeights.semibold,
  },
  card: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  metaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: spacing.md,
  },
  metaCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: spacing.md,
    backgroundColor: colors.surface0,
    borderRadius: radii.md,
  },
  metaLabel: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  metaValue: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  metaUnit: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    fontWeight: fontWeights.normal,
  },
  moduleList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  moduleItem: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.sm} 0`,
    borderBottom: `1px solid ${colors.surface0}`,
  },
  moduleIndex: {
    width: 24,
    height: 24,
    borderRadius: '50%',
    backgroundColor: colors.surface0,
    color: colors.subtext1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    flexShrink: 0,
  },
  moduleLabel: {
    fontSize: fontSizes.md,
    color: colors.subtext1,
  },
  rulesList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  ruleItem: {
    display: 'flex',
    gap: spacing.sm,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
  },
  ruleBullet: {
    color: colors.mauve,
    fontWeight: fontWeights.bold,
  },
  ctaRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  startBtn: {
    padding: `${spacing.md} ${spacing.xxl}`,
    backgroundColor: colors.mauve,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  },
  startBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
};
