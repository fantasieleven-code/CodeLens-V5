/**
 * Phase0Page — Task 4.
 *
 * Canonical layout per:
 *   - frontend-agent-tasks.md Task 4 (L340-405)
 *   - v5-design-clarifications.md Part 3 adjustment 1 (L61-209) — the
 *     AI-claim-verification block appended at the end.
 *
 * Flow (progressive reveal):
 *   systemCode (Monaco read-only)
 *     → L1 (single-choice) — required to reveal L2
 *     → L2 (textarea)      — required to reveal L3
 *     → L3 (textarea)      — required to reveal the rest
 *     → AI output judgment 1
 *     → AI output judgment 2
 *     → decision
 *     → AI claim verification (free-text, for sAiClaimDetection)
 *     → submit
 *
 * Submission:
 *   Conforms to V5Phase0Submission. The AI-claim response lands in the
 *   top-level `aiClaimVerification` field (Round 2 Part 3 adjustment 1
 *   L191-210; shared type added in Task 13a).
 */

import React, { useCallback, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { V5Phase0Submission } from '@codelens-v5/shared';
import { getSocket } from '../lib/socket.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { useModuleContent } from '../hooks/useModuleContent.js';
import { P0_MOCK_FIXTURE, type P0MockModule } from './phase0/mock.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

type JudgmentChoice = 'A' | 'B' | 'both_good' | 'both_bad';

interface JudgmentState {
  choice: JudgmentChoice | null;
  reason: string;
}

interface DecisionState {
  choice: string | null;
  reason: string;
}

interface AiClaimState {
  response: string;
}

export interface Phase0PageProps {
  /** Module content. Defaults to the Task 4 mock fixture. Preview route passes this explicitly. */
  module?: P0MockModule;
  /**
   * Test hook: called after a successful submit, before advance(). Allows
   * <Phase0Page /> tests to assert on the constructed submission without
   * stubbing the session store.
   */
  onSubmit?: (submission: V5Phase0Submission) => void;
  /**
   * Test/preview hook: if true, skip the ModuleShell wrapper (no store
   * requirements for pause UI etc.). Preview route sets this.
   */
  bare?: boolean;
}

export const Phase0Page: React.FC<Phase0PageProps> = ({
  module: moduleProp,
  onSubmit,
  bare = false,
}) => {
  const advance = useModuleStore((s) => s.advance);
  const setSubmission = useSessionStore((s) => s.setModuleSubmissionLocal);
  const sessionId = useSessionStore((s) => s.sessionId);
  const examInstanceId = useSessionStore((s) => s.examInstanceId);
  const fetchState = useModuleContent(moduleProp || !examInstanceId ? null : examInstanceId, 'p0');
  const moduleContent =
    moduleProp ??
    (fetchState.status === 'loaded' ? fetchState.data : !examInstanceId ? P0_MOCK_FIXTURE : null);

  const [l1Answer, setL1Answer] = useState<number | null>(null);
  const [l2Answer, setL2Answer] = useState('');
  const [l3Answer, setL3Answer] = useState('');
  // Brief #20 C4 · 0..100 slider, normalized to 0..1 in submission. 50 = midpoint
  // matches the prior hardcoded 0.5 default for backward compat with fixtures
  // that don't move the slider.
  const [confidencePct, setConfidencePct] = useState<number>(50);
  const [judgments, setJudgments] = useState<[JudgmentState, JudgmentState]>([
    { choice: null, reason: '' },
    { choice: null, reason: '' },
  ]);
  const [decision, setDecision] = useState<DecisionState>({ choice: null, reason: '' });
  const [aiClaim, setAiClaim] = useState<AiClaimState>({ response: '' });

  const l1Done = l1Answer !== null;
  const l2Done = l2Done_(l2Answer);
  const l3Done = l3Done_(l3Answer);
  const j1Done = judgmentDone_(judgments[0]);
  const j2Done = judgmentDone_(judgments[1]);
  const decisionDone = decisionDone_(decision);
  const aiClaimDone = aiClaim.response.trim().length > 0;

  const canSubmit = l1Done && l2Done && l3Done && j1Done && j2Done && decisionDone && aiClaimDone;

  const updateJudgment = useCallback((idx: 0 | 1, patch: Partial<JudgmentState>) => {
    setJudgments((prev) => {
      const next = [...prev] as [JudgmentState, JudgmentState];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || l1Answer === null || !decision.choice) return;

    if (!moduleContent) return;
    const l1Text = moduleContent.codeReadingQuestions.l1.options[l1Answer] ?? '';

    const submission: V5Phase0Submission = {
      codeReading: {
        l1Answer: l1Text,
        l2Answer,
        l3Answer,
        // Brief #20 C4 · slider provides 0..100; clamp + normalize to 0..1.
        confidence: Math.max(0, Math.min(1, confidencePct / 100)),
      },
      aiOutputJudgment: judgments.map((j) => ({
        choice: j.choice as JudgmentChoice,
        reasoning: j.reason,
      })),
      aiClaimVerification: {
        response: aiClaim.response,
        submittedAt: Date.now(),
      },
      decision: {
        choice: decision.choice,
        reasoning: decision.reason,
      },
    };

    setSubmission('phase0', submission);
    // Brief #19 σ HTTP fallback · Brief #18 D38 σ pattern. Belt-and-
    // suspenders: direct `/interview` socket emit plus HTTP retry surface.
    // Both fire-and-forget · advance() never blocks on either.
    getSocket().emit(
      'phase0:submit',
      { sessionId: sessionId ?? 'phase0-pending', submission },
      (_ok: boolean) => {},
    );
    if (sessionId) {
      void fetch(`/api/v5/exam/${sessionId}/phase0/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission }),
      }).catch(() => {});
    }
    onSubmit?.(submission);
    advance();
  }, [
    canSubmit,
    l1Answer,
    l2Answer,
    l3Answer,
    confidencePct,
    judgments,
    decision,
    aiClaim,
    moduleContent,
    setSubmission,
    sessionId,
    onSubmit,
    advance,
  ]);

  if (!moduleContent) {
    const inner =
      fetchState.status === 'error' ? (
        <div style={styles.container} data-testid="phase0-content-error">
          <p style={styles.bodyText}>{fetchState.message}</p>
        </div>
      ) : (
        <div style={styles.container} data-testid="phase0-content-loading">
          <p style={styles.bodyText}>正在加载 Phase 0 内容…</p>
        </div>
      );
    return bare ? inner : <ModuleShell>{inner}</ModuleShell>;
  }

  const body = (
    <div style={styles.container} data-testid="phase0-container">
      <TaskHeader />

      <SystemCodeSection code={moduleContent.systemCode} />

      <L1Section
        question={moduleContent.codeReadingQuestions.l1.question}
        options={moduleContent.codeReadingQuestions.l1.options}
        value={l1Answer}
        onChange={setL1Answer}
      />

      {l1Done && (
        <L2Section
          question={moduleContent.codeReadingQuestions.l2.question}
          value={l2Answer}
          onChange={setL2Answer}
        />
      )}

      {l2Done && (
        <L3Section
          question={moduleContent.codeReadingQuestions.l3.question}
          value={l3Answer}
          onChange={setL3Answer}
        />
      )}

      {l3Done && <ConfidenceSection value={confidencePct} onChange={setConfidencePct} />}

      {l3Done && (
        <>
          <AiJudgmentSection
            idx={1}
            context={moduleContent.aiOutputJudgment[0].context}
            codeA={moduleContent.aiOutputJudgment[0].codeA}
            codeB={moduleContent.aiOutputJudgment[0].codeB}
            value={judgments[0]}
            onChange={(patch) => updateJudgment(0, patch)}
          />

          <AiJudgmentSection
            idx={2}
            context={moduleContent.aiOutputJudgment[1].context}
            codeA={moduleContent.aiOutputJudgment[1].codeA}
            codeB={moduleContent.aiOutputJudgment[1].codeB}
            value={judgments[1]}
            onChange={(patch) => updateJudgment(1, patch)}
          />

          <DecisionSection
            scenario={moduleContent.decision.scenario}
            options={moduleContent.decision.options}
            value={decision}
            onChange={setDecision}
          />

          <AiClaimSection
            code={moduleContent.aiClaimDetection.code}
            explanation={moduleContent.aiClaimDetection.aiExplanation}
            value={aiClaim}
            onChange={setAiClaim}
          />
        </>
      )}

      <div style={styles.submitRow}>
        <button
          type="button"
          data-testid="phase0-submit"
          style={{
            ...styles.submitBtn,
            ...(canSubmit ? {} : styles.submitBtnDisabled),
          }}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          提交 Phase 0
        </button>
      </div>
    </div>
  );

  if (bare) {
    return body;
  }

  return <ModuleShell>{body}</ModuleShell>;
};

// ────────────────────────── predicates ──────────────────────────

const L2_MIN_CHARS = 40;
const L3_MIN_CHARS = 60;
const REASON_MIN_CHARS = 20;

function l2Done_(v: string): boolean {
  return v.trim().length >= L2_MIN_CHARS;
}

function l3Done_(v: string): boolean {
  return v.trim().length >= L3_MIN_CHARS;
}

function judgmentDone_(j: JudgmentState): boolean {
  return j.choice !== null && j.reason.trim().length >= REASON_MIN_CHARS;
}

function decisionDone_(d: DecisionState): boolean {
  return d.choice !== null && d.reason.trim().length >= REASON_MIN_CHARS;
}

// ────────────────────────── sections ──────────────────────────

const TaskHeader: React.FC = () => (
  <section style={styles.taskCard}>
    <span style={styles.modulePill}>Phase 0 · 基线诊断</span>
    <h1 style={styles.taskTitle}>阅读以下代码并回答问题</h1>
    <p style={styles.taskBody}>
      三层递进的代码理解(L1 → L2 → L3) + 2 题 AI 输出判断 + 1 题决策场景 + 1 题 AI
      声明验证。依次展开,必填后显示下一题。
    </p>
  </section>
);

const SystemCodeSection: React.FC<{ code: string }> = ({ code }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>SystemCode</h2>
    <p style={styles.sectionSubtitle}>阅读下列代码,理解职责与关键设计再回答。</p>
    <div style={styles.editorWrap} data-testid="phase0-code-display">
      <Editor
        value={code}
        language="typescript"
        theme="vs-dark"
        height={480}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'none',
          wordWrap: 'on',
        }}
      />
    </div>
  </section>
);

const L1Section: React.FC<{
  question: string;
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
}> = ({ question, options, value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>L1 · 表面理解</h2>
    <p style={styles.sectionSubtitle} data-testid="phase0-l1-question">
      {question}
    </p>
    <ul style={styles.radioList} data-testid="phase0-l1-answer">
      {options.map((opt, i) => (
        <li key={i} style={styles.radioItem}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="phase0-l1"
              data-testid={`phase0-l1-option-${i}`}
              checked={value === i}
              onChange={() => onChange(i)}
              style={styles.radioInput}
            />
            <span style={styles.radioText}>{opt}</span>
          </label>
        </li>
      ))}
    </ul>
  </section>
);

const L2Section: React.FC<{
  question: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ question, value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>L2 · 关键设计决策</h2>
    <p style={styles.sectionSubtitle}>{question}</p>
    <textarea
      data-testid="phase0-l2-answer"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="100-300 字,指出具体位置 / 函数名 / 权衡点……"
      rows={5}
      style={styles.textarea}
    />
    <CharCountHint value={value} min={L2_MIN_CHARS} />
  </section>
);

const L3Section: React.FC<{
  question: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ question, value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>L3 · 隐含约束 / 扩展性</h2>
    <p style={styles.sectionSubtitle}>{question}</p>
    <textarea
      data-testid="phase0-l3-answer"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="200-500 字,至少说出 2 个具体位置和原因……"
      rows={8}
      style={styles.textarea}
    />
    <CharCountHint value={value} min={L3_MIN_CHARS} />
  </section>
);

const ConfidenceSection: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>代码理解信心 · 0–100</h2>
    <p style={styles.sectionSubtitle}>对上述 L1-L3 回答的整体把握度。</p>
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={value}
      onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      data-testid="phase0-l3-confidence"
      style={{ width: '100%' }}
    />
    <div style={{ marginTop: spacing.xs, color: colors.subtext0, fontSize: fontSizes.xs }}>
      {value}
    </div>
  </section>
);

const AiJudgmentSection: React.FC<{
  idx: 1 | 2;
  context: string;
  codeA: string;
  codeB: string;
  value: JudgmentState;
  onChange: (patch: Partial<JudgmentState>) => void;
}> = ({ idx, context, codeA, codeB, value, onChange }) => {
  const choiceTestId = `phase0-ai-judgment-${idx}-choice`;
  const reasonTestId = `phase0-ai-judgment-${idx}-reason`;
  const CHOICES: Array<{ id: JudgmentChoice; label: string }> = [
    { id: 'A', label: '选 A' },
    { id: 'B', label: '选 B' },
    { id: 'both_good', label: '两个都可以' },
    { id: 'both_bad', label: '两个都有问题' },
  ];

  return (
    <section style={styles.card}>
      <h2 style={styles.sectionTitle}>AI 输出判断 ({idx}/2)</h2>
      <p style={styles.sectionSubtitle}>{context}</p>

      <div style={styles.judgmentGrid}>
        <CodeBlock testId={`phase0-ai-judgment-${idx}-code-a`} label="版本 A" code={codeA} />
        <CodeBlock testId={`phase0-ai-judgment-${idx}-code-b`} label="版本 B" code={codeB} />
      </div>

      <div style={styles.choiceRow} data-testid={choiceTestId} role="radiogroup">
        {CHOICES.map((c) => {
          const active = value.choice === c.id;
          return (
            <button
              type="button"
              key={c.id}
              data-testid={`${choiceTestId}-${c.id}`}
              onClick={() => onChange({ choice: c.id })}
              style={{
                ...styles.choiceBtn,
                ...(active ? styles.choiceBtnActive : {}),
              }}
              aria-pressed={active}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <textarea
        data-testid={reasonTestId}
        value={value.reason}
        onChange={(e) => onChange({ reason: e.target.value })}
        placeholder="说明你选择的理由(至少 20 字)"
        rows={4}
        style={styles.textarea}
      />
      <CharCountHint value={value.reason} min={REASON_MIN_CHARS} />
    </section>
  );
};

const DecisionSection: React.FC<{
  scenario: string;
  options: Array<{ id: string; label: string; description: string }>;
  value: DecisionState;
  onChange: (patch: DecisionState) => void;
}> = ({ scenario, options, value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>决策场景</h2>
    <p style={styles.sectionSubtitle}>{scenario}</p>

    <ul style={styles.radioList} data-testid="phase0-decision-choice">
      {options.map((opt) => (
        <li key={opt.id} style={styles.radioItem}>
          <label style={styles.radioLabel}>
            <input
              type="radio"
              name="phase0-decision"
              data-testid={`phase0-decision-choice-${opt.id}`}
              checked={value.choice === opt.id}
              onChange={() => onChange({ ...value, choice: opt.id })}
              style={styles.radioInput}
            />
            <span style={styles.radioText}>
              <strong style={styles.decisionLabel}>
                {opt.id} · {opt.label}
              </strong>
              <span style={styles.decisionDesc}>{opt.description}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>

    <textarea
      data-testid="phase0-decision-reason"
      value={value.reason}
      onChange={(e) => onChange({ ...value, reason: e.target.value })}
      placeholder="为什么先做这件事?至少 20 字"
      rows={4}
      style={styles.textarea}
    />
    <CharCountHint value={value.reason} min={REASON_MIN_CHARS} />
  </section>
);

const AiClaimSection: React.FC<{
  code: string;
  explanation: string;
  value: AiClaimState;
  onChange: (patch: AiClaimState) => void;
}> = ({ code, explanation, value, onChange }) => (
  <section style={styles.card}>
    <h2 style={styles.sectionTitle}>AI 声明验证</h2>
    <p style={styles.sectionSubtitle}>
      下面是 AI 生成的代码,以及 AI 自己写的解释。请审查 AI 的解释是否和代码一致 —— 若有不一致,描述
      <strong> AI 解释的具体哪里有问题(标明具体位置 / 行号 / 函数名 / feature)</strong>。
    </p>

    <div style={styles.aiClaimRow}>
      <CodeBlock testId="phase0-ai-claim-code" label="AI 生成的代码" code={code} />

      <div style={styles.aiExplanationCard} data-testid="phase0-ai-claim-explanation">
        <div style={styles.aiExplanationHeader}>
          <span style={styles.aiBadge}>AI</span>
          <span style={styles.aiExplanationTitle}>AI 的解释</span>
        </div>
        <p style={styles.aiExplanationBody}>{explanation}</p>
      </div>
    </div>

    <textarea
      data-testid="phase0-ai-claim-response"
      value={value.response}
      onChange={(e) => onChange({ response: e.target.value })}
      placeholder="AI 说用了 X,但代码里我没看到……(建议指出行号 / 函数 / 具体 feature)"
      rows={6}
      style={styles.textarea}
    />
  </section>
);

// ────────────────────────── primitives ──────────────────────────

const CodeBlock: React.FC<{ testId: string; label: string; code: string }> = ({
  testId,
  label,
  code,
}) => (
  <div style={styles.codeBlockCard} data-testid={testId}>
    <div style={styles.codeBlockLabel}>{label}</div>
    <pre style={styles.codePre}>
      <code>{code}</code>
    </pre>
  </div>
);

const CharCountHint: React.FC<{ value: string; min: number }> = ({ value, min }) => {
  const len = useMemo(() => value.trim().length, [value]);
  const ok = len >= min;
  return (
    <div
      style={{
        ...styles.charCount,
        color: ok ? colors.green : colors.overlay1,
      }}
    >
      {len} / {min} 字符{!ok && ' ·  还差一点'}
    </div>
  );
};

// ────────────────────────── styles ──────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    width: '100%',
  },
  taskCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
  },
  modulePill: {
    alignSelf: 'flex-start',
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: `${colors.mauve}22`,
    color: colors.mauve,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.5px',
  },
  taskTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  taskBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  sectionSubtitle: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.6,
  },
  editorWrap: {
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  radioList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  radioItem: {
    padding: 0,
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  radioInput: {
    marginTop: 4,
    accentColor: colors.mauve,
  },
  radioText: {
    fontSize: fontSizes.sm,
    color: colors.subtext1,
    lineHeight: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  decisionLabel: {
    color: colors.text,
    fontWeight: fontWeights.semibold,
  },
  decisionDesc: {
    color: colors.subtext0,
  },
  textarea: {
    width: '100%',
    fontFamily: 'inherit',
    fontSize: fontSizes.sm,
    color: colors.text,
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    padding: spacing.md,
    lineHeight: 1.5,
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  },
  charCount: {
    fontSize: fontSizes.xs,
    textAlign: 'right' as const,
  },
  judgmentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: spacing.md,
  },
  codeBlockCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    backgroundColor: colors.crust,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  codeBlockLabel: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: colors.surface0,
    color: colors.subtext1,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.3px',
  },
  codePre: {
    margin: 0,
    padding: spacing.md,
    fontSize: 12,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    color: colors.text,
    overflowX: 'auto' as const,
    whiteSpace: 'pre' as const,
    lineHeight: 1.5,
  },
  choiceRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  choiceBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: colors.base,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  choiceBtnActive: {
    backgroundColor: `${colors.mauve}22`,
    borderColor: colors.mauve,
    color: colors.text,
  },
  aiClaimRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: spacing.md,
  },
  aiExplanationCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: `${colors.mauve}10`,
    border: `1px solid ${colors.mauve}55`,
    borderLeft: `3px solid ${colors.mauve}`,
    borderRadius: radii.md,
  },
  aiExplanationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiBadge: {
    padding: `2px 8px`,
    backgroundColor: colors.mauve,
    color: colors.base,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    borderRadius: radii.sm,
    letterSpacing: '0.5px',
  },
  aiExplanationTitle: {
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  aiExplanationBody: {
    color: colors.subtext1,
    fontSize: fontSizes.sm,
    lineHeight: 1.7,
    margin: 0,
  },
  submitRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingBottom: spacing.xl,
  },
  submitBtn: {
    padding: `${spacing.sm} ${spacing.xxl}`,
    backgroundColor: colors.blue,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  submitBtnDisabled: {
    backgroundColor: colors.surface1,
    color: colors.overlay1,
    cursor: 'not-allowed',
  },
};
