import type { AIStreamChunk } from './ai.js';
import type { FileState } from './sandbox.js';
import type { TimerState, CheckpointTransition } from './session.js';
import type { V5MBAudit, V5MBPlanning, V5MBSubmission, V5ModuleASubmission, V5ModuleCAnswer, V5ModuleDSubmission, V5Phase0Submission, V5ProbeStrategy } from './v5-submissions.js';

// Client → Server events
export interface ClientToServerEvents {
  'file:save': (data: { path: string; content: string; baseVersion: number }, ack: (ok: boolean) => void) => void;
  'pty:input': (data: { input: string }) => void;
  'pty:resize': (data: { cols: number; rows: number }) => void;
  'ai:message': (
    data: { message: string; role?: string },
    ack: (ok: boolean) => void,
  ) => void;
  'signal:batch': (data: { signals: Array<{ type: string; value: number; context?: Record<string, unknown> }> }) => void;
  'checkpoint:next': (ack: (ok: boolean) => void) => void;
  'session:start': (ack: (ok: boolean) => void) => void;
  'session:pause': (ack: (ok: boolean) => void) => void;
  'session:resume': (ack: (ok: boolean) => void) => void;
  'session:end': (ack: (ok: boolean) => void) => void;
  // v3: Module-based events
  'module:next': (ack: (ok: boolean) => void) => void;
  'micro-verify:submit': (
    data: { verificationId: string; answer: string; durationSeconds: number },
    ack: (ok: boolean) => void,
  ) => void;
  /**
   * High-volume telemetry batch from useBehaviorTracker. Server dispatches by
   * event.type and persists into session.metadata.mb.editorBehavior.* — see
   * packages/server/src/socket/behavior-handlers.ts (Task 22).
   *
   * sessionId is in the envelope (not per-event) because (a) every batch
   * belongs to exactly one session and (b) the server has no socket-level
   * session middleware (no io.use binding), so the client must pass it.
   * Pattern C #5: keep the legacy event name `behavior:batch` (no `v5:mb:`
   * prefix) because client + server already use it; renaming would touch
   * 4 modules with no production benefit.
   */
  'behavior:batch': (data: {
    sessionId: string;
    events: Array<{ type: string; timestamp: string; payload: Record<string, unknown> }>;
  }) => void;
  /**
   * Task 24 — Cluster D self-assess submit. Frontend SelfAssessPage emits a
   * V4-legacy field set (`selfConfidence` 0-100, `selfIdentifiedRisk`,
   * `responseTimeMs`) that the server normalizes to V5SelfAssessSubmission
   * before persist (see `packages/server/src/socket/self-assess-handlers.ts`).
   * `sessionId` was added in Task 24 (Option C) so the handler has a target
   * for `metadata.selfAssess.*` writes — the server has no socket-level
   * session middleware (Task 15 will add it). The dual-shape bridge between
   * the V4 socket payload and V5SelfAssessSubmission is V5.0.5 cleanup.
   */
  'self-assess:submit': (
    data: {
      sessionId: string;
      selfConfidence: number;
      selfIdentifiedRisk?: string;
      responseTimeMs: number;
    },
    ack: (ok: boolean) => void,
  ) => void;
  /**
   * Task 25 — Cluster C-P0 persist closer. Phase0Page (Task 9 client) currently
   * persists locally via setModuleSubmissionLocal but never reaches the server,
   * so all 5 P0 signals (sBaselineReading TJ, sTechProfile / sDecisionStyle /
   * sAiCalibration METACOGNITION, sAiClaimDetection TJ) score null at the
   * orchestrator. This event closes that gap by writing
   * `metadata.phase0.*` directly so signals can read non-null at scoring time.
   *
   * V5-native shape (no V4 bridge): Phase0Page builds V5Phase0Submission
   * directly, so unlike Task 24's `self-assess:submit` (V4→V5 normalize) the
   * server can persist as-is via strict field pick. The V5.0.5 cleanup item
   * referenced in `self-assess:submit` does not apply here.
   *
   * Naming: lowercase-hyphen `phase0:submit` matches `self-assess:submit`
   * convention (Task 24). The `v5:` prefix is reserved for per-module
   * multi-event namespaces (`v5:mb:*`, `v5:modulec:*`); P0 has a single event
   * and follows the flat-event convention.
   *
   * `sessionId` in envelope (Task 24 Option C lineage): server has no
   * socket-level session middleware until Task 15, so the client must pass it.
   *
   * Ack contract: `(ok: boolean) => void` — matches `self-assess:submit` /
   * `v5:mb:submit` ack shape verbatim. `ok=false` is reserved for explicit
   * server failures (validation, persist throw).
   */
  'phase0:submit': (
    data: { sessionId: string; submission: V5Phase0Submission },
    ack: (ok: boolean) => void,
  ) => void;
  /**
   * Task 26 — Cluster C-MA persist closer. ModuleAPage (Task 9 client) currently
   * persists locally via setModuleSubmissionLocal but never reaches the server,
   * so all 10 MA signals (sArgumentResilience / sContextQuality /
   * sCriticalThinking / sDiagnosisAccuracy / sPrincipleAbstraction /
   * sReasoningDepth / sSchemeJudgment TJ ×7, plus sCodeReviewQuality /
   * sHiddenBugFound / sReviewPrioritization CQ ×3) score null at the
   * orchestrator. This event closes that gap by writing `metadata.moduleA.*`
   * directly so signals can read non-null at scoring time.
   *
   * V5-native shape (no V4 bridge, Phase 1 Q6(a)): ModuleAPage builds
   * V5ModuleASubmission directly, so the server persists as-is via strict
   * field pick (Task 23/24/25 lineage). Task 24's V4→V5 normalize is not
   * applicable here.
   *
   * Single final submit (Phase 1 Q2 — Mode C): the 4 rounds are collected
   * client-side and submitted once from `handleFinalSubmit` after round 4.
   * This is why the event is singular `moduleA:submit`, not per-round
   * (`moduleA:round1:submit` etc. — earlier brief mentioned per-round; Phase 1
   * grep of `ModuleAPage.tsx:174-222` confirmed single emit boundary).
   *
   * Naming: lowercase-hyphen `moduleA:submit` matches `phase0:submit` and
   * `self-assess:submit` convention. Picked `moduleA:submit` (not `ma:submit`)
   * to read clearly alongside `moduleC:*` (v5:modulec) and to avoid confusion
   * with the `ma` signal file prefix (`signals/ma/s-scheme-judgment`).
   *
   * `sessionId` in envelope (Task 24 Option C lineage): server has no
   * socket-level session middleware until Task 15, so the client must pass it.
   *
   * Ack contract: `(ok: boolean) => void` — matches `phase0:submit` /
   * `self-assess:submit` / `v5:mb:submit` verbatim. `ok=false` reserved for
   * explicit server failures (zod 4-round validation, persist throw).
   *
   * Hydrator contract lock (Task 15 owner awareness): server writes to
   * `metadata.moduleA.*` top-level, NOT `metadata.submissions.moduleA.*`
   * (pre-Task 22 D-2 namespace, only referenced by archived V4
   * `mc-probe-engine.ts`). Task 15 Admin API hydration must read from the
   * same top-level path.
   */
  'moduleA:submit': (
    data: { sessionId: string; submission: V5ModuleASubmission },
    ack: (ok: boolean) => void,
  ) => void;
  /**
   * Task 27 — Cluster C-MD persist closer (final cluster). ModuleDPage (Task 9
   * client) currently persists locally via setModuleSubmissionLocal but never
   * reaches the server, so all 4 MD signals (sAiOrchestrationQuality AE,
   * sConstraintIdentification / sDesignDecomposition / sTradeoffArticulation SD ×3)
   * score null at the orchestrator. This event closes that gap by writing
   * `metadata.moduleD.*` directly so signals can read non-null at scoring time.
   * Post-Task 27: 41/47 = 87.2% signal coverage; AE dimension 0→1, SD 0→3 — all
   * 6 V5 dimensions become non-empty (radar production-ready).
   *
   * V5-native shape (Phase 1 Q1 / D3): live V5ModuleDSubmission has 6 required
   * fields (subModules, interfaceDefinitions, dataFlowDescription,
   * constraintsSelected, tradeoffText, aiOrchestrationPrompts). The design doc
   * mentions 8 fields (challengeResponse, designRevision) but those never
   * shipped to the live shape — Task 27 mirrors the live shape, not the doc
   * (Pattern D-2 lineage: Task 26 round4 precedent of trusting the live type
   * over earlier design intent).
   *
   * Naming (Phase 1 Q3 / D1): lowercase-hyphen `moduleD:submit` matches
   * `moduleA:submit` / `phase0:submit` / `self-assess:submit` convention.
   * The earlier glossary entry `v5:md:submit` (L247-248, never wired) is
   * superseded by this declaration — consistency with the lowercase-hyphen
   * Cluster C lineage outweighs the historical placeholder.
   *
   * Single final submit (Phase 1 Q2 — Mode C): ModuleDPage builds the full
   * 6-field submission client-side and emits once from `handleSubmit` after
   * the candidate confirms. No per-section emits.
   *
   * `sessionId` in envelope (Task 24 Option C lineage): server has no
   * socket-level session middleware until Task 15, so the client must pass it.
   *
   * Ack contract: `(ok: boolean) => void` — matches `moduleA:submit` /
   * `phase0:submit` / `self-assess:submit` / `v5:mb:submit` verbatim.
   * `ok=false` reserved for explicit server failures (zod 6-field validation,
   * persist throw).
   *
   * Hydrator contract lock (Task 15 owner awareness): server writes to
   * `metadata.moduleD.*` top-level (Task 22-26 lineage), NOT
   * `metadata.submissions.moduleD.*` (pre-Task 22 D-2 namespace, only
   * referenced by archived V4 `mc-probe-engine.ts`). Task 15 Admin API
   * hydration must read from the same top-level path.
   *
   * LLM whitelist (Phase 1 Q4): 3 of 4 MD signals route through the
   * `gradeWithLLM` helper (sAiOrchestrationQuality / sDesignDecomposition /
   * sTradeoffArticulation); 1 is pure rule (sConstraintIdentification).
   * Persist contract is identical for both — the LLM split lives in
   * `signals/md/*` and does not affect this event shape.
   */
  'moduleD:submit': (
    data: { sessionId: string; submission: V5ModuleDSubmission },
    ack: (ok: boolean) => void,
  ) => void;
  // v5: ModuleC — multi-event namespace. `answer` carries sessionId because
  // sockets still have no session middleware; metadata persists only the
  // V5ModuleCAnswer fields.
  'v5:modulec:start': (data: V5ModuleCStartPayload, ack: (ok: boolean) => void) => void;
  'v5:modulec:answer': (data: V5ModuleCAnswerPayload, ack: (ok: boolean) => void) => void;
  'v5:modulec:complete': (data: V5ModuleCCompletePayload, ack: (ok: boolean) => void) => void;
  // v5: MB Cursor mode — shapes mirror packages/server/src/socket/mb-handlers.ts
  // exactly. mb-handlers uses `safe()` which emits `{event}:error` on failure
  // instead of acks, so client emits are fire-and-forget (no ack parameter).
  'v5:mb:chat_generate': (data: V5MBChatGeneratePayload) => void;
  'v5:mb:completion_request': (data: V5MBCompletionRequestPayload) => void;
  'v5:mb:file_change': (data: V5MBFileChangePayload) => void;
  'v5:mb:run_test': (data: V5MBRunTestPayload) => void;
  'v5:mb:planning:submit': (data: V5MBPlanningSubmitPayload) => void;
  'v5:mb:standards:submit': (data: V5MBStandardsSubmitPayload) => void;
  'v5:mb:audit:submit': (data: V5MBAuditSubmitPayload) => void;
  /** Round 2 Part 3 调整 4 (v5-design-clarifications.md L550-588). */
  'v5:mb:visibility_change': (data: V5MBVisibilityChangePayload) => void;
  /**
   * Task 23 — full MB submission persist. Server handler MUST destructure
   * `editorBehavior` out and skip persisting it; that pipeline is owned by
   * `behavior:batch` (Task 22). Pattern H v2.2 cross-Task regression defense:
   * the client builds V5MBSubmission with hardcoded EMPTY editorBehavior
   * arrays (ModuleBPage.tsx), so a naive spread-merge here would silently
   * clobber Task 22's persisted aiCompletionEvents.
   */
  'v5:mb:submit': (data: V5MBSubmitPayload, ack: (ok: boolean) => void) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'file:saved': (data: { path: string; version: number }) => void;
  'file:external_change': (data: FileState) => void;
  'file:init': (data: { files: FileState[] }) => void;
  'file:conflict': (data: { path: string; serverVersion: number; serverContent: string }) => void;
  'pty:output': (data: { output: string }) => void;
  'ai:chunk': (data: AIStreamChunk) => void;
  'ai:error': (data: { message: string }) => void;
  'checkpoint:changed': (data: { index: number; total: number; title: string }) => void;
  'checkpoint:transition': (data: CheckpointTransition) => void;
  'checkpoint:overtime': (data: { index: number }) => void;
  'timer:sync': (data: TimerState) => void;
  'timer:warning': (data: { message: string; remainingMs: number }) => void;
  'session:status': (data: { status: string; schemaVersion?: number; degraded?: boolean }) => void;
  'session:expired': () => void;
  'reconnect:state': (data: ReconnectState) => void;
  'voice:status': (data: VoiceStatus) => void;
  'voice:subtitle': (data: { speaker: string; text: string; definite: boolean }) => void;
  // v3: Module-based events
  'module:transition': (data: ModuleTransition) => void;
  'issue:status-update': (data: { issueId: string; status: string; completedAt?: string }) => void;
  'micro-verify:trigger': (data: {
    verificationId: string; question: string; questionType: 'locate' | 'reason'; timeoutSeconds: number;
  }) => void;
  'micro-verify:result': (data: { verificationId: string; confidenceScore: number }) => void;
  'self-assess:trigger': () => void;
  // v5: MB Cursor mode responses — shapes mirror packages/server/src/socket/mb-handlers.ts
  // exact emit calls. Error frames use the `{event}:error` convention from the
  // safe() wrapper (e.g. `v5:mb:run_test:error`) and are not typed individually.
  'v5:mb:chat_stream': (data: V5MBChatStreamPayload) => void;
  'v5:mb:chat_complete': (data: V5MBChatCompletePayload) => void;
  'v5:mb:completion_response': (data: V5MBCompletionResponsePayload) => void;
  'v5:mb:test_result': (data: V5MBTestResultPayload) => void;
}

