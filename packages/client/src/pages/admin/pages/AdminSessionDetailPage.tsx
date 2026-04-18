import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../../services/adminApi.js';
import type {
  AdminSessionReport,
  AdminSessionSummary,
} from '../../../services/adminApi.types.js';
import { SUITES } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../../lib/tokens.js';

function formatDate(ts: number | null): string {
  if (ts === null || ts === undefined) return '—';
  return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
}

export const AdminSessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<AdminSessionSummary | null>(null);
  const [report, setReport] = useState<AdminSessionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    adminApi
      .getSession(sessionId)
      .then((s) => {
        if (!cancelled) setSession(s);
        if (s.status === 'COMPLETED') {
          return adminApi.getSessionReport(sessionId).then((r) => {
            if (!cancelled) setReport(r);
          });
        }
        return undefined;
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return (
      <div data-testid="admin-session-detail-error" style={styles.error}>
        加载失败:{error}
      </div>
    );
  }

  if (!session) {
    return (
      <div data-testid="admin-session-detail-loading" style={styles.loading}>
        正在加载会话…
      </div>
    );
  }

  const suite = SUITES[session.suiteId];

  return (
    <div data-testid="admin-session-detail-root" style={styles.container}>
      <Link to="/admin/sessions" style={styles.backLink} data-testid="admin-session-detail-back">
        ← 返回列表
      </Link>
      <h1 style={styles.title}>会话详情</h1>

      <section style={styles.card} data-testid="admin-session-detail-candidate">
        <h2 style={styles.sectionTitle}>候选人</h2>
        <div style={styles.row}>
          <div style={styles.label}>姓名</div>
          <div>{session.candidate.name}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>邮箱</div>
          <div>{session.candidate.email}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>候选人 ID</div>
          <code style={styles.code}>{session.candidate.id}</code>
        </div>
      </section>

      <section style={styles.card} data-testid="admin-session-detail-session">
        <h2 style={styles.sectionTitle}>会话信息</h2>
        <div style={styles.row}>
          <div style={styles.label}>会话 ID</div>
          <code style={styles.code}>{session.id}</code>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>套件</div>
          <div>
            {suite.nameZh}({suite.estimatedMinutes} 分钟,cap {suite.gradeCap})
          </div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>题库实例</div>
          <code style={styles.code}>{session.examInstanceId}</code>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>状态</div>
          <div data-testid="admin-session-detail-status">{session.status}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>创建时间</div>
          <div>{formatDate(session.createdAt)}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>开始时间</div>
          <div>{formatDate(session.startedAt)}</div>
        </div>
        <div style={styles.row}>
          <div style={styles.label}>完成时间</div>
          <div>{formatDate(session.completedAt)}</div>
        </div>
        {session.shareableLink && (
          <div style={styles.row}>
            <div style={styles.label}>分享链接</div>
            <code style={styles.code}>{session.shareableLink}</code>
          </div>
        )}
      </section>

      {session.status === 'COMPLETED' && report ? (
        <section style={styles.card} data-testid="admin-session-detail-report">
          <h2 style={styles.sectionTitle}>评估报告</h2>
          <div style={styles.reportSummary}>
            <div>
              <div style={styles.label}>Grade</div>
              <div style={styles.reportGrade}>{report.gradeDecision.grade}</div>
            </div>
            <div>
              <div style={styles.label}>综合分</div>
              <div style={styles.reportComposite}>
                {report.gradeDecision.composite.toFixed(1)}
              </div>
            </div>
            <div>
              <div style={styles.label}>置信度</div>
              <div>{report.gradeDecision.confidence}</div>
            </div>
          </div>
          <p style={styles.reasoning}>{report.gradeDecision.reasoning}</p>
          <Link
            to={`/report/demo-${session.suiteId === 'architect' ? 's-plus' : session.grade === 'B' ? 'b' : 'a'}`}
            data-testid="admin-session-detail-report-link"
            style={styles.primaryBtn}
            state={{ embedAdminContext: true }}
          >
            查看完整报告 →
          </Link>
        </section>
      ) : session.status === 'COMPLETED' ? (
        <div style={styles.loading} data-testid="admin-session-detail-report-loading">
          正在加载报告…
        </div>
      ) : (
        <section style={styles.card} data-testid="admin-session-detail-report-pending">
          <h2 style={styles.sectionTitle}>评估报告</h2>
          <p style={styles.reasoning}>
            会话尚未完成,评估报告将在候选人完成全部模块后生成。
          </p>
        </section>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  backLink: {
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    textDecoration: 'none',
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
    color: colors.red,
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
  },
  card: {
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    margin: 0,
    marginBottom: spacing.xs,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: spacing.md,
    fontSize: fontSizes.sm,
    alignItems: 'center',
  },
  label: {
    color: colors.subtext0,
  },
  code: {
    fontFamily: 'monospace',
    color: colors.subtext1,
  },
  reportSummary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  reportGrade: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.mauve,
  },
  reportComposite: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  reasoning: {
    margin: 0,
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.blue,
    color: colors.base,
    borderRadius: radii.md,
    textDecoration: 'none',
    fontWeight: fontWeights.semibold,
  },
};
