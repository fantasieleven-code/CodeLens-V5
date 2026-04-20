import React, { useEffect, useState } from 'react';
import { adminApi } from '../../../services/adminApi.js';
import type { V5AdminStatsOverview, V5Grade, SuiteId } from '@codelens-v5/shared';
import { SUITES, V5_GRADE_ORDER } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../../lib/tokens.js';

const SUITE_ORDER: readonly SuiteId[] = [
  'full_stack',
  'architect',
  'ai_engineer',
  'quick_screen',
  'deep_dive',
];

const GRADE_COLORS: Record<V5Grade, string> = {
  'S+': colors.mauve,
  S: colors.blue,
  A: colors.teal,
  'B+': colors.green,
  B: colors.yellow,
  C: colors.peach,
  D: colors.red,
};

export const AdminDashboardPage: React.FC = () => {
  const [stats, setStats] = useState<V5AdminStatsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getStatsOverview()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div data-testid="admin-dashboard-error" style={styles.error}>
        仪表盘加载失败:{error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div data-testid="admin-dashboard-loading" style={styles.loading}>
        正在加载仪表盘…
      </div>
    );
  }

  const completionPct = Math.round(stats.completionRate * 100);
  const maxGradeCount = Math.max(1, ...Object.values(stats.gradeDistribution));
  const maxSuiteCount = Math.max(1, ...Object.values(stats.suiteDistribution));

  return (
    <div data-testid="admin-dashboard-root" style={styles.container}>
      <h1 style={styles.title}>仪表盘</h1>

      <section style={styles.kpiRow}>
        <KpiCard label="总会话数" value={stats.totalSessions} testid="admin-dashboard-total" />
        <KpiCard
          label="完成会话"
          value={stats.completedSessions}
          testid="admin-dashboard-completed"
        />
        <KpiCard
          label="完成率"
          value={`${completionPct}%`}
          testid="admin-dashboard-completion-rate"
        />
        <KpiCard
          label="平均综合分"
          value={stats.averageComposite}
          testid="admin-dashboard-avg-composite"
        />
      </section>

      <section style={styles.card} data-testid="admin-dashboard-grade-distribution">
        <h2 style={styles.sectionTitle}>Grade 分布</h2>
        <div style={styles.barChart}>
          {V5_GRADE_ORDER.slice()
            .reverse()
            .map((grade) => {
              const count = stats.gradeDistribution[grade];
              const widthPct = (count / maxGradeCount) * 100;
              return (
                <div key={grade} style={styles.barRow} data-testid={`grade-bar-${grade}`}>
                  <div style={styles.barLabel}>{grade}</div>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${widthPct}%`,
                        backgroundColor: GRADE_COLORS[grade],
                      }}
                    />
                  </div>
                  <div style={styles.barValue}>{count}</div>
                </div>
              );
            })}
        </div>
      </section>

      <section style={styles.card} data-testid="admin-dashboard-suite-distribution">
        <h2 style={styles.sectionTitle}>套件分布</h2>
        <div style={styles.barChart}>
          {SUITE_ORDER.map((suiteId) => {
            const count = stats.suiteDistribution[suiteId];
            const widthPct = (count / maxSuiteCount) * 100;
            return (
              <div key={suiteId} style={styles.barRow} data-testid={`suite-bar-${suiteId}`}>
                <div style={styles.suiteLabel}>{SUITES[suiteId].nameZh}</div>
                <div style={styles.barTrack}>
                  <div
                    style={{
                      ...styles.barFill,
                      width: `${widthPct}%`,
                      backgroundColor: colors.blue,
                    }}
                  />
                </div>
                <div style={styles.barValue}>{count}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

const KpiCard: React.FC<{ label: string; value: number | string; testid: string }> = ({
  label,
  value,
  testid,
}) => (
  <div style={styles.kpi} data-testid={testid}>
    <div style={styles.kpiLabel}>{label}</div>
    <div style={styles.kpiValue}>{value}</div>
  </div>
);

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
  },
  title: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    margin: 0,
  },
  loading: {
    padding: spacing.xl,
    color: colors.subtext0,
  },
  error: {
    padding: spacing.xl,
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
    color: colors.red,
    backgroundColor: 'rgba(243,139,168,0.12)',
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: spacing.md,
  },
  kpi: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  kpiLabel: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  kpiValue: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  card: {
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    margin: 0,
  },
  barChart: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  barRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr 48px',
    alignItems: 'center',
    gap: spacing.md,
  },
  barLabel: {
    fontFamily: 'monospace',
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  suiteLabel: {
    fontSize: fontSizes.sm,
    color: colors.text,
  },
  barTrack: {
    height: 12,
    backgroundColor: colors.surface0,
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  barValue: {
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
};
