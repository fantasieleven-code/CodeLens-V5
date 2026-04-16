import type { AIStreamChunk } from './ai.js';
import type { FileState } from './sandbox.js';
import type { TimerState, CheckpointTransition } from './session.js';
import type { V5ModuleCAnswer } from './v5-submissions.js';

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
  'behavior:batch': (data: {
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
  // v5: MB Cursor mode — payload skeletons; Task 5 MB backend iterates fields.
  'v5:mb:chat_generate': (data: V5MBChatGeneratePayload, ack: (ok: boolean) => void) => void;
  'v5:mb:completion_request': (data: V5MBCompletionRequestPayload, ack: (ok: boolean) => void) => void;
  'v5:mb:file_change': (data: V5MBFileChangePayload) => void;
  'v5:mb:run_test': (data: V5MBRunTestPayload, ack: (ok: boolean) => void) => void;
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

/**
 * MB Cursor-mode socket payload skeletons. Task 5 MB backend iterates
 * concrete fields (prompt templates, cursor context, selection state, etc.).
 */
export interface V5MBChatGeneratePayload {
  prompt: string;
}

export interface V5MBCompletionRequestPayload {
  filePath: string;
  cursorOffset: number;
}

export interface V5MBFileChangePayload {
  filePath: string;
  content: string;
}

export interface V5MBRunTestPayload {
  testCommand?: string;
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
