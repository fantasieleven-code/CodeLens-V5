export interface SandboxInfo {
  sandboxId: string;
  sessionId: string;
  status: 'CREATING' | 'READY' | 'CONNECTED' | 'DISCONNECTED' | 'KILLED';
  createdAt: Date;
  timeoutAt: Date;
}

export interface FileState {
  path: string;
  content: string;
  lastModified: Date;
  version: number; // AR-2: monotonically increasing per-file version
}

export interface PtyOptions {
  cols?: number;
  rows?: number;
}

export interface SandboxCreateOptions {
  sessionId: string;
  templateId: string;
  timeoutMs?: number;
  /** M1-2: Pre-resolved template variables to apply before writing files */
  resolvedVariables?: Record<string, string | number>;
}