export interface ModuleTransition {
  from: string | null;
  to: string;
  tier: string;
  modules: Array<{ id: string; status: string }>;
}

export interface VoiceStatus {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  mode: 'ark' | 'custom';
}

// Inter-server events (Socket.IO internal)
export interface InterServerEvents {
  ping: () => void;
}

// Socket data (attached to each socket)
export interface SocketData {
  sessionId: string;
  candidateId: string;
  role: 'candidate' | 'admin';
}

// ─── V5 socket event payloads ───

/** Client → Server: ack that candidate entered ModuleC. */
export interface V5ModuleCStartPayload {
  moduleKey: 'moduleC';
}

/** Client → Server: candidate finished ModuleC. */
export interface V5ModuleCCompletePayload {
  moduleKey: 'moduleC';
  finishedAt: Date;
}

export type V5ModuleCAnswerPayload = V5ModuleCAnswer & {
  sessionId: string;
  probeStrategy: V5ProbeStrategy;
};

// ─── MB Cursor-mode payloads ───
//
// Every Client → Server payload carries `sessionId` because the mb-handlers
// `safe()` wrapper has no per-socket auth yet (Task 15). Shapes mirror the
// `*Payload` interfaces declared at the top of
// packages/server/src/socket/mb-handlers.ts so that client and server stay
// aligned without either side importing the other's private types.

