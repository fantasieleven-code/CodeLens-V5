/**
 * ModuleAPage — Task 5.
 *
 * Canonical layout per:
 *   - frontend-agent-tasks.md Task 5 (L409-522)
 *   - v5-design-clarifications.md Round 3 Part 3 调整 2 (L213-393) — adds R4
 *
 * 4 top-level rounds, progressive reveal on submit:
 *   R1 方案判断 (internal 4 substeps: scheme → structured → challenge → submit)
 *     → writes round1 { schemeId, reasoning, structuredForm, challengeResponse }
 *   R2 代码审查
 *     → writes round2 { markedDefects }
 *   R3 版本对比诊断
 *     → writes round3 { correctVersionChoice, diffAnalysis, diagnosisText }
 *   R4 迁移验证 (new in Round 3 Part 3 调整 2)
 *     → writes round4 { response, submittedAt, timeSpentSec }
 *
 * The R4 `round4` field is canonical per Round 3 Part 3 调整 2 L358-372
 * and lives on V5ModuleASubmission directly (no inputBehavior bridge).
 *
 * Mock data source for R4 `migrationScenario` lives in ./moduleA/mock.ts as
 * a local MAMockModule type — backend Task 10 promotes it into MAModuleSpecific
 * per Round 3 Part 3 调整 2 L375-393, at which point MAMockModule can be
 * deleted.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { V5ModuleASubmission } from '@codelens-v5/shared';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { ModuleShell } from '../components/ModuleShell.js';
import {
  StructuredReasoningForm,
  type StructuredReasoning,
} from '../components/forms/StructuredReasoningForm.js';
import { MA_MOCK_FIXTURE, type MAMockModule } from './moduleA/mock.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

// ────────────────────────────── thresholds ──────────────────────────────

const R1_REASONING_MIN = 30;
const R1_CHALLENGE_MIN = 40;
const R2_REVIEW_COMMENT_MIN = 10;
const R3_DIFF_MIN = 40;
const R3_DIAGNOSIS_MIN = 40;
const R4_RESPONSE_MIN = 80;

// ────────────────────────────── types ──────────────────────────────

type ReviewType = 'bug' | 'suggestion' | 'question' | 'nit';

interface ReviewDraft {
  line: number;
  commentType: ReviewType;
  comment: string;
  fixSuggestion: string;
}

type RoundId = 'R1' | 'R2' | 'R3' | 'R4';

export interface ModuleAPageProps {
  module?: MAMockModule;
  onSubmit?: (submission: V5ModuleASubmission) => void;
  bare?: boolean;
}

// ────────────────────────────── component ──────────────────────────────

export const ModuleAPage: React.FC<ModuleAPageProps> = ({
  module: moduleContent = MA_MOCK_FIXTURE,
  onSubmit,
  bare = false,
}) => {
  const advance = useModuleStore((s) => s.advance);
  const setSubmission = useSessionStore((s) => s.setModuleSubmissionLocal);

  // --- Round 1 state
  const [r1Scheme, setR1Scheme] = useState<'A' | 'B' | 'C' | null>(null);
  const [r1Reasoning, setR1Reasoning] = useState('');
  const [r1Structured, setR1Structured] = useState<StructuredReasoning>({
    scenario: '',
    tradeoff: '',
    decision: '',
    verification: '',
  });
  const [r1ChallengeResponse, setR1ChallengeResponse] = useState('');
  const [r1Done, setR1Done] = useState(false);

  // --- Round 2 state
  const [r2Reviews, setR2Reviews] = useState<ReviewDraft[]>([]);
  const [r2ActiveLine, setR2ActiveLine] = useState<number | null>(null);
  const [r2Draft, setR2Draft] = useState<ReviewDraft>({
    line: 0,
    commentType: 'bug',
    comment: '',
    fixSuggestion: '',
  });
  const [r2Done, setR2Done] = useState(false);

  // --- Round 3 state
  const [r3Correct, setR3Correct] = useState<'success' | 'failed' | null>(null);
  const [r3DiffAnalysis, setR3DiffAnalysis] = useState('');
  const [r3Diagnosis, setR3Diagnosis] = useState('');
  const [r3Done, setR3Done] = useState(false);

  // --- Round 4 state
  const [r4Response, setR4Response] = useState('');
  const [r4StartedAt] = useState(() => Date.now());

  // --- current-round progression
  const currentRound: RoundId = !r1Done
    ? 'R1'
    : !r2Done
      ? 'R2'
      : !r3Done
        ? 'R3'
        : 'R4';

  // Counter-arguments shown in R1 challenge step depend on the scheme picked.
  const challengeText = useMemo(() => {
    if (!r1Scheme) return '';
    const bullets = moduleContent.counterArguments[r1Scheme] ?? [];
    return bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
  }, [r1Scheme, moduleContent]);

  // --- R1 predicates
  const r1SchemeDone = r1Scheme !== null;
  const r1ReasoningDone = r1Reasoning.trim().length >= R1_REASONING_MIN;
  const r1StructuredDone =
    r1Structured.scenario.trim().length >= 20 &&
    r1Structured.tradeoff.trim().length >= 20 &&
    r1Structured.decision.trim().length >= 20 &&
    r1Structured.verification.trim().length >= 20;
  const r1ChallengeDone =
    r1ChallengeResponse.trim().length >= R1_CHALLENGE_MIN;
  const canSubmitR1 =
    r1SchemeDone && r1ReasoningDone && r1StructuredDone && r1ChallengeDone;

  // --- R2 predicates
  const canSubmitR2 = r2Reviews.length >= 1;

  // --- R3 predicates
  const canSubmitR3 =
    r3Correct !== null &&
    r3DiffAnalysis.trim().length >= R3_DIFF_MIN &&
    r3Diagnosis.trim().length >= R3_DIAGNOSIS_MIN;

  // --- R4 predicates
  const canSubmitR4 = r4Response.trim().length >= R4_RESPONSE_MIN;

  // ─────────────────── R2 review handlers ───────────────────

  const openReviewFor = useCallback((line: number) => {
    setR2ActiveLine(line);
    setR2Draft({ line, commentType: 'bug', comment: '', fixSuggestion: '' });
  }, []);

  const saveReview = useCallback(() => {
    if (r2Draft.comment.trim().length < R2_REVIEW_COMMENT_MIN) return;
    setR2Reviews((prev) => {
      // de-dupe by line — latest wins
      const filtered = prev.filter((r) => r.line !== r2Draft.line);
      return [...filtered, r2Draft];
    });
    setR2ActiveLine(null);
  }, [r2Draft]);

  const removeReview = useCallback((line: number) => {
    setR2Reviews((prev) => prev.filter((r) => r.line !== line));
  }, []);

  // ─────────────────── final submit (after R4) ───────────────────

  const handleFinalSubmit = useCallback(() => {
    if (!canSubmitR4 || !r1Scheme || !r3Correct) return;

    const submission: V5ModuleASubmission = {
      round1: {
        schemeId: r1Scheme,
        reasoning: r1Reasoning,
        structuredForm: r1Structured,
        challengeResponse: r1ChallengeResponse,
      },
      round2: {
        markedDefects: r2Reviews.map((r, idx) => ({
          defectId: `cand-${idx + 1}`,
          commentType: r.commentType,
          comment: r.comment,
          fixSuggestion: r.fixSuggestion || undefined,
        })),
      },
      round3: {
        correctVersionChoice: r3Correct,
        diffAnalysis: r3DiffAnalysis,
        diagnosisText: r3Diagnosis,
      },
      round4: {
        response: r4Response,
        submittedAt: Date.now(),
        timeSpentSec: Math.round((Date.now() - r4StartedAt) / 1000),
      },
    };

    onSubmit?.(submission);
    setSubmission('moduleA', submission);
    advance();
  }, [
    canSubmitR4,
    r1Scheme,
    r1Reasoning,
    r1Structured,
    r1ChallengeResponse,
    r2Reviews,
    r3Correct,
    r3DiffAnalysis,
    r3Diagnosis,
    r4Response,
    r4StartedAt,
    onSubmit,
    setSubmission,
    advance,
  ]);

  // ─────────────────── render ───────────────────

  const body = (
    <div style={styles.container} data-testid="moduleA-container">
      <RoundHeader currentRound={currentRound} />

      <Round1Section
        requirement={moduleContent.requirement}
        schemes={moduleContent.schemes}
        scheme={r1Scheme}
        onScheme={setR1Scheme}
        reasoning={r1Reasoning}
        onReasoning={setR1Reasoning}
        structured={r1Structured}
        onStructured={setR1Structured}
        challengeText={challengeText}
        challengeResponse={r1ChallengeResponse}
        onChallengeResponse={setR1ChallengeResponse}
        canSubmit={canSubmitR1}
        onSubmit={() => setR1Done(true)}
        locked={r1Done}
      />

      {r1Done && (
        <Round2Section
          codeForReview={moduleContent.codeForReview}
          reviews={r2Reviews}
          activeLine={r2ActiveLine}
          draft={r2Draft}
          onDraftChange={setR2Draft}
          onLineClick={openReviewFor}
          onSaveReview={saveReview}
          onCancelReview={() => setR2ActiveLine(null)}
          onRemove={removeReview}
          canSubmit={canSubmitR2}
          onSubmit={() => setR2Done(true)}
          locked={r2Done}
        />
      )}

      {r2Done && (
        <Round3Section
          successCode={moduleContent.failureScenario.successCode}
          failedCode={moduleContent.failureScenario.failedCode}
          correct={r3Correct}
          onCorrect={setR3Correct}
          diffAnalysis={r3DiffAnalysis}
          onDiffAnalysis={setR3DiffAnalysis}
          diagnosis={r3Diagnosis}
          onDiagnosis={setR3Diagnosis}
          canSubmit={canSubmitR3}
          onSubmit={() => setR3Done(true)}
          locked={r3Done}
        />
      )}

      {r3Done && (
        <Round4Section
          r1Scheme={r1Scheme}
          r1Reasoning={r1Reasoning}
          migrationScenario={moduleContent.migrationScenario}
          response={r4Response}
          onResponse={setR4Response}
          canSubmit={canSubmitR4}
          onSubmit={handleFinalSubmit}
        />
      )}
    </div>
  );

  return bare ? body : <ModuleShell>{body}</ModuleShell>;
};

// ────────────────────────────── round header ──────────────────────────────

const RoundHeader: React.FC<{ currentRound: RoundId }> = ({ currentRound }) => {
  const rounds: Array<{ id: RoundId; label: string }> = [
    { id: 'R1', label: 'Round 1 · 方案判断' },
    { id: 'R2', label: 'Round 2 · 代码审查' },
    { id: 'R3', label: 'Round 3 · 版本对比' },
    { id: 'R4', label: 'Round 4 · 迁移验证' },
  ];
  const currentIdx = rounds.findIndex((r) => r.id === currentRound);
  return (
    <div style={styles.roundHeader} data-testid="moduleA-round-header">
      {rounds.map((r, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const color = done ? colors.green : active ? colors.blue : colors.overlay0;
        return (
          <div key={r.id} style={{ ...styles.roundPill, borderColor: color, color }}>
            {r.label}
            {done && ' ✓'}
          </div>
        );
      })}
    </div>
  );
};

// ────────────────────────────── Round 1 ──────────────────────────────

interface Round1SectionProps {
  requirement: string;
  schemes: MAMockModule['schemes'];
  scheme: 'A' | 'B' | 'C' | null;
  onScheme: (s: 'A' | 'B' | 'C') => void;
  reasoning: string;
  onReasoning: (s: string) => void;
  structured: StructuredReasoning;
  onStructured: (s: StructuredReasoning) => void;
  challengeText: string;
  challengeResponse: string;
  onChallengeResponse: (s: string) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  locked: boolean;
}

const Round1Section: React.FC<Round1SectionProps> = ({
  requirement,
  schemes,
  scheme,
  onScheme,
  reasoning,
  onReasoning,
  structured,
  onStructured,
  challengeText,
  challengeResponse,
  onChallengeResponse,
  canSubmit,
  onSubmit,
  locked,
}) => {
  const showStructured = scheme !== null;
  const showChallenge = showStructured && reasoning.trim().length >= R1_REASONING_MIN;

  return (
    <section style={styles.card} data-testid="moduleA-r1">
      <SectionTitle pill="Round 1" title="方案判断 · 秒杀下单库存预扣" />
      <p style={styles.bodyText}>{requirement}</p>

      <SubstepLabel step={1} total={4} title="选择方案" />
      <div style={styles.schemeGrid}>
        {schemes.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => onScheme(s.id)}
            disabled={locked}
            data-testid={`ma-r1-scheme-${s.id.toLowerCase()}`}
            aria-pressed={scheme === s.id}
            style={{
              ...styles.schemeCard,
              borderColor: scheme === s.id ? colors.blue : colors.surface1,
              backgroundColor: scheme === s.id ? `${colors.blue}18` : colors.surface0,
            }}
          >
            <div style={styles.schemeTitle}>方案 {s.id} · {s.name}</div>
            <div style={styles.schemeDesc}>{s.description}</div>
            <div style={styles.kv}>
              <strong>优点:</strong>
              <ul style={styles.ul}>
                {s.pros.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div style={styles.kv}>
              <strong>代价:</strong>
              <ul style={styles.ul}>
                {s.cons.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
            <div style={styles.kv}><strong>性能:</strong> {s.performance}</div>
            <div style={styles.kv}><strong>成本:</strong> {s.cost}</div>
          </button>
        ))}
      </div>

      {showStructured && (
        <>
          <SubstepLabel step={2} total={4} title="简要理由 + 结构化论证" />
          <label style={styles.label}>
            <span>简要理由 (至少 {R1_REASONING_MIN} 字)</span>
            <span style={styles.counter}>
              {reasoning.trim().length}/{R1_REASONING_MIN}+
            </span>
          </label>
          <textarea
            value={reasoning}
            onChange={(e) => onReasoning(e.target.value)}
            disabled={locked}
            rows={3}
            style={styles.textarea}
            data-testid="ma-r1-reasoning"
            placeholder="例:选 C 方案,因为 20k QPS 下锁竞争(A)和 CAS 重试风暴(B)都会撑爆 p99…"
          />
          <StructuredReasoningForm
            value={structured}
            onChange={onStructured}
            testIdPrefix="ma-r1-structured"
          />
        </>
      )}

      {showChallenge && (
        <>
          <SubstepLabel step={3} total={4} title="Emma 挑战 · 请回应" />
          <div style={styles.challengeBox} data-testid="ma-r1-challenge-text">
            <div style={styles.aiBadge}>面试官</div>
            <pre style={styles.challengePre}>{challengeText}</pre>
          </div>
          <label style={styles.label}>
            <span>你的回应 (至少 {R1_CHALLENGE_MIN} 字)</span>
            <span style={styles.counter}>
              {challengeResponse.trim().length}/{R1_CHALLENGE_MIN}+
            </span>
          </label>
          <textarea
            value={challengeResponse}
            onChange={(e) => onChallengeResponse(e.target.value)}
            disabled={locked}
            rows={4}
            style={styles.textarea}
            data-testid="ma-r1-challenge-response"
            placeholder="例:第一点成立,我会加 Sentinel 或 RedLock 兜底;第二点我的假设是…"
          />
        </>
      )}

      {!locked && (
        <div style={styles.actionRow}>
          <SubstepLabel step={4} total={4} title="提交 Round 1" />
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="ma-r1-submit"
            style={canSubmit ? styles.btnPrimary : styles.btnDisabled}
          >
            提交 Round 1
          </button>
        </div>
      )}
    </section>
  );
};

// ────────────────────────────── Round 2 ──────────────────────────────

interface Round2SectionProps {
  codeForReview: string;
  reviews: ReviewDraft[];
  activeLine: number | null;
  draft: ReviewDraft;
  onDraftChange: (d: ReviewDraft) => void;
  onLineClick: (line: number) => void;
  onSaveReview: () => void;
  onCancelReview: () => void;
  onRemove: (line: number) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  locked: boolean;
}

const Round2Section: React.FC<Round2SectionProps> = ({
  codeForReview,
  reviews,
  activeLine,
  draft,
  onDraftChange,
  onLineClick,
  onSaveReview,
  onCancelReview,
  onRemove,
  canSubmit,
  onSubmit,
  locked,
}) => {
  const lines = codeForReview.split('\n');
  return (
    <section style={styles.card} data-testid="moduleA-r2">
      <SectionTitle pill="Round 2" title="代码审查 · 方案 A 的实现" />
      <p style={styles.bodyText}>
        下面是方案 A 的实际实现。点击行号添加评审评论 — 至少标注 1 处才能进入下一轮。
      </p>

      <div style={styles.codeDisplay} data-testid="ma-r2-code-display">
        {lines.map((text, idx) => {
          const line = idx + 1;
          const reviewed = reviews.some((r) => r.line === line);
          return (
            <div key={line} style={styles.codeLine}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onLineClick(line)}
                data-testid={`ma-r2-review-line-${line}`}
                style={{
                  ...styles.lineNumberBtn,
                  backgroundColor: reviewed
                    ? `${colors.yellow}33`
                    : 'transparent',
                  color: reviewed ? colors.yellow : colors.overlay1,
                }}
              >
                {line.toString().padStart(2, ' ')}
              </button>
              <code style={styles.codeText}>{text || '\u00A0'}</code>
            </div>
          );
        })}
      </div>

      {activeLine !== null && !locked && (
        <div style={styles.reviewForm}>
          <strong style={styles.reviewFormTitle}>为第 {activeLine} 行添加评审</strong>
          <label style={styles.label}>类型</label>
          <select
            value={draft.commentType}
            onChange={(e) =>
              onDraftChange({ ...draft, commentType: e.target.value as ReviewType })
            }
            data-testid="ma-r2-review-type"
            style={styles.select}
          >
            <option value="bug">bug (缺陷)</option>
            <option value="suggestion">suggestion (建议)</option>
            <option value="question">question (疑问)</option>
            <option value="nit">nit (小问题)</option>
          </select>
          <label style={styles.label}>评论 (至少 {R2_REVIEW_COMMENT_MIN} 字)</label>
          <textarea
            value={draft.comment}
            onChange={(e) => onDraftChange({ ...draft, comment: e.target.value })}
            rows={2}
            style={styles.textarea}
            data-testid="ma-r2-review-comment"
          />
          <label style={styles.label}>修复建议 (可选)</label>
          <textarea
            value={draft.fixSuggestion}
            onChange={(e) => onDraftChange({ ...draft, fixSuggestion: e.target.value })}
            rows={2}
            style={styles.textarea}
            data-testid="ma-r2-review-fix"
          />
          <div style={styles.actionRow}>
            <button
              type="button"
              onClick={onCancelReview}
              style={styles.btnGhost}
            >
              取消
            </button>
            <button
              type="button"
              onClick={onSaveReview}
              disabled={draft.comment.trim().length < R2_REVIEW_COMMENT_MIN}
              style={
                draft.comment.trim().length >= R2_REVIEW_COMMENT_MIN
                  ? styles.btnPrimary
                  : styles.btnDisabled
              }
            >
              保存评论
            </button>
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <div style={styles.reviewList}>
          <strong>已标注的 {reviews.length} 处评审:</strong>
          {reviews
            .slice()
            .sort((a, b) => a.line - b.line)
            .map((r) => (
              <div key={r.line} style={styles.reviewItem}>
                <span style={styles.reviewLineTag}>L{r.line}</span>
                <span style={styles.reviewTypeTag}>{r.commentType}</span>
                <span style={styles.reviewComment}>{r.comment}</span>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => onRemove(r.line)}
                    style={styles.btnRemove}
                    aria-label={`删除 L${r.line} 评审`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {!locked && (
        <div style={styles.actionRow}>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="ma-r2-submit"
            style={canSubmit ? styles.btnPrimary : styles.btnDisabled}
          >
            提交代码审查
          </button>
        </div>
      )}
    </section>
  );
};

// ────────────────────────────── Round 3 ──────────────────────────────

interface Round3SectionProps {
  successCode: string;
  failedCode: string;
  correct: 'success' | 'failed' | null;
  onCorrect: (c: 'success' | 'failed') => void;
  diffAnalysis: string;
  onDiffAnalysis: (s: string) => void;
  diagnosis: string;
  onDiagnosis: (s: string) => void;
  canSubmit: boolean;
  onSubmit: () => void;
  locked: boolean;
}

const Round3Section: React.FC<Round3SectionProps> = ({
  successCode,
  failedCode,
  correct,
  onCorrect,
  diffAnalysis,
  onDiffAnalysis,
  diagnosis,
  onDiagnosis,
  canSubmit,
  onSubmit,
  locked,
}) => {
  return (
    <section style={styles.card} data-testid="moduleA-r3">
      <SectionTitle pill="Round 3" title="版本对比诊断 · 哪个是线上版本" />
      <p style={styles.bodyText}>
        线上故障后,团队回滚时发现两个分支上都有 reserveInventory 的实现。请判断哪个是"修好的正确版本",并分析差异与根因。
      </p>

      <div style={styles.diffPane}>
        <div style={styles.diffColumn}>
          <strong style={styles.diffHeading}>版本 Success (success)</strong>
          <pre style={styles.codeBlock} data-testid="ma-r3-code-success">
            {successCode}
          </pre>
        </div>
        <div style={styles.diffColumn}>
          <strong style={styles.diffHeading}>版本 Failed (failed)</strong>
          <pre style={styles.codeBlock} data-testid="ma-r3-code-failed">
            {failedCode}
          </pre>
        </div>
      </div>

      <div data-testid="ma-r3-correct-choice" style={styles.correctChoiceRow}>
        <span style={styles.label}>正确版本是:</span>
        <button
          type="button"
          onClick={() => onCorrect('success')}
          disabled={locked}
          data-testid="ma-r3-correct-choice-success"
          aria-pressed={correct === 'success'}
          style={{
            ...styles.choiceBtn,
            borderColor: correct === 'success' ? colors.blue : colors.surface1,
            backgroundColor:
              correct === 'success' ? `${colors.blue}18` : colors.surface0,
          }}
        >
          Success
        </button>
        <button
          type="button"
          onClick={() => onCorrect('failed')}
          disabled={locked}
          data-testid="ma-r3-correct-choice-failed"
          aria-pressed={correct === 'failed'}
          style={{
            ...styles.choiceBtn,
            borderColor: correct === 'failed' ? colors.blue : colors.surface1,
            backgroundColor:
              correct === 'failed' ? `${colors.blue}18` : colors.surface0,
          }}
        >
          Failed
        </button>
      </div>

      <label style={styles.label}>
        <span>关键差异 (至少 {R3_DIFF_MIN} 字)</span>
        <span style={styles.counter}>
          {diffAnalysis.trim().length}/{R3_DIFF_MIN}+
        </span>
      </label>
      <textarea
        value={diffAnalysis}
        onChange={(e) => onDiffAnalysis(e.target.value)}
        disabled={locked}
        rows={3}
        style={styles.textarea}
        data-testid="ma-r3-diff-analysis"
        placeholder="例:success 用 Lua eval 做 check-and-decrement 原子化,failed 分两步 GET + DECRBY…"
      />

      <label style={styles.label}>
        <span>问题根因 (至少 {R3_DIAGNOSIS_MIN} 字)</span>
        <span style={styles.counter}>
          {diagnosis.trim().length}/{R3_DIAGNOSIS_MIN}+
        </span>
      </label>
      <textarea
        value={diagnosis}
        onChange={(e) => onDiagnosis(e.target.value)}
        disabled={locked}
        rows={3}
        style={styles.textarea}
        data-testid="ma-r3-diagnosis"
        placeholder="例:failed 在 10k QPS 下 check-then-act 间窗漏,0.3% 的请求超卖…"
      />

      {!locked && (
        <div style={styles.actionRow}>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            data-testid="ma-r3-submit"
            style={canSubmit ? styles.btnPrimary : styles.btnDisabled}
          >
            提交诊断
          </button>
        </div>
      )}
    </section>
  );
};

// ────────────────────────────── Round 4 ──────────────────────────────

interface Round4SectionProps {
  r1Scheme: 'A' | 'B' | 'C' | null;
  r1Reasoning: string;
  migrationScenario: MAMockModule['migrationScenario'];
  response: string;
  onResponse: (s: string) => void;
  canSubmit: boolean;
  onSubmit: () => void;
}

const Round4Section: React.FC<Round4SectionProps> = ({
  r1Scheme,
  r1Reasoning,
  migrationScenario,
  response,
  onResponse,
  canSubmit,
  onSubmit,
}) => {
  const r1Snippet =
    r1Reasoning.length > 140 ? r1Reasoning.slice(0, 140) + '…' : r1Reasoning;
  return (
    <section style={styles.card} data-testid="moduleA-r4">
      <SectionTitle pill="Round 4" title="迁移验证 · 红包抢购场景" />

      <div style={styles.migrationScenario} data-testid="ma-r4-scenario-display">
        <strong style={styles.migrationHeading}>新场景</strong>
        <p style={styles.bodyText}>{migrationScenario.newBusinessContext}</p>
        <div style={styles.dimRow}>
          <span style={styles.dimTag}>
            <strong>共享维度:</strong> {migrationScenario.relatedDimension}
          </span>
          <span style={styles.dimTag}>
            <strong>差异维度:</strong> {migrationScenario.differingDimension}
          </span>
        </div>
      </div>

      <div style={styles.r1Reference} data-testid="ma-r4-reference-r1">
        <strong style={styles.migrationHeading}>你在 Round 1 的选择</strong>
        <p style={styles.bodyText}>
          方案 <strong>{r1Scheme ?? '?'}</strong> · 理由摘要:{r1Snippet || '(无)'}
        </p>
      </div>

      <p style={styles.migrationPrompt}>
        <strong>请回答 (至少 {R4_RESPONSE_MIN} 字):</strong>
        <br />
        {migrationScenario.promptText}
      </p>

      <label style={styles.label}>
        <span>你的回答</span>
        <span style={styles.counter}>
          {response.trim().length}/{R4_RESPONSE_MIN}+
        </span>
      </label>
      <textarea
        value={response}
        onChange={(e) => onResponse(e.target.value)}
        rows={8}
        style={styles.textarea}
        data-testid="ma-r4-response"
        placeholder="例:底层原则仍成立 — 都是…,但新场景下规模差 25×,延迟预算宽 6×…需要把参数调整为…"
      />

      <div style={styles.actionRow}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          data-testid="ma-r4-submit"
          style={canSubmit ? styles.btnPrimary : styles.btnDisabled}
        >
          提交并完成 Module A
        </button>
      </div>
    </section>
  );
};

// ────────────────────────────── shared pieces ──────────────────────────────

const SectionTitle: React.FC<{ pill: string; title: string }> = ({ pill, title }) => (
  <div style={styles.sectionTitleRow}>
    <span style={styles.pill}>{pill}</span>
    <h2 style={styles.sectionTitle}>{title}</h2>
  </div>
);

const SubstepLabel: React.FC<{ step: number; total: number; title: string }> = ({
  step,
  total,
  title,
}) => (
  <div style={styles.substepLabel}>
    Step {step}/{total} · {title}
  </div>
);

// ────────────────────────────── styles ──────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    maxWidth: 960,
    margin: '0 auto',
  },
  roundHeader: {
    display: 'flex',
    gap: spacing.sm,
    flexWrap: 'wrap',
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
  },
  roundPill: {
    padding: `${spacing.xs} ${spacing.md}`,
    border: `1px solid ${colors.overlay0}`,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  card: {
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface0}`,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
  },
  sectionTitleRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
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
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  bodyText: {
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    color: colors.subtext0,
    margin: 0,
  },
  substepLabel: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.5px',
    marginTop: spacing.sm,
  },
  schemeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: spacing.sm,
  },
  schemeCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    textAlign: 'left',
    padding: spacing.md,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
    color: colors.text,
  },
  schemeTitle: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
    color: colors.text,
  },
  schemeDesc: {
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    color: colors.subtext0,
  },
  kv: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  ul: {
    margin: `${spacing.xs} 0 0 ${spacing.md}`,
    padding: 0,
  },
  label: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  counter: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
  },
  textarea: {
    width: '100%',
    padding: spacing.sm,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
    minHeight: 60,
  },
  challengeBox: {
    display: 'flex',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: `${colors.peach}22`,
    borderLeft: `4px solid ${colors.peach}`,
    borderRadius: radii.md,
  },
  aiBadge: {
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.peach,
    color: colors.base,
    borderRadius: radii.sm,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
    height: 'fit-content',
    whiteSpace: 'nowrap',
  },
  challengePre: {
    flex: 1,
    margin: 0,
    fontSize: fontSizes.sm,
    lineHeight: 1.6,
    color: colors.text,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
  },
  codeDisplay: {
    backgroundColor: colors.crust,
    borderRadius: radii.md,
    padding: spacing.sm,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    fontSize: 12,
    lineHeight: 1.6,
    maxHeight: 360,
    overflowY: 'auto' as const,
  },
  codeLine: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
  },
  lineNumberBtn: {
    border: 'none',
    padding: `0 ${spacing.xs}`,
    width: 36,
    textAlign: 'right',
    fontFamily: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
    borderRadius: radii.sm,
  },
  codeText: {
    flex: 1,
    whiteSpace: 'pre' as const,
    color: colors.text,
  },
  reviewForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface0,
    borderRadius: radii.md,
    border: `1px solid ${colors.yellow}55`,
  },
  reviewFormTitle: {
    fontSize: fontSizes.sm,
    color: colors.yellow,
  },
  select: {
    padding: spacing.sm,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontFamily: 'inherit',
  },
  reviewList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  reviewItem: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface0,
    borderRadius: radii.sm,
  },
  reviewLineTag: {
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.surface1,
    color: colors.text,
    borderRadius: radii.sm,
    fontSize: fontSizes.xs,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
  },
  reviewTypeTag: {
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: `${colors.yellow}33`,
    color: colors.yellow,
    borderRadius: radii.sm,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  reviewComment: {
    flex: 1,
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  btnRemove: {
    padding: `0 ${spacing.sm}`,
    backgroundColor: 'transparent',
    border: `1px solid ${colors.red}55`,
    color: colors.red,
    borderRadius: radii.sm,
    fontSize: fontSizes.md,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  diffPane: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: spacing.sm,
  },
  diffColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  diffHeading: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  codeBlock: {
    backgroundColor: colors.crust,
    padding: spacing.sm,
    borderRadius: radii.md,
    fontSize: 11,
    lineHeight: 1.5,
    fontFamily: 'ui-monospace, Menlo, Monaco, monospace',
    color: colors.text,
    whiteSpace: 'pre' as const,
    overflowX: 'auto' as const,
    maxHeight: 320,
    margin: 0,
  },
  correctChoiceRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
  },
  choiceBtn: {
    padding: `${spacing.sm} ${spacing.lg}`,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    color: colors.text,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    backgroundColor: colors.surface0,
  },
  migrationScenario: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: `${colors.blue}11`,
    borderLeft: `4px solid ${colors.blue}`,
    borderRadius: radii.md,
  },
  migrationHeading: {
    fontSize: fontSizes.sm,
    color: colors.blue,
  },
  dimRow: {
    display: 'flex',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  dimTag: {
    padding: `${spacing.xs} ${spacing.sm}`,
    backgroundColor: colors.surface0,
    borderRadius: radii.sm,
    fontSize: fontSizes.xs,
    color: colors.subtext0,
  },
  r1Reference: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: `${colors.mauve}11`,
    borderLeft: `4px solid ${colors.mauve}`,
    borderRadius: radii.md,
  },
  migrationPrompt: {
    fontSize: fontSizes.sm,
    color: colors.text,
    lineHeight: 1.6,
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
  },
  actionRow: {
    display: 'flex',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  btnPrimary: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    color: colors.base,
    border: 'none',
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnDisabled: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.surface1,
    color: colors.overlay0,
    border: 'none',
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'not-allowed',
    fontFamily: 'inherit',
  },
  btnGhost: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: 'transparent',
    color: colors.subtext0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
