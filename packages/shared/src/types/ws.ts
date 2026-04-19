import type { AIStreamChunk } from './ai.js';
import type { FileState } from './sandbox.js';
import type { TimerState, CheckpointTransition } from './session.js';
import type { V5MBAudit, V5MBPlanning, V5ModuleCAnswer } from './v5-submissions.js';

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
  'self-assess:submit': (
    data: { selfConfidence: number; selfIdentifiedRisk?: string; responseTimeMs: number },
    ack: (ok: boolean) => void,
  ) => void;
  // v5: ModuleC — server handler in Task 11.
  'v5:modulec:start': (data: V5ModuleCStartPayload, ack: (ok: boolean) => void) => void;
  'v5:modulec:answer': (data: V5ModuleCAnswer, ack: (ok: boolean) => void) => void;
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
