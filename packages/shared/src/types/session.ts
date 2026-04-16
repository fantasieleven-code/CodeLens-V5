export type SessionStatus =
  | 'CREATED'
  | 'SANDBOX_READY'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'ERROR';

export type CheckpointStatus = 'LOCKED' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED';

export interface Session {
  id: string;
  candidateId: string;
  templateId: string;
  status: SessionStatus;
  sandboxId: string | null;
  currentCheckpoint: number;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionCreateInput {
  candidateId: string;
  templateId: string;
  durationMinutes?: number;
}

/** Checkpoint timing from the interview flow spec (70 min total) */
export interface CheckpointTiming {
  index: number;
  title: string;
  durationMs: number;
  startOffsetMs: number; // offset from session start
}

/** Full checkpoint state sent to client */
export interface CheckpointState {
  index: number;
  status: CheckpointStatus;
  title: string;
  durationMs: number;
  elapsedMs: number;
  remainingMs: number;
}

/** Session timer state sent to client */
export interface TimerState {
  totalDurationMs: number;
  elapsedMs: number;
  remainingMs: number;
  currentCheckpoint: number;
  checkpoints: CheckpointState[];
  warningAt3Min: boolean;
}

/** Checkpoint transition event */
export interface CheckpointTransition {
  from: number;
  to: number;
  reason: 'manual' | 'timeout' | 'auto';
  timestamp: Date;
}

/** File snapshot for checkpoint boundaries */
export interface FileSnapshot {
  path: string;
  content: string;
  timestamp: Date;
}
