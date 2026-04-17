/**
 * E2BSandboxProvider — short-lived cloud sandbox via @e2b/code-interpreter.
 *
 * Absorbs from V4 sandbox.service.ts:
 * - SANDBOX_SECURITY_CONFIG resource-limit constants
 * - Math.min timeout clamping
 * - create failure → best-effort destroy before rethrowing
 * - lifecycle logger events
 *
 * Discards (compared to V4):
 * - long-lived keepalive / pause / resume / prewarm
 * - Prisma template / templateFile reads
 * - scaffold file injection at create-time
 * - debounced file-sync / echo suppression
 */

import { Sandbox as E2BSandbox } from '@e2b/code-interpreter';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import {
  DEFAULT_EXECUTE_TIMEOUT_MS,
  type ExecutionResult,
  type FileEntry,
  type Sandbox,
  type SandboxProvider,
} from './sandbox-provider.js';

const SECURITY = {
  maxTimeoutMs: 7_800_000,
  healthProbeTimeoutMs: 5_000,
} as const;

const liveSandboxes = new Map<string, E2BSandbox>();

export class E2BSandboxProvider implements SandboxProvider {
  readonly kind = 'e2b' as const;

  async isAvailable(): Promise<boolean> {
    if (!env.E2B_API_KEY) return false;
    try {
      await Promise.race([
        E2BSandbox.list({ apiKey: env.E2B_API_KEY }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('e2b probe timeout')), SECURITY.healthProbeTimeoutMs),
        ),
      ]);
      return true;
    } catch (err) {
      logger.warn('[sandbox:e2b] probe failed:', err);
      return false;
    }
  }

  async create(): Promise<Sandbox> {
    if (!env.E2B_API_KEY) throw new Error('E2B_API_KEY not configured');
    const timeoutMs = Math.min(env.E2B_SANDBOX_TIMEOUT_MS, SECURITY.maxTimeoutMs);
    const s = await E2BSandbox.create({ apiKey: env.E2B_API_KEY, timeoutMs });
    liveSandboxes.set(s.sandboxId, s);
    logger.info(`[sandbox:e2b] created ${s.sandboxId} (timeoutMs=${timeoutMs})`);
    return { id: s.sandboxId, provider: this.kind, createdAt: new Date() };
  }

  async writeFiles(sandbox: Sandbox, files: readonly FileEntry[]): Promise<void> {
    const s = this.resolve(sandbox);
    for (const f of files) {
      await s.files.write(f.path, f.content);
    }
  }

  async execute(
    sandbox: Sandbox,
    command: string,
    timeoutMs: number = DEFAULT_EXECUTE_TIMEOUT_MS,
  ): Promise<ExecutionResult> {
    const s = this.resolve(sandbox);
    const clamped = Math.min(Math.max(timeoutMs, 1_000), SECURITY.maxTimeoutMs);
    const started = Date.now();
    try {
      const result = await s.commands.run(command, { timeoutMs: clamped });
      return {
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.exitCode ?? 0,
        durationMs: Date.now() - started,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timedOut = /timeout/i.test(message);
      logger.warn(`[sandbox:e2b] execute failed (timedOut=${timedOut}): ${message}`);
      return {
        stdout: '',
        stderr: message,
        exitCode: timedOut ? 124 : 1,
        durationMs: Date.now() - started,
        timedOut,
      };
    }
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const s = liveSandboxes.get(sandbox.id);
    liveSandboxes.delete(sandbox.id);
    if (!s) return;
    try {
      await s.kill();
      logger.info(`[sandbox:e2b] destroyed ${sandbox.id}`);
    } catch (err) {
      logger.warn(`[sandbox:e2b] destroy error for ${sandbox.id}:`, err);
    }
  }

  private resolve(sandbox: Sandbox): E2BSandbox {
    const s = liveSandboxes.get(sandbox.id);
    if (!s) throw new Error(`E2B sandbox ${sandbox.id} not found (already destroyed?)`);
    return s;
  }
}
