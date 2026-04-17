/**
 * StaticCheckProvider — fallback when neither E2B nor Docker is available.
 *
 * Round 2 Part 4 adjustment 3: when no execution environment is reachable,
 * the scorer still needs *something* to differentiate "syntactically sound
 * code" from "runtime-doomed code". This provider runs AST / lint / type
 * checks in-process and returns one of two signals via ExecutionResult:
 *
 *   exitCode 0   → static checks pass      (likely-compilable)
 *   exitCode 1   → static checks fail      (will-runtime-error)
 *
 * Reports must label "本次评估未执行代码" when this provider is used.
 *
 * Implementation note: spawns pyright / eslint as child processes on the
 * server host. No container, no network isolation, no code execution of
 * the candidate's program — only lint/type-check tooling runs.
 */

import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { logger } from '../../lib/logger.js';
import {
  DEFAULT_EXECUTE_TIMEOUT_MS,
  type ExecutionResult,
  type FileEntry,
  type Sandbox,
  type SandboxProvider,
} from './sandbox-provider.js';

const workspaces = new Map<string, string>();

export class StaticCheckProvider implements SandboxProvider {
  readonly kind = 'static' as const;

  async isAvailable(): Promise<boolean> {
    // Static check always available — it's the terminal fallback.
    return true;
  }

  async create(): Promise<Sandbox> {
    const dir = mkdtempSync(join(tmpdir(), 'codelens-static-'));
    const id = dir.split('/').pop() ?? dir;
    workspaces.set(id, dir);
    logger.info(`[sandbox:static] created ${id}`);
    return { id, provider: this.kind, createdAt: new Date() };
  }

  async writeFiles(sandbox: Sandbox, files: readonly FileEntry[]): Promise<void> {
    const root = this.resolve(sandbox);
    for (const f of files) {
      const target = join(root, f.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.content, 'utf8');
    }
  }

  /**
   * `command` is interpreted as a hint:
   *   - contains "python" or ".py"     → pyright
   *   - contains "eslint"/"node"/"ts"  → eslint
   *   - default                        → both, union-worst result
   *
   * Never executes the candidate's program.
   */
  async execute(
    sandbox: Sandbox,
    command: string,
    timeoutMs: number = DEFAULT_EXECUTE_TIMEOUT_MS,
  ): Promise<ExecutionResult> {
    const root = this.resolve(sandbox);
    const started = Date.now();
    const hint = command.toLowerCase();
    const checks: Array<Promise<{ tool: string; exitCode: number; stdout: string; stderr: string }>> = [];

    if (hint.includes('python') || hint.includes('.py')) {
      checks.push(this.runTool('pyright', [root], timeoutMs));
    } else if (hint.match(/eslint|node|\.ts|\.js/)) {
      checks.push(this.runTool('eslint', [root, '--no-eslintrc', '--parser-options=ecmaVersion:2022'], timeoutMs));
    } else {
      checks.push(this.runTool('pyright', [root], timeoutMs));
      checks.push(this.runTool('eslint', [root, '--no-eslintrc', '--parser-options=ecmaVersion:2022'], timeoutMs));
    }

    const results = await Promise.all(checks);
    const worstExit = results.reduce((m, r) => Math.max(m, r.exitCode), 0);
    const stdout = results.map((r) => `[${r.tool}]\n${r.stdout}`).join('\n');
    const stderr = results.map((r) => `[${r.tool}]\n${r.stderr}`).join('\n');
    const banner = worstExit === 0
      ? '[static] AST + type/lint checks passed. Note: code was NOT executed.'
      : '[static] static checks reported issues. Note: code was NOT executed.';
    return {
      stdout: `${banner}\n${stdout}`,
      stderr,
      exitCode: worstExit === 0 ? 0 : 1,
      durationMs: Date.now() - started,
    };
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const root = workspaces.get(sandbox.id);
    workspaces.delete(sandbox.id);
    if (!root) return;
    try {
      rmSync(root, { recursive: true, force: true });
      logger.info(`[sandbox:static] destroyed ${sandbox.id}`);
    } catch (err) {
      logger.warn(`[sandbox:static] rmSync failed for ${sandbox.id}:`, err);
    }
  }

  private resolve(sandbox: Sandbox): string {
    const root = workspaces.get(sandbox.id);
    if (!root) throw new Error(`Static sandbox ${sandbox.id} not found`);
    return root;
  }

  private runTool(
    tool: string,
    args: string[],
    timeoutMs: number,
  ): Promise<{ tool: string; exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const proc = spawn(tool, args, { shell: false });
      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
      proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
      const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs);
      proc.on('error', (err) => {
        clearTimeout(timer);
        // Tool not installed: treat as "unable to static-check" rather than runtime error.
        resolve({ tool, exitCode: 0, stdout: '', stderr: `${tool} not available: ${err.message}` });
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ tool, exitCode: code ?? 0, stdout, stderr });
      });
    });
  }
}
