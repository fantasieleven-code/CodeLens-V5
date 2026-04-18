import React, { useEffect, useState } from 'react';
import { adminApi } from '../../../services/adminApi.js';
import type { AdminExamInstance } from '../../../services/adminApi.types.js';
import type { V5Level } from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../../lib/tokens.js';

const LEVEL_OPTIONS: ReadonlyArray<{ id: V5Level | ''; label: string }> = [
  { id: '', label: '全部' },
  { id: 'junior', label: '初级' },
  { id: 'mid', label: '中级' },
  { id: 'senior', label: '高级' },
];

export const AdminExamLibraryPage: React.FC = () => {
  const [exams, setExams] = useState<AdminExamInstance[]>([]);
  const [filterTech, setFilterTech] = useState('');
  const [filterDomain, setFilterDomain] = useState('');
  const [filterLevel, setFilterLevel] = useState<V5Level | ''>('');
  const [selected, setSelected] = useState<AdminExamInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .listExamInstances({
        techStack: filterTech || undefined,
        domain: filterDomain || undefined,
        level: filterLevel || undefined,
      })
      .then((list) => {
        if (!cancelled) {
          setExams(list);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [filterTech, filterDomain, filterLevel]);

  const techStacks = Array.from(new Set(exams.map((e) => e.techStack))).sort();
  const domains = Array.from(new Set(exams.map((e) => e.domain))).sort();

  return (
    <div data-testid="admin-exam-library-root" style={styles.container}>
      <h1 style={styles.title}>题库管理</h1>
      <p style={styles.hint}>V5.0 只读;V5.1 支持编辑与新增。</p>

      <div style={styles.filterBar}>
        <label style={styles.label}>
          技术栈
          <select
            value={filterTech}
            onChange={(e) => setFilterTech(e.target.value)}
            data-testid="admin-exam-filter-tech"
            style={styles.select}
          >
            <option value="">全部</option>
            {techStacks.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          领域
          <select
            value={filterDomain}
            onChange={(e) => setFilterDomain(e.target.value)}
            data-testid="admin-exam-filter-domain"
            style={styles.select}
          >
            <option value="">全部</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.label}>
          级别
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as V5Level | '')}
            data-testid="admin-exam-filter-level"
            style={styles.select}
          >
            {LEVEL_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div style={styles.error}>加载失败:{error}</div>}

      <div style={styles.layout}>
        <div style={styles.listCol}>
          {exams.length === 0 && (
            <div style={styles.empty} data-testid="admin-exam-empty">
              没有匹配的题库实例。
            </div>
          )}
          {exams.map((exam) => (
            <button
              key={exam.id}
              type="button"
              data-testid={`admin-exam-row-${exam.id}`}
              onClick={() => setSelected(exam)}
              style={{
                ...styles.card,
                ...(selected?.id === exam.id ? styles.cardActive : {}),
              }}
            >
              <div style={styles.cardTitle}>{exam.titleZh}</div>
              <div style={styles.cardMeta}>
                {SUITES[exam.suiteId].nameZh} · {exam.techStack} · {exam.domain}
              </div>
              <div style={styles.cardStats}>
                <span>使用 {exam.usedCount} 次</span>
                <span>平均 {exam.avgCompositeScore ?? '—'}</span>
                <span>区分度 {exam.discriminationScore ?? '—'}</span>
              </div>
            </button>
          ))}
        </div>

        <aside style={styles.detailCol} data-testid="admin-exam-detail">
          {selected ? (
            <div style={styles.detailCard}>
              <h2 style={styles.detailTitle}>{selected.titleZh}</h2>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>实例 ID</div>
                <code style={styles.code}>{selected.id}</code>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>套件</div>
                <div>{SUITES[selected.suiteId].nameZh}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>技术栈</div>
                <div>{selected.techStack}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>领域</div>
                <div>{selected.domain}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>挑战模式</div>
                <div>{selected.challengePattern}</div>
              </div>
              {selected.archStyle && (
                <div style={styles.detailRow}>
                  <div style={styles.detailLabel}>架构风格</div>
                  <div>{selected.archStyle}</div>
                </div>
              )}
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>级别</div>
                <div>{selected.level}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>使用次数</div>
                <div>{selected.usedCount}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>平均综合分</div>
                <div>{selected.avgCompositeScore ?? '—'}</div>
              </div>
              <div style={styles.detailRow}>
                <div style={styles.detailLabel}>区分度</div>
                <div>{selected.discriminationScore ?? '—'}</div>
              </div>
            </div>
          ) : (
            <div style={styles.detailPlaceholder}>选择一个题库实例查看详情。</div>
          )}
        </aside>
      </div>
    </div>
  );
};

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
  hint: {
    margin: 0,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  filterBar: {
    display: 'flex',
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    minWidth: 180,
  },
  select: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.base,
    color: colors.text,
    border: `1px solid ${colors.surface0}`,
    fontFamily: 'inherit',
  },
  error: {
    padding: spacing.md,
    color: colors.red,
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
  },
  empty: {
    padding: spacing.xl,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: spacing.lg,
  },
  listCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  detailCol: {
    position: 'sticky',
    top: spacing.xl,
    alignSelf: 'flex-start',
  },
  card: {
    padding: spacing.md,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    textAlign: 'left',
    cursor: 'pointer',
    color: colors.text,
    fontFamily: 'inherit',
  },
  cardActive: {
    borderColor: colors.blue,
  },
  cardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  cardMeta: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
    fontFamily: 'monospace',
  },
  cardStats: {
    display: 'flex',
    gap: spacing.md,
    fontSize: fontSizes.xs,
    color: colors.subtext1,
  },
  detailCard: {
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  detailTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    margin: 0,
    marginBottom: spacing.xs,
  },
  detailRow: {
    display: 'grid',
    gridTemplateColumns: '120px 1fr',
    gap: spacing.md,
    fontSize: fontSizes.sm,
  },
  detailLabel: {
    color: colors.subtext0,
  },
  code: {
    fontFamily: 'monospace',
    color: colors.subtext1,
  },
  detailPlaceholder: {
    padding: spacing.xl,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
    border: `1px dashed ${colors.surface0}`,
    borderRadius: radii.md,
    textAlign: 'center',
  },
};