export interface V5MBChatGeneratePayload {
  sessionId: string;
  prompt: string;
  filesContext: string;
}

export interface V5MBCompletionRequestPayload {
  sessionId: string;
  filePath: string;
  content: string;
  line: number;
  column: number;
}

export interface V5MBFileChangePayload {
  sessionId: string;
  filePath: string;
  content: string;
  source: 'manual_edit' | 'ai_chat' | 'ai_completion';
}

export interface V5MBRunTestPayload {
  sessionId: string;
}

export interface V5MBPlanningSubmitPayload {
  sessionId: string;
  planning: V5MBPlanning;
}

export interface V5MBStandardsSubmitPayload {
  sessionId: string;
  rulesContent: string;
  agentContent?: string;
}

export interface V5MBAuditSubmitPayload {
  sessionId: string;
  violations: V5MBAudit['violations'];
}

/**
 * Round 2 Part 3 调整 4 — tab visibility transitions appended to
 * metadata.mb.editorBehavior.documentVisibilityEvents so sDecisionLatencyQuality
 * can compute document-visible time slices for chat/completion decisions.
 */
export interface V5MBVisibilityChangePayload {
  sessionId: string;
  timestamp: number;
  hidden: boolean;
}

/**
 * Task 23 — Cluster B persistToMetadata pipeline closer.
 *
 * `submission` is the full V5MBSubmission shape so the server can persist
 * `mb.planning / standards / audit / finalFiles / finalTestPassRate` and
 * unblock 3 Cluster B signals (sIterationEfficiency AE, sChallengeComplete CQ,
 * sPrecisionFix AE). Server MUST omit `submission.editorBehavior` from the
 * persist write — that pipeline is owned by `behavior:batch` (Task 22) and
 * the client sends empty arrays in this field.
 */
