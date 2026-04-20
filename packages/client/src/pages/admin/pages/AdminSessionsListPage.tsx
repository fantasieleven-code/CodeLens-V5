import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  V5AdminSession,
  V5AdminListSessionsParams,
  V5AdminSessionList,
  SessionStatus,
  SuiteId,
  V5Grade,
} from '@codelens-v5/shared';
import { SUITES, SUITE_IDS } from '@codelens-v5/shared';
import { adminApi } from '../../../services/adminApi.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../../lib/tokens.js';

const STATUSES: readonly SessionStatus[] = [
  'CREATED',
  'SANDBOX_READY',
  'IN_PROGRESS',
  'PAUSED',
  'COMPLETED',
  'EXPIRED',
  'ERROR',
];

const STATUS_LABELS: Record<SessionStatus, string> = {
  CREATED: '已创建',
  SANDBOX_READY: '沙箱就绪',
  IN_PROGRESS: '进行中',
  PAUSED: '暂停',
  COMPLETED: '已完成',
  EXPIRED: '已过期',
  ERROR: '错误',
};

const STATUS_COLORS: Record<SessionStatus, string> = {
  CREATED: colors.overlay1,
  SANDBOX_READY: colors.sapphire,
  IN_PROGRESS: colors.blue,
  PAUSED: colors.yellow,
  COMPLETED: colors.green,
  EXPIRED: colors.subtext0,
  ERROR: colors.red,
};

const GRADE_COLORS: Record<V5Grade, string> = {
  'S+': colors.mauve,
  S: colors.blue,
  A: colors.teal,
  'B+': colors.green,
  B: colors.yellow,
  C: colors.peach,
  D: colors.red,
};

const PAGE_SIZE = 5;

export const AdminSessionsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<V5AdminListSessionsParams>({
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [data, setData] = useState<V5AdminSessionList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listSessions(filters)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const setSuiteFilter = (value: SuiteId | '') => {
    setFilters((f) => ({ ...f, suiteId: value || undefined, page: 1 }));
  };
  const setStatusFilter = (value: SessionStatus | '') => {
    setFilters((f) => ({ ...f, status: value || undefined, page: 1 }));
  };
  const gotoPage = (p: number) => setFilters((f) => ({ ...f, page: p }));
  const openRow = (id: string) => navigate(`/admin/sessions/${id}`);

  return (
    <div data-testid="admin-sessions-list-root" style={styles.container}>
      <h1 style={styles.title}>会话列表</h1>

      <div style={styles.filterBar}>
        <label style={styles.label}>
          套件
          <select
            value={filters.suiteId ?? ''}
            onChange={(e) => setSuiteFilter(e.target.value as SuiteId | '')}
            data-testid="admin-sessions-filter-suite"
            style={styles.select}
          >
            <option value="">全部</option>
            {SUITE_IDS.map((id) => (
              <option key={id} value={id}>
                {SUITES[id].nameZh}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          状态
          <select
            value={filters.status ?? ''}
            onChange={(e) => setStatusFilter(e.target.value as SessionStatus | '')}
            data-testid="admin-sessions-filter-status"
            style={styles.select}
          >
            <option value="">全部</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div style={styles.error}>加载失败:{error}</div>}

      {data && (
        <>
          <div style={styles.tableWrap} data-testid="admin-sessions-table">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>会话 ID</th>
                  <th style={styles.th}>候选人</th>
                  <th style={styles.th}>套件</th>
                  <th style={styles.th}>状态</th>
                  <th style={styles.th}>Grade</th>
                  <th style={styles.th}>综合分</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <SessionRow key={s.id} session={s} onOpen={openRow} />
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={styles.emptyRow} data-testid="admin-sessions-empty">
                      没有会话
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={styles.pager} data-testid="admin-sessions-pager">
            <button
              type="button"
              onClick={() => gotoPage(Math.max(1, data.page - 1))}
              disabled={data.page <= 1}
              data-testid="admin-sessions-prev"
              style={{
                ...styles.pagerBtn,
                ...(data.page <= 1 ? styles.pagerBtnDisabled : {}),
              }}
            >
              上一页
            </button>
            <div style={styles.pageLabel} data-testid="admin-sessions-page-label">
              第 {data.page} / {data.totalPages} 页 · 共 {data.total} 个会话
            </div>
            <button
              type="button"
              onClick={() => gotoPage(Math.min(data.totalPages, data.page + 1))}
              disabled={data.page >= data.totalPages}
              data-testid="admin-sessions-next"
              style={{
                ...styles.pagerBtn,
                ...(data.page >= data.totalPages ? styles.pagerBtnDisabled : {}),
              }}
            >
              下一页
            </button>
          </div>
        </>
      )}
    </div>
  );
};

const SessionRow: React.FC<{
  session: V5AdminSession;
  onOpen: (id: string) => void;
}> = ({ session, onOpen }) => (
  <tr
    data-testid={`admin-sessions-row-${session.id}`}
    style={styles.row}
    onClick={() => onOpen(session.id)}
  >
    <td style={styles.td}>
      <code style={styles.code}>{session.id}</code>
    </td>
    <td style={styles.td}>
      <div>{session.candidate.name}</div>
      <div style={styles.subLabel}>{session.candidate.email}</div>
    </td>
    <td style={styles.td}>{SUITES[session.suiteId].nameZh}</td>
    <td style={styles.td}>
      <span
        style={{
          ...styles.pill,
          borderColor: STATUS_COLORS[session.status],
          color: STATUS_COLORS[session.status],
        }}
      >
        {STATUS_LABELS[session.status]}
      </span>
    </td>
    <td style={styles.td}>
      {session.grade ? (
        <span
          style={{
            ...styles.gradePill,
            backgroundColor: GRADE_COLORS[session.grade],
          }}
        >
          {session.grade}
        </span>
      ) : (
        <span style={styles.subLabel}>—</span>
      )}
    </td>
    <td style={styles.td}>{session.composite ?? <span style={styles.subLabel}>—</span>}</td>
  </tr>
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
  filterBar: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    minWidth: 160,
  },
  select: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.base,
    color: colors.text,
    border: `1px solid ${colors.surface0}`,
    fontFamily: 'inherit',
  },
  tableWrap: {
    overflowX: 'auto',
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
    backgroundColor: colors.mantle,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: spacing.md,
    backgroundColor: colors.surface0,
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    borderBottom: `1px solid ${colors.surface1}`,
  },
  td: {
    padding: spacing.md,
    borderBottom: `1px solid ${colors.surface0}`,
    verticalAlign: 'top',
    fontSize: fontSizes.sm,
  },
  row: {
    cursor: 'pointer',
  },
  code: {
    fontFamily: 'monospace',
    color: colors.subtext1,
  },
  subLabel: {
    color: colors.subtext0,
    fontSize: fontSizes.xs,
  },
  pill: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: radii.full,
    border: '1px solid',
    fontSize: fontSizes.xs,
  },
  gradePill: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: radii.full,
    color: colors.base,
    fontWeight: fontWeights.semibold,
    fontSize: fontSizes.xs,
  },
  error: {
    padding: spacing.md,
    color: colors.red,
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
  },
  emptyRow: {
    padding: spacing.xl,
    textAlign: 'center',
    color: colors.subtext0,
  },
  pager: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  pagerBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: radii.sm,
    backgroundColor: colors.surface0,
    color: colors.text,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: fontSizes.sm,
  },
  pagerBtnDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  pageLabel: {
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
};
