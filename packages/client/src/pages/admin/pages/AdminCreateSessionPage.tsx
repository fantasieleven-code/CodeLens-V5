import React, { useEffect, useMemo, useState } from 'react';
import type {
  AdminExamInstance,
  AdminPosition,
  CreateWizardDraft,
  SuiteRecommendation,
} from '../../../services/adminApi.types.js';
import type { SuiteId, V5Level } from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { adminApi } from '../../../services/adminApi.js';
import { ADMIN_POSITIONS } from '../mock/admin-positions-fixtures.js';
import { recommendSuite } from '../mock/suite-recommendations.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../../lib/tokens.js';

const LEVELS: ReadonlyArray<{ id: V5Level; zh: string; en: string }> = [
  { id: 'junior', zh: '初级', en: 'Junior' },
  { id: 'mid', zh: '中级', en: 'Mid-level' },
  { id: 'senior', zh: '高级', en: 'Senior' },
];

type WizardStep = 1 | 2 | 3 | 4;

const EMPTY_DRAFT: CreateWizardDraft = {
  position: null,
  level: null,
  suiteId: null,
  examInstanceId: null,
  candidateName: '',
  candidateEmail: '',
};

export const AdminCreateSessionPage: React.FC = () => {
  const [step, setStep] = useState<WizardStep>(1);
  const [draft, setDraft] = useState<CreateWizardDraft>(EMPTY_DRAFT);
  const [exams, setExams] = useState<AdminExamInstance[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shareableLink, setShareableLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const recommendation = useMemo<SuiteRecommendation | null>(() => {
    if (!draft.position || !draft.level) return null;
    return recommendSuite(draft.position, draft.level);
  }, [draft.position, draft.level]);

  useEffect(() => {
    if (step !== 3 || !draft.level) return;
    let cancelled = false;
    adminApi
      .listExamInstances({ level: draft.level })
      .then((list) => {
        if (cancelled) return;
        setExams(list);
        // Pre-select the first exam that matches the recommended suite.
        const match = list.find((e) => e.suiteId === recommendation?.primary);
        setDraft((d) => ({
          ...d,
          suiteId: d.suiteId ?? recommendation?.primary ?? null,
          examInstanceId: d.examInstanceId ?? match?.id ?? list[0]?.id ?? null,
        }));
      })
      .catch((err) => {
        if (!cancelled) setSubmitError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [step, draft.level, recommendation?.primary]);

  const pickPosition = (position: AdminPosition) => {
    setDraft((d) => ({ ...d, position, suiteId: null, examInstanceId: null }));
    setStep(2);
  };
  const pickLevel = (level: V5Level) => {
    setDraft((d) => ({ ...d, level, suiteId: null, examInstanceId: null }));
    setStep(3);
  };
  const pickSuite = (suiteId: SuiteId) => {
    setDraft((d) => ({ ...d, suiteId, examInstanceId: null }));
  };
  const pickExam = (examInstanceId: string) => {
    setDraft((d) => ({ ...d, examInstanceId }));
  };

  const canSubmit =
    draft.suiteId &&
    draft.examInstanceId &&
    draft.candidateName.trim() &&
    draft.candidateEmail.trim();

  const submit = async () => {
    if (!canSubmit || !draft.suiteId || !draft.examInstanceId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await adminApi.createSession({
        suiteId: draft.suiteId,
        examInstanceId: draft.examInstanceId,
        candidate: {
          name: draft.candidateName.trim(),
          email: draft.candidateEmail.trim(),
        },
      });
      setShareableLink(res.shareableLink);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!shareableLink) return;
    try {
      await navigator.clipboard.writeText(shareableLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (jsdom). Users see the link in the input field.
    }
  };

  const reset = () => {
    setStep(1);
    setDraft(EMPTY_DRAFT);
    setShareableLink(null);
    setSubmitError(null);
  };

  return (
    <div data-testid="admin-create-root" style={styles.container}>
      <h1 style={styles.title}>创建评估</h1>
      <StepBar current={step} />

      {step === 1 && (
        <section data-testid="admin-create-step-1" style={styles.section}>
          <h2 style={styles.sectionTitle}>步骤 1:选择岗位类型</h2>
          <div style={styles.grid}>
            {ADMIN_POSITIONS.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                data-testid={`admin-create-step1-position-${idx}`}
                onClick={() => pickPosition(p)}
                style={{
                  ...styles.card,
                  ...(draft.position?.id === p.id ? styles.cardActive : {}),
                }}
              >
                <div style={styles.cardTitle}>{p.titleZh}</div>
                <div style={styles.cardMeta}>
                  {p.techStack} · {p.domain} · {p.challengePattern}
                </div>
                <div style={styles.cardBody}>{p.summary}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 2 && draft.position && (
        <section data-testid="admin-create-step-2" style={styles.section}>
          <h2 style={styles.sectionTitle}>步骤 2:候选人级别</h2>
          <p style={styles.sectionHint}>
            已选岗位:<strong>{draft.position.titleZh}</strong>
          </p>
          <div style={styles.levelRow}>
            {LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                data-testid={`admin-create-step2-level-${l.id}`}
                onClick={() => pickLevel(l.id)}
                style={{
                  ...styles.levelBtn,
                  ...(draft.level === l.id ? styles.levelBtnActive : {}),
                }}
              >
                <div style={styles.levelZh}>{l.zh}</div>
                <div style={styles.levelEn}>{l.en}</div>
              </button>
            ))}
          </div>
          <div style={styles.backRow}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={styles.secondaryBtn}
              data-testid="admin-create-step2-back"
            >
              上一步
            </button>
          </div>
        </section>
      )}

      {step === 3 && draft.position && draft.level && recommendation && (
        <section data-testid="admin-create-step-3" style={styles.section}>
          <h2 style={styles.sectionTitle}>步骤 3:推荐套件 + 候选人信息</h2>
          <div
            style={styles.reasoning}
            data-testid="admin-create-step3-reasoning"
          >
            {recommendation.reasoning}
          </div>

          <h3 style={styles.subTitle}>套件选择</h3>
          <div style={styles.suiteList}>
            <SuiteCard
              suiteId={recommendation.primary}
              highlight
              selected={draft.suiteId === recommendation.primary}
              onSelect={pickSuite}
            />
            {recommendation.alternates.map((s) => (
              <SuiteCard
                key={s}
                suiteId={s}
                selected={draft.suiteId === s}
                onSelect={pickSuite}
              />
            ))}
          </div>

          <h3 style={styles.subTitle}>题库实例</h3>
          <div style={styles.examList}>
            {exams.length === 0 && (
              <div style={styles.empty} data-testid="admin-create-step3-exam-empty">
                没有匹配此级别的题库实例。
              </div>
            )}
            {exams.map((e) => (
              <button
                key={e.id}
                type="button"
                data-testid={`admin-create-step3-exam-${e.id}`}
                onClick={() => pickExam(e.id)}
                style={{
                  ...styles.examCard,
                  ...(draft.examInstanceId === e.id ? styles.examCardActive : {}),
                }}
              >
                <div style={styles.examCardTitle}>{e.titleZh}</div>
                <div style={styles.examCardMeta}>
                  {SUITES[e.suiteId].nameZh} · 使用 {e.usedCount} 次 · 平均{' '}
                  {e.avgCompositeScore ?? '—'}
                </div>
              </button>
            ))}
          </div>

          <h3 style={styles.subTitle}>候选人信息</h3>
          <div style={styles.candidateForm}>
            <label style={styles.label}>
              姓名
              <input
                type="text"
                value={draft.candidateName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, candidateName: e.target.value }))
                }
                data-testid="admin-create-step3-candidate-name"
                style={styles.input}
              />
            </label>
            <label style={styles.label}>
              邮箱
              <input
                type="email"
                value={draft.candidateEmail}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, candidateEmail: e.target.value }))
                }
                data-testid="admin-create-step3-candidate-email"
                style={styles.input}
              />
            </label>
          </div>

          {submitError && (
            <div style={styles.error} data-testid="admin-create-submit-error">
              创建失败:{submitError}
            </div>
          )}

          <div style={styles.submitRow}>
            <button
              type="button"
              onClick={() => setStep(2)}
              style={styles.secondaryBtn}
              data-testid="admin-create-step3-back"
            >
              上一步
            </button>
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={submit}
              data-testid="admin-create-submit"
              style={{
                ...styles.primaryBtn,
                ...(!canSubmit || submitting ? styles.primaryBtnDisabled : {}),
              }}
            >
              {submitting ? '创建中…' : '生成评估链接'}
            </button>
          </div>
        </section>
      )}

      {step === 4 && shareableLink && (
        <section data-testid="admin-create-success" style={styles.successCard}>
          <h2 style={styles.successTitle}>评估链接已生成</h2>
          <p style={styles.successBody}>
            请将以下链接发送给候选人。链接唯一且与当前会话绑定。
          </p>
          <div style={styles.linkRow}>
            <input
              readOnly
              value={shareableLink}
              style={styles.linkInput}
              data-testid="admin-create-shareable-link"
            />
            <button
              type="button"
              onClick={copyLink}
              style={styles.primaryBtn}
              data-testid="admin-create-copy-link"
            >
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            style={styles.secondaryBtn}
            data-testid="admin-create-reset"
          >
            再创建一份
          </button>
        </section>
      )}
    </div>
  );
};

