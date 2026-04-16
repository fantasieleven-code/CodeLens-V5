// TODO V5: Update imports (remove V4-specific types)
// TODO V5: Replace V4 store references (useV4ExamStore → useExamStore, useV4ModuleStore → useModuleStore)
// TODO V5: Check "tier" references → should be "suiteId" (V5 uses session.metadata.suiteId)
// TODO V5: Keep unchanged (90%+): Completion UI, animation, thank-you message, feedback form
// Original V4 path: packages/client/src/pages/v4/CompletePage.tsx

/**
 * Terminal page — shown when the candidate finishes the last module.
 *
 * Redesigned from blank thank-you → "completion receipt" with:
 *  - Summary stats (duration, modules done, interview rounds)
 *  - Per-module completion status with MB1 detail (rounds + pass rate)
 *  - Next-steps timeline (report → recruiter review → notification)
 *  - Session ID for traceability
 *
 * No scores, grades, or dimension data — those are recruiter-only.
 */

import React, { useMemo } from 'react';
import { useSessionStore } from '../../stores/session.store.js';
import { useV4ExamStore } from '../../stores/v4-exam.store.js';
import { useV4ModuleStore, type V4ModuleId } from '../../stores/v4-module.store.js';
import { colors, spacing, radii, fontSizes, fontWeights } from '../../lib/tokens.js';

// ─── Module labels (Chinese) ────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; desc: string }> = {
  phase0:     { label: 'Phase 0',     desc: '基线诊断' },
  moduleA:    { label: 'Module A',    desc: '方案选型 + 缺陷审查' },
  mb1:        { label: 'Module B1',   desc: 'AI 指挥' },
  mb2:        { label: 'Module B2',   desc: '约束设计' },
  moduleD:    { label: 'Module D',    desc: '系统设计' },
  selfAssess: { label: '自我评估',     desc: '' },
  moduleC:    { label: 'Module C',    desc: '语音追问' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

function getMB1Detail(sub: Record<string, unknown>): string | null {
  const mb1 = sub.mb1 as Record<string, unknown> | undefined;
  if (!mb1) return null;
  const rounds = mb1.rounds as Array<Record<string, unknown>> | undefined;
  if (!rounds || rounds.length === 0) return null;

  const count = rounds.length;
  // Find last round with test result for pass rate
  let passRate: number | null = null;
  for (let i = rounds.length - 1; i >= 0; i--) {
    const tr = rounds[i].testResult as Record<string, unknown> | undefined;
    if (tr && typeof tr.passRate === 'number') {
      passRate = tr.passRate;
      break;
    }
  }
  const parts = [`${count} 轮`];
  if (passRate !== null) parts.push(`通过率 ${Math.round(passRate * 100)}%`);
  return parts.join('，');
}

function getMCRounds(sub: Record<string, unknown>): number {
  const mc = sub.modulec as Record<string, unknown> | undefined;
  if (!mc) return 0;
  const rounds = mc.rounds as unknown[] | undefined;
  return rounds?.length ?? 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

/** Map module id to all possible submission keys (backend uses lowercase 'modulec'). */
function submissionKeys(m: string): string[] {
  if (m === 'moduleC') return ['modulec', 'moduleC'];
  if (m === 'moduleA') return ['moduleA', 'modulea'];
  return [m];
}

function hasSub(submissions: Record<string, unknown>, m: string): boolean {
  return submissionKeys(m).some((k) => submissions[k] != null);
}

/** Extract all submittedAt timestamps from the submissions tree. */
function collectTimestamps(submissions: Record<string, unknown>): number[] {
  const ts: number[] = [];
  for (const val of Object.values(submissions)) {
    if (val == null || typeof val !== 'object') continue;
    const rec = val as Record<string, unknown>;
    if (typeof rec.submittedAt === 'string' || typeof rec.submittedAt === 'number') {
      const t = new Date(rec.submittedAt as string | number).getTime();
      if (!isNaN(t)) ts.push(t);
    }
    // Check nested rounds (modulec, mb1)
    const rounds = rec.rounds as unknown[] | undefined;
    if (Array.isArray(rounds)) {
      for (const r of rounds) {
        if (r && typeof r === 'object') {
          const rr = r as Record<string, unknown>;
          if (typeof rr.submittedAt === 'string' || typeof rr.submittedAt === 'number') {
            const t = new Date(rr.submittedAt as string | number).getTime();
            if (!isNaN(t)) ts.push(t);
          }
        }
      }
    }
  }
  return ts;
}

export const CompletePage: React.FC = () => {
  const sessionId = useSessionStore((s) => s.sessionId);
  const timer = useSessionStore((s) => s.timer);
  const submissions = useV4ExamStore((s) => s.submissions) as Record<string, unknown>;
  const order = useV4ModuleStore((s) => s.order);

  const stats = useMemo(() => {
    // Duration: prefer submission timestamps, fallback to timer
    const timestamps = collectTimestamps(submissions);
    let minutes: number;
    if (timestamps.length >= 2) {
      const elapsed = Math.max(...timestamps) - Math.min(...timestamps);
      minutes = formatDuration(elapsed);
    } else {
      const elapsedMs = timer?.elapsedMs ?? 0;
      minutes = formatDuration(elapsedMs);
    }

    // Visible modules (exclude 'complete' sentinel)
    const modules = order.filter((m): m is Exclude<V4ModuleId, 'complete'> => m !== 'complete');

    // Count done modules
    const moduleStatuses = modules.map((m) => ({
      id: m,
      done: hasSub(submissions, m),
    }));
    const doneCount = moduleStatuses.filter((m) => m.done).length;

    // MC rounds
    const mcRounds = getMCRounds(submissions);

    // MB1 detail
    const mb1Detail = getMB1Detail(submissions);

    return { minutes, modules, moduleStatuses, doneCount, mcRounds, mb1Detail };
  }, [timer, submissions, order]);

  const shortId = sessionId ? sessionId.slice(0, 8) : '--------';

  return (
    <div style={styles.container}>
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
            const detail = id === 'mb1' && done ? stats.mb1Detail : null;
            return (
              <div key={id} style={styles.moduleRow}>
                <div style={styles.moduleInfo}>
                  <span style={styles.moduleLabel}>
                    {label}
                    {detail && <span style={styles.moduleDetail}> ({detail})</span>}
                  </span>
                </div>
                <span style={done ? styles.badgeDone : styles.badgeSkipped}>
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
              desc="AI 正在分析你的作答，从 8 个维度生成评估报告。大约需要 2 分钟。"
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

// ─── Timeline Item ───────────────────────────────────────────────────────────

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

// ─── Styles (Catppuccin Mocha dark theme) ────────────────────────────────────

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

  // Hero
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

  // Stats
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

  // Card
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

  // Module rows
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

  // Timeline
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

  // Footer
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    textAlign: 'center' as const,
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
