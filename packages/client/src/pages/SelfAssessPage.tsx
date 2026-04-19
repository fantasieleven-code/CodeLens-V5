/**
 * Self-Assessment (SE) — feeds sMetaCognition.
 *
 * Candidate rates their overall performance on a 0-100 slider and writes a
 * short reasoning. sMetaCognition = 1 - |selfRating/100 - actualComposite/100|,
 * so accurate self-assessment (within ±10) scores highest. Also serves as
 * the "initial scoring trigger": after SE submits, the orchestrator runs
 * signals → score → profile.
 */

import React, { useMemo, useRef, useState } from 'react';
import type { V5SelfAssessSubmission } from '@codelens-v5/shared';
import { getSocket } from '../lib/socket.js';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { useBehaviorTracker } from '../hooks/useBehaviorTracker.js';
import { DecisionSummary } from '../components/DecisionSummary.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export const SelfAssessPage: React.FC = () => {
  const advance = useModuleStore((s) => s.advance);
  const suiteId = useModuleStore((s) => s.suiteId);
  const setSubmission = useSessionStore((s) => s.setModuleSubmissionLocal);
  const sessionId = useSessionStore((s) => s.sessionId);
  // Subscribe to submissions so re-renders reflect upstream module writes —
  // store getters don't trigger React updates on their own.
  const submissions = useSessionStore((s) => s.submissions);
  const decisionSummary = useMemo(
    // Read via getState so we don't have to wire a selector for every
    // nested field — submissions in deps triggers recompute on any change.
    () => useSessionStore.getState().getDecisionSummary(),
    [submissions],
  );
  const behavior = useBehaviorTracker(sessionId ?? 'selfassess-pending', 'selfAssess');
  const mountTimeRef = useRef(Date.now());

  const [confidence, setConfidence] = useState(60);
  const [reasoning, setReasoning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Slider history captures every drag-stop. Initial value (60) is recorded
  // on first render so the history starts with the default rather than
  // appearing to materialize at the first adjustment.
  const sliderHistoryRef = useRef<{ time: number; value: number }[]>([
    { time: Date.now(), value: 60 },
  ]);

  const handleConfidenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    sliderHistoryRef.current.push({ time: Date.now(), value });
    setConfidence(value);
  };

  const handleReasoningChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReasoning(e.target.value);
    behavior.trackKeystroke();
  };

  const handleReasoningPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    behavior.trackPaste(e.clipboardData.getData('text').length);
  };

  const canSubmit = reasoning.trim().length >= 10 && !submitting;

  const onSubmit = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // sliderAdjustCount excludes the seeded initial entry.
    const adjustCount = Math.max(0, sliderHistoryRef.current.length - 1);
    behavior.flush(undefined, {
      sliderHistory: sliderHistoryRef.current,
      sliderAdjustCount: adjustCount,
      reflectionCharCount: reasoning.length,
      totalChars: reasoning.length,
    });

    // Persist the canonical V5 submission shape locally so CompletePage
    // renders selfAssess as done and DecisionSummary on downstream pages
    // has a stable snapshot to read from. Socket emit is additive — once
    // shared/ws.ts adopts `v5:selfassess:submit`, switch to
    // setModuleSubmission (which will mirror the emit).
    const submission: V5SelfAssessSubmission = {
      confidence,
      reasoning: reasoning.trim(),
    };
    setSubmission('selfAssess', submission);

    const socket = getSocket();
    // The server handler for `self-assess:submit` doesn't exist yet (pending
    // Backend Cluster D). Without a timeout, a missing ack leaves the button
    // stuck on "提交中…" forever. Guard with an 8s fallback — once the server
    // handler lands, acks arrive well under that and the timeout is invisible.
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setSubmitting(false);
      setError('提交遇到问题,请稍后重试');
    }, 8000);

    socket.emit(
      'self-assess:submit',
      {
        sessionId: sessionId ?? 'selfassess-pending',
        selfConfidence: confidence,
        selfIdentifiedRisk: reasoning.trim() || undefined,
        responseTimeMs: Date.now() - mountTimeRef.current,
      },
      (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        setSubmitting(false);
        if (ok) {
          advance();
        } else {
          setError('提交失败，请重试');
        }
      },
    );
  };

  return (
    <div style={styles.container} data-testid="selfassess-root">
      <h1 style={styles.heading}>Self-Assessment · 自我评估</h1>
      <p style={styles.subheading}>
        {suiteId === 'quick_screen'
          ? '评估你在本次快筛中的整体表现。'
          : '在进入语音追问之前，先评估一下你整场考试的表现。'}
        诚实比"看起来好"更有价值 —— 我们会对比你的自评和真实得分，评估你的元认知能力。
      </p>

      <DecisionSummary summary={decisionSummary} />

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>你觉得自己表现如何？</h2>

        <div style={styles.sliderRow}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={confidence}
            onChange={handleConfidenceChange}
            style={styles.slider}
            data-testid="selfassess-slider"
          />
          <div style={styles.sliderValueBlock}>
            <span style={styles.sliderValue}>{confidence}</span>
            <span style={styles.sliderUnit}>/ 100</span>
          </div>
        </div>

        <div style={styles.scaleHints}>
          <span>0 — 完全搞砸</span>
          <span>50 — 一般</span>
          <span>100 — 近乎完美</span>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>具体说明（至少 10 字）</h2>
        <p style={styles.sectionHint}>
          哪些环节你感觉做得好？哪些你觉得还不够？如果可以重来，你会做什么不同的决定？
        </p>
        <textarea
          value={reasoning}
          onChange={handleReasoningChange}
          onPaste={handleReasoningPaste}
          placeholder="例：我认为 Phase 0 的方案选择可能选错了，那道题的陷阱是..."
          style={styles.textarea}
          rows={6}
          data-testid="selfassess-reasoning"
        />
        <div style={styles.charCount}>
          {reasoning.trim().length} 字 {reasoning.trim().length < 10 && '（还需要写更多）'}
        </div>
      </section>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.submitRow}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            ...styles.submitBtn,
            ...(canSubmit ? {} : styles.submitBtnDisabled),
          }}
          data-testid="selfassess-submit"
        >
          {submitting ? '提交中…' : '提交自评'}
        </button>
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
  heading: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  subheading: {
    fontSize: fontSizes.md,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
  },
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.text,
    margin: 0,
  },
  sectionHint: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    margin: 0,
    lineHeight: 1.5,
  },
  sliderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.lg,
  },
  slider: {
    flex: 1,
    accentColor: colors.mauve,
    height: 6,
  },
  sliderValueBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: spacing.xs,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  sliderValue: {
    fontSize: fontSizes.xxl,
    fontWeight: fontWeights.bold,
    color: colors.mauve,
  },
  sliderUnit: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
  },
  scaleHints: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: fontSizes.xs,
    color: colors.overlay1,
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
    lineHeight: 1.6,
  },
  charCount: {
    fontSize: fontSizes.xs,
    color: colors.overlay1,
    textAlign: 'right' as const,
  },
  submitRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  submitBtn: {
    padding: `${spacing.md} ${spacing.xl}`,
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
  submitBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  error: {
    padding: spacing.md,
    backgroundColor: 'rgba(243, 139, 168, 0.12)',
    border: `1px solid ${colors.red}`,
    borderRadius: radii.sm,
    color: colors.red,
    fontSize: fontSizes.sm,
  },
};
