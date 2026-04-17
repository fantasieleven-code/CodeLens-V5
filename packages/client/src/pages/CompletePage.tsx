/**
 * Terminal page — shown when the candidate finishes the last module.
 *
 * Shows a "completion receipt" with:
 *  - Summary stats (duration, modules done, MC probe rounds)
 *  - Per-module completion status with MB detail (pass rate)
 *  - Next-steps timeline (report → recruiter review → notification)
 *  - Session ID for traceability
 *
 * No scores, grades, or dimension data — those are recruiter-only.
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { V5ModuleKey, V5Submissions, V5MBSubmission } from '@codelens-v5/shared';
import { useSessionStore } from '../stores/session.store.js';
import { useModuleStore } from '../stores/module.store.js';
import { colors, spacing, radii, fontSizes, fontWeights } from '../lib/tokens.js';

const MODULE_META: Record<V5ModuleKey, { label: string; desc: string }> = {
  phase0:     { label: 'Phase 0',     desc: '基线诊断' },
  moduleA:    { label: 'Module A',    desc: '方案选型 + 缺陷审查' },
  mb:         { label: 'Module B',    desc: 'Cursor 协作' },
  moduleD:    { label: 'Module D',    desc: '系统设计' },
  selfAssess: { label: '自我评估',     desc: '' },
  moduleC:    { label: 'Module C',    desc: '语音追问' },
};

function formatDuration(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

function getMBDetail(mb: V5MBSubmission | undefined): string | null {
  if (!mb) return null;
  return `通过率 ${Math.round(mb.finalTestPassRate * 100)}%`;
}

function hasSub(submissions: V5Submissions, m: V5ModuleKey): boolean {
  return submissions[m] != null;
}

export const CompletePage: React.FC = () => {
  const sessionId = useSessionStore((s) => s.sessionId);
  const timer = useSessionStore((s) => s.timer);
  const submissions = useSessionStore((s) => s.submissions);
  const moduleOrder = useModuleStore((s) => s.moduleOrder);
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const elapsedMs = timer?.elapsedMs ?? 0;
    const minutes = formatDuration(elapsedMs);

    const moduleStatuses = moduleOrder.map((m) => ({
      id: m,
      done: hasSub(submissions, m),
    }));
    const doneCount = moduleStatuses.filter((m) => m.done).length;

    const mcRounds = submissions.moduleC?.length ?? 0;
    const mbDetail = getMBDetail(submissions.mb);

    return { minutes, moduleStatuses, doneCount, mcRounds, mbDetail };
  }, [timer, submissions, moduleOrder]);

  const shortId = sessionId ? sessionId.slice(0, 8) : '--------';

  return (
    <div style={styles.container} data-testid="complete-root">
      <div style={styles.content}>
        {/* ── Hero ── */}
        <div style={styles.heroSection}>
          <div style={styles.checkCircle}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={colors.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={styles.title}>评估已完成</h1>
          <p style={styles.subtitle}>
            你的评估已提交。以下是你本次完成的内容和后续流程。
          </p>
        </div>

        {/* ── Stats Row ── */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{stats.minutes}</span>
            <span style={styles.statLabel}>分钟用时</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{stats.doneCount}</span>
            <span style={styles.statLabel}>完成模块</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{stats.mcRounds}</span>
            <span style={styles.statLabel}>追问轮次</span>
          </div>
        </div>

        {/* ── Module List ── */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>完成模块</h2>
          {stats.moduleStatuses.map(({ id, done }) => {
            const meta = MODULE_META[id];
            if (!meta) return null;
            const label = meta.desc ? `${meta.label} — ${meta.desc}` : meta.label;
            const detail = id === 'mb' && done ? stats.mbDetail : null;
            return (
              <div key={id} style={styles.moduleRow} data-testid={`complete-module-${id}`}>
                <div style={styles.moduleInfo}>
                  <span style={styles.moduleLabel}>
                    {label}
                    {detail && <span style={styles.moduleDetail}> ({detail})</span>}
                  </span>
                </div>
                <span
                  style={done ? styles.badgeDone : styles.badgeSkipped}
                  data-testid={`complete-module-${id}-badge`}
                >
                  {done ? '已完成' : '未参加'}
                </span>
              </div>
            );
          })}
        </div>

        {/* ── Next Steps Timeline ── */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>后续流程</h2>
          <div style={styles.timeline}>
            <TimelineItem
              color={colors.green}
              title="报告生成"
              desc="AI 正在分析你的作答，从 6 个维度生成评估报告。大约需要 2 分钟。"
              isFirst
            />
            <TimelineItem
              color={colors.mauve}
              title="招聘方审核"
              desc="招聘团队将在 3 个工作日内审核你的评估报告。"
            />
            <TimelineItem
              color={colors.overlay1}
              title="结果通知"
              desc="无论结果如何，招聘方都会与你联系。"
              isLast
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={styles.footer}>
          {sessionId && (
            <button
              type="button"
              data-testid="complete-view-report-btn"
              onClick={() => navigate(`/report/${sessionId}`)}
              style={styles.reportBtn}
            >
              查看报告
            </button>
          )}
          <span style={styles.sessionId}>Session {shortId}</span>
          <p style={styles.footerText}>
            所有数据已安全存储，仅向招聘团队展示。
          </p>
          <p style={styles.footerText}>
            如有疑问，请直接联系你的招聘联系人。
          </p>
        </div>
      </div>
    </div>
  );
};

const TimelineItem: React.FC<{
  color: string;
  title: string;
  desc: string;
  isFirst?: boolean;
  isLast?: boolean;
}> = ({ color, title, desc, isFirst, isLast }) => (
  <div style={styles.timelineItem}>
    <div style={styles.timelineTrack}>
      {!isFirst && <div style={{ ...styles.timelineLine, backgroundColor: color === colors.overlay1 ? colors.surface1 : color }} />}
      <div style={{ ...styles.timelineDot, backgroundColor: color, boxShadow: `0 0 0 4px ${color}22` }} />
      {!isLast && <div style={{ ...styles.timelineLine, backgroundColor: colors.surface1 }} />}
    </div>
    <div style={styles.timelineContent}>
      <span style={styles.timelineTitle}>{title}</span>
      <span style={styles.timelineDesc}>{desc}</span>
    </div>
  </div>
);

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
    gap: 24,
    maxWidth: 560,
    width: '100%',
    paddingTop: 40,
    paddingBottom: 48,
  },

  heroSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center' as const,
    gap: 12,
    marginBottom: 8,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    backgroundColor: `${colors.green}18`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: '24px',
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  subtitle: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
    maxWidth: 400,
  },

  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: `${spacing.lg} ${spacing.md}`,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
  },
  statNumber: {
    fontSize: '22px',
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },

  card: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: `${spacing.xl} ${spacing.xl}`,
  },
  cardTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: `0 0 ${spacing.lg}`,
  },

  moduleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `10px 0`,
    borderBottom: `1px solid ${colors.surface0}`,
  },
  moduleInfo: {
    flex: 1,
    minWidth: 0,
  },
  moduleLabel: {
    fontSize: fontSizes.md,
    color: colors.subtext1,
  },
  moduleDetail: {
    fontSize: fontSizes.sm,
    color: colors.overlay2,
  },
  badgeDone: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.green,
    backgroundColor: `${colors.green}18`,
    padding: '3px 10px',
    borderRadius: radii.sm,
    flexShrink: 0,
    marginLeft: 12,
  },
  badgeSkipped: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    color: colors.overlay1,
    backgroundColor: colors.surface0,
    padding: '3px 10px',
    borderRadius: radii.sm,
    flexShrink: 0,
    marginLeft: 12,
  },

  timeline: {
    display: 'flex',
    flexDirection: 'column',
  },
  timelineItem: {
    display: 'flex',
    gap: 14,
    minHeight: 60,
  },
  timelineTrack: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: 12,
    flexShrink: 0,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 8,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
  },
  timelineContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    paddingBottom: 16,
  },
  timelineTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  timelineDesc: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.5,
  },

  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    textAlign: 'center' as const,
  },
  reportBtn: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: spacing.md,
  },
  sessionId: {
    fontSize: fontSizes.sm,
    color: colors.overlay1,
    fontFamily: 'monospace',
  },
  footerText: {
    fontSize: fontSizes.xs,
    color: colors.overlay0,
    margin: 0,
    lineHeight: 1.5,
  },
};
