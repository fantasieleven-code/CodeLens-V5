/**
 * DockerSandboxProvider — short-lived self-hosted sandbox via dockerode.
 *
 * Absorbs from V4 docker-sandbox.ts:
 * - HostConfig: Memory=2GB, MemorySwap=Memory, NanoCpus=1 CPU, PidsLimit=256
 * - NetworkMode: 'none', CapDrop ['ALL'], no-new-privileges, Init: true (tini)
 * - Tmpfs /tmp
 * - execute timeout combo (setTimeout → stream.destroy() + demux stderr)
 * - OOM detection (exit 137 → explicit error in stderr)
 * - destroy cleanup order: stop → remove; idempotent
 *
 * Discards:
 * - E2B drop-in shim (files.write via exec + mkdir)
 * - pty.create / sendInput / resize
 * - pause / connect / reuse
 * - stage2Running guard (V5 short-lived)
 */

// @ts-expect-error dockerode types not installed; Docker provider optional
import Docker from 'dockerode';
import { PassThrough } from 'stream';
import { logger } from '../../lib/logger.js';
import {
  DEFAULT_EXECUTE_TIMEOUT_MS,
  type ExecutionResult,
  type FileEntry,
  type Sandbox,
  type SandboxProvider,
} from './sandbox-provider.js';

const DEFAULT_IMAGE = 'codelens-sandbox-python:latest';
const WORKDIR = '/home/candidate/project';

const LIMITS = {
  Memory: 2 * 1024 * 1024 * 1024,
  MemorySwap: 2 * 1024 * 1024 * 1024,
  NanoCpus: 1e9,
  PidsLimit: 256,
} as const;

const liveContainers = new Map<string, unknown>();

type DockerCtor = new (opts: { socketPath: string }) => unknown;
let dockerClient: unknown = null;

function getDocker(): unknown {
  if (!dockerClient) {
    dockerClient = new (Docker as DockerCtor)({ socketPath: '/var/run/docker.sock' });
  }
  return dockerClient;
}

/** Test seam: allow unit tests to inject a fake dockerode client. */
export function __setDockerClientForTests(client: unknown): void {
  dockerClient = client;
  if (!client) liveContainers.clear();
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly kind = 'docker' as const;

  async isAvailable(): Promise<boolean> {
    try {
      const client = getDocker() as { ping: () => Promise<unknown> };
      await client.ping();
      return true;
    } catch (err) {
      logger.warn('[sandbox:docker] ping failed:', err);
      return false;
    }
  }

  async create(): Promise<Sandbox> {
    const client = getDocker() as {
      createContainer: (opts: unknown) => Promise<{
        id: string;
        start: () => Promise<void>;
        remove: (opts: { force: boolean }) => Promise<void>;
      }>;
    };
    const container = await client.createContainer({
      Image: DEFAULT_IMAGE,
      Tty: false,
      OpenStdin: true,
      WorkingDir: WORKDIR,
      HostConfig: {
        Memory: LIMITS.Memory,
        MemorySwap: LIMITS.MemorySwap,
        NanoCpus: LIMITS.NanoCpus,
        PidsLimit: LIMITS.PidsLimit,
        NetworkMode: 'none',
        ReadonlyRootfs: false,
        Init: true,
        SecurityOpt: ['no-new-privileges'],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
        Tmpfs: { '/tmp': 'size=100m,noexec' },
      },
      Labels: {
        'codelens.sandbox': 'true',
        'codelens.created': new Date().toISOString(),
      },
    });
    try {
      await container.start();
    } catch (err) {
      await this.safeRemove(container);
      throw err;
    }
    const id = container.id.substring(0, 12);
    liveContainers.set(id, container);
    logger.info(`[sandbox:docker] created ${id}`);
    return { id, provider: this.kind, createdAt: new Date() };
  }

  async writeFiles(sandbox: Sandbox, files: readonly FileEntry[]): Promise<void> {
    for (const f of files) {
      const fullPath = f.path.startsWith('/') ? f.path : `${WORKDIR}/${f.path}`;
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      const escaped = f.content.replace(/'/g, "'\\''");
      const cmd = `mkdir -p '${dir}' && printf '%s' '${escaped}' > '${fullPath}.tmp' && mv '${fullPath}.tmp' '${fullPath}'`;
      const result = await this.execRaw(sandbox, cmd, { timeoutMs: 5_000 });
      if (result.exitCode !== 0) {
        throw new Error(`writeFiles failed for ${f.path}: ${result.stderr}`);
      }
    }
  }

  async execute(
    sandbox: Sandbox,
    command: string,
    timeoutMs: number = DEFAULT_EXECUTE_TIMEOUT_MS,
  ): Promise<ExecutionResult> {
    return this.execRaw(sandbox, command, { timeoutMs });
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const container = liveContainers.get(sandbox.id) as
      | { stop: (opts: { t: number }) => Promise<void>; remove: (opts: { force: boolean }) => Promise<void> }
      | undefined;
    liveContainers.delete(sandbox.id);
    if (!container) return;
    try {
      await container.stop({ t: 0 }).catch(() => {});
    } finally {
      try {
        await container.remove({ force: true });
        logger.info(`[sandbox:docker] destroyed ${sandbox.id}`);
      } catch (err) {
        logger.warn(`[sandbox:docker] remove failed for ${sandbox.id}:`, err);
      }
    }
  }

  private async execRaw(
    sandbox: Sandbox,
    command: string,
    opts: { timeoutMs: number },
  ): Promise<ExecutionResult> {
    const container = liveContainers.get(sandbox.id) as
      | { exec: (args: unknown) => Promise<unknown> }
      | undefined;
    if (!container) throw new Error(`Docker sandbox ${sandbox.id} not found`);

    const exec = (await container.exec({
      Cmd: ['bash', '-lc', command],
      AttachStdout: true,
      AttachStderr: true,
      User: 'candidate',
    })) as { start: (args: unknown) => Promise<NodeJS.ReadableStream>; inspect: () => Promise<{ ExitCode: number | null }> };

    const started = Date.now();
    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    const client = getDocker() as { modem: { demuxStream: (s: NodeJS.ReadableStream, o: NodeJS.WritableStream, e: NodeJS.WritableStream) => void } };
    client.modem.demuxStream(stream, stdout, stderr);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      (stream as unknown as { destroy: () => void }).destroy();
    }, opts.timeoutMs);

    await new Promise<void>((resolve) => {
      stream.on('end', () => resolve());
      stream.on('close', () => resolve());
      stream.on('error', () => resolve());
    });
    clearTimeout(timer);

    const info = await exec.inspect().catch(() => ({ ExitCode: timedOut ? 124 : 1 }));
    const exitCode = info.ExitCode ?? (timedOut ? 124 : 0);
    let stderrStr = Buffer.concat(stderrChunks).toString();
    if (timedOut) stderrStr += '\n[TIMEOUT]';
    if (exitCode === 137) stderrStr += '\n[OOM: exit 137 — container memory limit]';

    return {
      stdout: Buffer.concat(stdoutChunks).toString(),
      stderr: stderrStr,
      exitCode,
      durationMs: Date.now() - started,
      timedOut: timedOut || undefined,
    };
  }

  private async safeRemove(container: { remove?: (opts: { force: boolean }) => Promise<void> }): Promise<void> {
    try {
      await container.remove?.({ force: true });
    } catch {
      // swallow: best-effort cleanup in create-failure path
    }
  }
}