const StepBar: React.FC<{ current: WizardStep }> = ({ current }) => (
  <div style={styles.stepBar} data-testid="admin-create-step-bar">
    {[1, 2, 3].map((n) => (
      <div
        key={n}
        style={{
          ...styles.stepPill,
          ...(n === current ? styles.stepPillActive : {}),
          ...(n < current ? styles.stepPillDone : {}),
        }}
      >
        {n}
      </div>
    ))}
  </div>
);

const SuiteCard: React.FC<{
  suiteId: SuiteId;
  highlight?: boolean;
  selected: boolean;
  onSelect: (id: SuiteId) => void;
}> = ({ suiteId, highlight, selected, onSelect }) => {
  const suite = SUITES[suiteId];
  return (
    <button
      type="button"
      onClick={() => onSelect(suiteId)}
      data-testid={`admin-create-step3-suite-${suiteId}`}
      style={{
        ...styles.suiteCard,
        ...(selected ? styles.suiteCardSelected : {}),
        ...(highlight ? styles.suiteCardHighlight : {}),
      }}
    >
      <div style={styles.suiteHeader}>
        <div style={styles.suiteName}>{suite.nameZh}</div>
        {highlight && <div style={styles.suiteBadge}>推荐</div>}
      </div>
      <div style={styles.suiteMeta}>
        {suite.estimatedMinutes} 分钟 · cap {suite.gradeCap}
      </div>
    </button>
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
  stepBar: {
    display: 'flex',
    gap: spacing.sm,
  },
  stepPill: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface0,
    color: colors.subtext0,
    fontWeight: fontWeights.semibold,
  },
  stepPillActive: {
    backgroundColor: colors.blue,
    color: colors.base,
  },
  stepPillDone: {
    backgroundColor: colors.green,
    color: colors.base,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    margin: 0,
  },
  sectionHint: {
    margin: 0,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: spacing.md,
  },
  card: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
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
    color: colors.overlay1,
    fontFamily: 'monospace',
  },
  cardBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.5,
  },
  levelRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: spacing.md,
  },
  levelBtn: {
    padding: spacing.lg,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    color: colors.text,
    fontFamily: 'inherit',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    alignItems: 'center',
  },
  levelBtnActive: {
    borderColor: colors.blue,
    backgroundColor: colors.surface0,
  },
  levelZh: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
  },
  levelEn: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  backRow: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  reasoning: {
    padding: spacing.md,
    backgroundColor: colors.surface0,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
  },
  subTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    margin: 0,
    color: colors.subtext1,
  },
  suiteList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: spacing.sm,
  },
  suiteCard: {
    padding: spacing.md,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    color: colors.text,
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  suiteCardHighlight: {
    borderColor: colors.mauve,
  },
  suiteCardSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.surface0,
  },
  suiteHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suiteName: {
    fontWeight: fontWeights.semibold,
  },
  suiteBadge: {
    fontSize: fontSizes.xs,
    padding: '2px 8px',
    backgroundColor: colors.mauve,
    color: colors.base,
    borderRadius: radii.sm,
  },
  suiteMeta: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  examList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  examCard: {
    padding: spacing.md,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    color: colors.text,
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  examCardActive: {
    borderColor: colors.blue,
    backgroundColor: colors.surface0,
  },
  examCardTitle: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
  },
  examCardMeta: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  empty: {
    padding: spacing.md,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  candidateForm: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: spacing.md,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    fontSize: fontSizes.sm,
    color: colors.subtext1,
  },
  input: {
    padding: spacing.sm,
    borderRadius: radii.sm,
    border: `1px solid ${colors.surface0}`,
    backgroundColor: colors.base,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
  },
  submitRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  primaryBtn: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    color: colors.base,
    border: 'none',
    borderRadius: radii.md,
    cursor: 'pointer',
    fontWeight: fontWeights.semibold,
    fontFamily: 'inherit',
  },
  primaryBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  secondaryBtn: {
    padding: `${spacing.sm} ${spacing.lg}`,
    backgroundColor: colors.surface0,
    color: colors.text,
    border: 'none',
    borderRadius: radii.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    padding: spacing.md,
    border: `1px solid ${colors.red}`,
    borderRadius: radii.md,
    color: colors.red,
    backgroundColor: 'rgba(243,139,168,0.12)',
    fontSize: fontSizes.sm,
  },
  successCard: {
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.green}`,
    borderRadius: radii.md,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  successTitle: {
    margin: 0,
    fontSize: fontSizes.xl,
    color: colors.green,
  },
  successBody: {
    margin: 0,
    color: colors.subtext0,
    fontSize: fontSizes.sm,
  },
  linkRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
  },
  linkInput: {
    flex: 1,
    padding: spacing.sm,
    fontFamily: 'monospace',
    fontSize: fontSizes.sm,
    backgroundColor: colors.base,
    color: colors.text,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.sm,
  },
};
