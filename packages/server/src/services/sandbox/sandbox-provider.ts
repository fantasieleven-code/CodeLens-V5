/**
 * SandboxProvider — V5 sandbox abstraction.
 *
 * Short-lived sandbox model: create → writeFiles → execute → destroy,
 * P95 < 15s. No long-lived sessions, no pty, no pause/resume.
 * Three implementations: E2B (remote) → Docker (self-hosted) → Static (no execution).
 */

export type ProviderKind = 'e2b' | 'docker' | 'static';

export interface Sandbox {
  id: string;
  provider: ProviderKind;
  createdAt: Date;
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  /** True if the runner killed the process due to timeout. */
  timedOut?: boolean;
}

export interface SandboxProvider {
  readonly kind: ProviderKind;

  /** Probe whether this provider can accept traffic right now. */
  isAvailable(): Promise<boolean>;

  create(): Promise<Sandbox>;

  writeFiles(sandbox: Sandbox, files: readonly FileEntry[]): Promise<void>;

  /** @param timeoutMs hard kill; provider must enforce. Default 30_000. */
  execute(sandbox: Sandbox, command: string, timeoutMs?: number): Promise<ExecutionResult>;

  destroy(sandbox: Sandbox): Promise<void>;
}

export const DEFAULT_EXECUTE_TIMEOUT_MS = 30_000;