export interface V5MBSubmitPayload {
  sessionId: string;
  submission: V5MBSubmission;
}

// ─── MB Cursor-mode server responses ───
//
// Shapes mirror `socket.emit(...)` calls in mb-handlers.ts verbatim. Keep in
// sync if either side changes.

/** Streamed token chunk during chat_generate. `content` is the delta, not the total. */
export interface V5MBChatStreamPayload {
  content: string;
  done: boolean;
}

/** Emitted once after the stream finishes. `diff` is the accumulated text. */
export interface V5MBChatCompletePayload {
  diff: string;
}

/** Non-streaming inline-completion result (qwen3-coder-base, maxTokens=50). */
export interface V5MBCompletionResponsePayload {
  completion: string;
}

/** pytest -v result from the short-lived sandbox. `passRate ∈ [0,1]`. */
export interface V5MBTestResultPayload {
  stdout: string;
  stderr: string;
  exitCode: number;
  passRate: number;
  durationMs: number;
}

export interface ReconnectState {
  files: FileState[];
  ptyBuffer: string;
  currentCheckpoint: number;
  sessionStatus: string;
  // AR-8: Extended state for full recovery
  timer?: TimerState;
  degraded?: boolean;
  aiHistory?: {
    interviewer: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
    assistant: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  };
  schemaVersion?: number;
  v3Modules?: Array<{ id: string; status: string; startedAt?: string; completedAt?: string }>;
  v3Tier?: string;
}
