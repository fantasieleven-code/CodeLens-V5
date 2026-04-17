/**
 * ModuleBPage — MB Stage 1-4 orchestrator (Cursor mode).
 *
 * Task 7.6 per frontend-agent-tasks.md Section 7.6 (L660-L800) +
 * design-reference-full.md Section 15 ("Stage 2 内循环 / 三流" Stage 1-4).
 *
 * 4-stage state machine:
 *   planning  → MB1PlanningPanel        (Stage 1 — outputs V5MBPlanning)
 *   execution → CursorModeLayout        (Stage 2 — Cursor mode 三流: chat/inline/test)
 *   standards → MB3StandardsPanel       (Stage 3 — outputs V5MBStandards)
 *   audit     → ViolationAuditPanel     (Stage 4 — outputs V5MBAudit)
 *   complete  → advance() to next module
 *
 * Socket emits (5 distinct events from this orchestrator):
 *   - v5:mb:planning:submit   (Stage 1 → Stage 2 transition)
 *   - v5:mb:file_change       (manual edits during Stage 2 — source: 'manual_edit'.
 *                              AI-driven edits emit from CursorModeLayout's children
 *                              via their own socket calls, not from here.)
 *   - v5:mb:standards:submit  (Stage 3 → Stage 4 transition)
 *   - v5:mb:audit:submit      (Stage 4 → complete transition)
 *   - v5:mb:visibility_change (Round 2 Part 3 调整 4 — only during Stage 2,
 *                              which is the only stage where decision-latency
 *                              signals care about tab focus.)
 *
 * Socket listens:
 *   - v5:mb:test_result       (latest passRate folded into finalTestPassRate)
 *
 * groundTruth security:
 *   moduleContent.violationExamples is the candidate-safe shape
 *   `{ code, aiClaimedReason? }`. Backend Task 12/13 promotes MBModuleSpecific
 *   to carry the full MBViolationExample with isViolation/violationType
 *   groundTruth — at that point this page must strip those fields before
 *   handing them to ViolationAuditPanel. Keeping the strip-point in this
 *   single integrator avoids leakage through prop misuse downstream.
 *
 * editorBehavior emission strategy:
 *   The aggregate V5MBEditorBehavior fields ship as empty arrays here. The
 *   server is authoritative — it builds the rich event timeline from the
 *   behavior:batch frames the children emit via useBehaviorTracker, plus the
 *   visibility/file/test socket events wired here. This avoids double-keeping
 *   the same event lists on both sides and matches the contract documented
 *   in `V5MBSubmission.editorBehavior` (Round 2 Part 3 调整 4).
 *
 * Bare mode:
 *   `bare={true}` skips ModuleShell so the page can be embedded in storybook /
 *   harness routes that already provide their own chrome (mirrors ModuleAPage).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { V5MBAudit, V5MBPlanning, V5MBStandards, V5MBSubmission } from '@codelens-v5/shared';
import { useModuleStore } from '../stores/module.store.js';
import { useSessionStore } from '../stores/session.store.js';
import { useBehaviorTracker } from '../hooks/useBehaviorTracker.js';
import { ModuleShell } from '../components/ModuleShell.js';
import { MB1PlanningPanel } from '../components/mb/MB1PlanningPanel.js';
import { MB3StandardsPanel } from '../components/mb/MB3StandardsPanel.js';
import { ViolationAuditPanel } from '../components/mb/ViolationAuditPanel.js';
import { CursorModeLayout } from '../components/mb/CursorModeLayout.js';
import { getSocket } from '../lib/socket.js';
import { MB_MOCK_FIXTURE, type MBMockModule } from './moduleB/mock.js';
import type { MultiFileEditorFile } from '../components/editors/MultiFileEditor.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

type Stage = 'planning' | 'execution' | 'standards' | 'audit' | 'complete';

export interface ModuleBPageProps {
  module?: MBMockModule;
  onSubmit?: (submission: V5MBSubmission) => void;
  bare?: boolean;
}

export const ModuleBPage: React.FC<ModuleBPageProps> = ({
  module: moduleContent = MB_MOCK_FIXTURE,
  onSubmit,
  bare = false,
}) => {
  const advance = useModuleStore((s) => s.advance);
  const setSubmission = useSessionStore((s) => s.setModuleSubmissionLocal);
  const sessionIdFromStore = useSessionStore((s) => s.sessionId);
  // sessionId can be null in test/storybook harness where loadSession was never
  // called. Fall back to a deterministic placeholder so the socket payloads keep
  // a string field — the server-side handler ignores unknown sessionIds anyway.
  const sessionId = sessionIdFromStore ?? 'mb-pending';

  const tracker = useBehaviorTracker('mb');
  // Children expect a stable `track` reference; pull the same one tracker uses.
  const trackerForChildren = useMemo(() => ({ track: tracker.track }), [tracker.track]);

  const [stage, setStage] = useState<Stage>('planning');
  const [planning, setPlanning] = useState<V5MBPlanning | null>(null);
  const [standards, setStandards] = useState<V5MBStandards | null>(null);
  const [files, setFiles] = useState<MultiFileEditorFile[]>(
    () => moduleContent.scaffold.files,
  );
  // Latest test_result.passRate folded into the final submission. Starts at 0
  // because "never ran" and "ran but failed all" both deserve a 0 finalTestPassRate.
  const [latestPassRate, setLatestPassRate] = useState(0);

  // ─────────────────── Stage 2 — file_change emission ───────────────────

  const handleFileChange = useCallback(
    (path: string, content: string) => {
      setFiles((prev) =>
        prev.map((f) => (f.path === path ? { ...f, content } : f)),
      );
      tracker.trackKeystroke();
      getSocket().emit('v5:mb:file_change', {
        sessionId,
        filePath: path,
        content,
        source: 'manual_edit',
      });
    },
    [sessionId, tracker],
  );

  // ─────────────────── Stage 2 — test_result listener ───────────────────

  useEffect(() => {
    if (stage !== 'execution') return;
    const socket = getSocket();
    const onResult = (data: { passRate: number }) => {
      setLatestPassRate(data.passRate);
    };
    socket.on('v5:mb:test_result', onResult);
    return () => {
      socket.off('v5:mb:test_result', onResult);
    };
  }, [stage]);

  // ─────────────────── Stage 2 — visibility_change emission ───────────────────

  useEffect(() => {
    if (stage !== 'execution') return;
    const onVisibility = () => {
      getSocket().emit('v5:mb:visibility_change', {
        sessionId,
        timestamp: Date.now(),
        hidden: document.visibilityState === 'hidden',
      });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stage, sessionId]);

  // ─────────────────── Stage transitions ───────────────────

  const handlePlanningSubmit = useCallback(
    (p: V5MBPlanning) => {
      setPlanning(p);
      getSocket().emit('v5:mb:planning:submit', { sessionId, planning: p });
      tracker.track('mb_planning_submit', { skipped: p.skipped ?? false });
      setStage('execution');
    },
    [sessionId, tracker],
  );

  const handleFinishExecution = useCallback(() => {
    setStage('standards');
  }, []);

  const handleStandardsSubmit = useCallback(
    (s: V5MBStandards) => {
      setStandards(s);
      getSocket().emit('v5:mb:standards:submit', {
        sessionId,
        rulesContent: s.rulesContent,
        ...(s.agentContent !== undefined ? { agentContent: s.agentContent } : {}),
      });
      tracker.track('mb_standards_submit', {
        rulesLen: s.rulesContent.length,
        hasAgent: s.agentContent !== undefined,
      });
      setStage('audit');
    },
    [sessionId, tracker],
  );

  // Capture the latest non-state values so the final-submit callback stays
  // stable while still seeing fresh planning/standards/files at click time.
  const finalRefs = useRef({ planning, standards, files, latestPassRate });
  finalRefs.current = { planning, standards, files, latestPassRate };

  const handleAuditSubmit = useCallback(
    (audit: V5MBAudit) => {
      const { planning: p, standards: s, files: f, latestPassRate: pr } = finalRefs.current;
      getSocket().emit('v5:mb:audit:submit', {
        sessionId,
        violations: audit.violations,
      });
      tracker.track('mb_audit_submit', {
        markedCount: audit.violations.filter((v) => v.markedAsViolation).length,
        totalCount: audit.violations.length,
      });

      const submission: V5MBSubmission = {
        ...(p ? { planning: p } : {}),
        ...(s ? { standards: s } : {}),
        audit,
        finalFiles: f.map((file) => ({ path: file.path, content: file.content })),
        finalTestPassRate: pr,
        editorBehavior: {
          aiCompletionEvents: [],
          chatEvents: [],
          diffEvents: [],
          fileNavigationHistory: [],
          editSessions: [],
          testRuns: [],
        },
      };

      onSubmit?.(submission);
      setSubmission('mb', submission);
      tracker.flush();
      setStage('complete');
    },
    [sessionId, tracker, onSubmit, setSubmission],
  );

  // ─────────────────── render ───────────────────

  const stageBadge = useMemo(() => {
    const labels: Record<Stage, string> = {
      planning: 'Stage 1 · 规划',
      execution: 'Stage 2 · Cursor 实现',
      standards: 'Stage 3 · 规范',
      audit: 'Stage 4 · 审核 AI 输出',
      complete: '已完成',
    };
    return labels[stage];
  }, [stage]);

  const body = (
    <div style={styles.root} data-testid="mb-page-root">
      <header style={styles.stageBar} data-testid="mb-stage-bar">
        <span style={styles.stagePill}>Module B · Cursor 协作</span>
        <span style={styles.stageLabel} data-testid="mb-stage-label">
          {stageBadge}
        </span>
      </header>

      {stage === 'planning' && (
        <MB1PlanningPanel
          sessionId={sessionId}
          featureRequirement={moduleContent.featureRequirement}
          onSubmit={handlePlanningSubmit}
        />
      )}

      {stage === 'execution' && (
        <div style={styles.executionWrap} data-testid="mb-execution-wrap">
          <div style={styles.executionLayout}>
            <CursorModeLayout
              sessionId={sessionId}
              files={files}
              onFileChange={handleFileChange}
              behaviorTracker={trackerForChildren}
            />
          </div>
          <div style={styles.executionFooter}>
            <span style={styles.executionHint}>
              完成实现后点击右侧按钮进入规范阶段。Stage 3
              要求你写下让 AI 遵守的规则；Stage 4 会用这些规则审核 AI 输出。
            </span>
            <button
              type="button"
              style={styles.btnPrimary}
              onClick={handleFinishExecution}
              data-testid="mb-execution-finish"
            >
              完成实现，进入规范
            </button>
          </div>
        </div>
      )}

      {stage === 'standards' && (
        <MB3StandardsPanel
          sessionId={sessionId}
          onSubmit={handleStandardsSubmit}
        />
      )}

      {stage === 'audit' && (
        <ViolationAuditPanel
          sessionId={sessionId}
          violationExamples={moduleContent.violationExamples}
          rulesContent={standards?.rulesContent ?? ''}
          onSubmit={handleAuditSubmit}
        />
      )}

      {stage === 'complete' && (
        <section style={styles.completeCard} data-testid="mb-complete">
          <h2 style={styles.completeTitle}>Module B 已完成</h2>
          <p style={styles.completeBody}>
            Stage 1-4 全部提交。下一模块将开启自我评估或 Module C / D
            （取决于套件配置）。
          </p>
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={advance}
            data-testid="mb-advance"
          >
            进入下一模块
          </button>
        </section>
      )}
    </div>
  );

  return bare ? body : <ModuleShell>{body}</ModuleShell>;
};

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    height: '100%',
    minHeight: 0,
  },
  stageBar: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'center',
    padding: `${spacing.sm} ${spacing.md}`,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
  },
  stagePill: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: `${colors.mauve}22`,
    color: colors.mauve,
    borderRadius: radii.full,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
    letterSpacing: '0.5px',
  },
  stageLabel: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    color: colors.text,
  },
  executionWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
    flex: 1,
    minHeight: 0,
  },
  executionLayout: {
    flex: 1,
    minHeight: 480,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  executionFooter: {
    display: 'flex',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    backgroundColor: colors.mantle,
    borderRadius: radii.md,
    border: `1px solid ${colors.surface0}`,
  },
  executionHint: {
    fontSize: fontSizes.xs,
    color: colors.subtext0,
    flex: 1,
  },
  completeCard: {
    backgroundColor: colors.mantle,
    border: `1px solid ${colors.surface0}`,
    borderRadius: radii.lg,
    padding: spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    alignItems: 'flex-start',
    maxWidth: 560,
  },
  completeTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  completeBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  btnPrimary: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.blue,
    color: colors.crust,
    border: 'none',
    borderRadius: radii.md,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
