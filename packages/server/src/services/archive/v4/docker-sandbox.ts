/**
 * ARCHIVED V4 FILE
 *
 * NOT compiled or imported by V5. Preserved as reference for Task 5
 * SandboxProvider abstraction. Original path in V4:
 * packages/server/src/services/docker-sandbox.ts (393 lines).
 *
 * V4 context: 长命 Docker sandbox with pty support + E2B drop-in shim
 *             (files.write / commands.run / pty.create / kill / pause).
 * V5 target:  短命 Docker sandbox, Provider 接口只暴露 create / writeFiles /
 *             execute / destroy，无 pty，无 pause/resume。
 *
 * Key patches to potentially absorb into V5 DockerSandboxProvider:
 * - HostConfig resource limits: Memory=2GB, MemorySwap=Memory (no swap), NanoCpus=1CPU
 * - NetworkMode: 'none' 阻断外网
 * - Tmpfs /workspace mount (writable but isolated)
 * - exec timeout → setTimeout → stream.destroy() 组合（防僵死）
 * - OOM 检测（exit code 137 → 明确 OOM 错误）
 * - kill() try/catch + stage2 guard + logger 事件
 * - cleanupStale() 周期性清理超时 container（V5 适用于孤儿 container）
 * - _exec 传入 user='candidate' 非 root 执行
 *
 * Patches to DISCARD (V5 不需要):
 * - files.write/files.read 的 E2B drop-in shim（V5 直接用 docker cp）
 * - pty.create / sendInput / resize（MB Cursor 不再走 pty）
 * - pause / resume 长命生命周期
 * - stage2Running mark（V5 短命 sandbox，destroy 立即）
 *
 * Security note: seccomp profile 在 V4 未实装（TODO comment），V5 MUST 实装。
 */
/**
 * (Original V4 header below, unchanged for reference)
 *
 * Docker-based sandbox implementation — drop-in replacement for E2B.
 *
 * Provides the same interface as E2B's Sandbox:
 *   files.write / files.read
 *   commands.run
 *   pty.create / sendInput / resize
 *   kill / pause
 *
 * Key differences from E2B:
 *   - Runs on the same server (latency <10ms vs E2B's ~600ms)
 *   - Uses dockerode for container lifecycle + exec TTY for PTY
 *   - Network disabled at runtime (deps pre-installed in image)
 *   - Resource limits enforced via cgroups v2
 */

// @ts-expect-error dockerode types installed separately; Docker provider optional
import Docker from 'dockerode';
import { PassThrough, Writable } from 'stream';
import { logger } from '../lib/logger.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const CONTAINER_WORKDIR = '/home/candidate/project';
const DEFAULT_IMAGE = 'codelens-sandbox-python:latest';

const LANGUAGE_IMAGES: Record<string, string> = {
  python: 'codelens-sandbox-python:latest',
  javascript: 'codelens-sandbox-node:latest',
  typescript: 'codelens-sandbox-node:latest',
  java: 'codelens-sandbox-java:latest',
};

// Resource limits matching E2B SANDBOX_SECURITY_CONFIG
const CONTAINER_LIMITS = {
  Memory: 2 * 1024 * 1024 * 1024,    // 2GB per sandbox
  MemorySwap: 2 * 1024 * 1024 * 1024, // No swap
  NanoCpus: 1e9,                       // 1 CPU
  PidsLimit: 256,
};

export interface DockerPtyHandle {
  pid: number;
  write: (data: string) => void;
  kill: () => void;
  resize: (size: { cols: number; rows: number }) => void;
}

export class DockerSandbox {
  readonly sandboxId: string;
  private container: Docker.Container;
  private ptyExec: Docker.Exec | null = null;
  private ptyStream: NodeJS.ReadWriteStream | null = null;

  private constructor(container: Docker.Container) {
    this.container = container;
    this.sandboxId = container.id.substring(0, 12); // short ID like E2B
  }

  // ─── Factory: Create ───

  static async create(opts: {
    image?: string;
    /** Template language — used to select the appropriate sandbox image */
    language?: string;
    timeoutMs?: number;
    /** Memory limit in bytes (default: 512MB) */
    memory?: number;
    /** CPU cores (default: 0.5) */
    cpus?: number;
    /** Max PIDs (default: 64) */
    pidsLimit?: number;
  } = {}): Promise<DockerSandbox> {
    const image = opts.image || (opts.language ? (LANGUAGE_IMAGES[opts.language.toLowerCase()] || DEFAULT_IMAGE) : DEFAULT_IMAGE);
    const memory = opts.memory || CONTAINER_LIMITS.Memory;
    const cpus = opts.cpus || 0.5;
    const pidsLimit = opts.pidsLimit || CONTAINER_LIMITS.PidsLimit;

    const container = await docker.createContainer({
      Image: image,
      Tty: false,
      OpenStdin: true,
      WorkingDir: CONTAINER_WORKDIR,
      HostConfig: {
        Memory: memory,
        MemorySwap: memory, // No swap
        NanoCpus: cpus * 1e9,
        PidsLimit: pidsLimit,
        NetworkMode: 'none',
        ReadonlyRootfs: false, // need writable for pip cache etc. but project dir is tmpfs
        Init: true, // tini for zombie reaping
        SecurityOpt: [
          'no-new-privileges',
          // TODO: Add seccomp profile when Docker API supports it: seccomp=codelens-seccomp.json
        ],
        CapDrop: ['ALL'],
        CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'DAC_OVERRIDE'],
        Tmpfs: {
          '/tmp': 'size=100m,noexec',
        },
      },
      Labels: {
        'codelens.sandbox': 'true',
        'codelens.created': new Date().toISOString(),
      },
    });

    await container.start();
    logger.info(`[docker-sandbox] Container created: ${container.id.substring(0, 12)}`);
    return new DockerSandbox(container);
  }

  // ─── Factory: Reconnect ───

  static async connect(containerId: string): Promise<DockerSandbox> {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    if (!info.State.Running) {
      await container.start();
      logger.info(`[docker-sandbox] Restarted stopped container: ${containerId.substring(0, 12)}`);
    }
    return new DockerSandbox(container);
  }

  // ─── Files ───

  readonly files = {
    write: async (path: string, content: string): Promise<void> => {
      const fullPath = path.startsWith('/') ? path : `${CONTAINER_WORKDIR}/${path}`;
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));

      // Ensure directory exists, then write atomically via tmp + mv
      const escaped = content.replace(/'/g, "'\\''");
      await this._exec(
        `mkdir -p '${dir}' && printf '%s' '${escaped}' > '${fullPath}.tmp' && mv '${fullPath}.tmp' '${fullPath}'`,
        { user: 'candidate' },
      );
    },

    read: async (path: string): Promise<string> => {
      const fullPath = path.startsWith('/') ? path : `${CONTAINER_WORKDIR}/${path}`;
      const result = await this._exec(`cat '${fullPath}'`, { user: 'candidate' });
      return result.stdout;
    },
  };

  // ─── Commands ───

  readonly commands = {
    run: async (
      cmd: string,
      opts?: { timeoutMs?: number },
    ): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
      const timeoutMs = opts?.timeoutMs ?? 30_000;
      return this._exec(cmd, { user: 'candidate', timeoutMs });
    },
  };

  // ─── PTY ───

  readonly pty = {
    create: async (opts: {
      cols?: number;
      rows?: number;
      timeoutMs?: number;
      onData: (data: Uint8Array) => void;
    }): Promise<{ pid: number; kill: () => void }> => {
      const exec = await this.container.exec({
        Cmd: ['/bin/bash'],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Env: [
          `COLUMNS=${opts.cols ?? 120}`,
          `LINES=${opts.rows ?? 40}`,
          `TERM=xterm-256color`,
          // B18: project root must be in PYTHONPATH so project-local modules are importable
          `PYTHONPATH=${CONTAINER_WORKDIR}`,
        ],
        User: 'candidate',
        WorkingDir: CONTAINER_WORKDIR,
      });

      const stream = await exec.start({ hijack: true, stdin: true });
      this.ptyExec = exec;
      this.ptyStream = stream;

      // Forward output
      stream.on('data', (chunk: Buffer) => {
        opts.onData(new Uint8Array(chunk));
      });

      stream.on('error', (err: Error) => {
        logger.warn(`[docker-sandbox] PTY stream error: ${err.message}`);
      });

      // Set initial size
      try {
        await exec.resize({ h: opts.rows ?? 40, w: opts.cols ?? 120 });
      } catch {
        // resize may fail if exec hasn't fully started
      }

      const inspectResult = await exec.inspect();
      const pid = inspectResult.Pid || 0;

      logger.info(`[docker-sandbox] PTY created: pid=${pid}, cols=${opts.cols ?? 120}, rows=${opts.rows ?? 40}`);

      return {
        pid,
        kill: () => {
          try {
            stream.end();
          } catch { /* ignore */ }
        },
      };
    },

    sendInput: async (_pid: number, data: Uint8Array): Promise<void> => {
      if (this.ptyStream) {
        this.ptyStream.write(Buffer.from(data));
      }
    },

    resize: async (_pid: number, size: { cols: number; rows: number }): Promise<void> => {
      if (this.ptyExec) {
        try {
          await this.ptyExec.resize({ h: size.rows, w: size.cols });
        } catch (err) {
          logger.debug(`[docker-sandbox] PTY resize error: ${err}`);
        }
      }
    },
  };

  // ─── Lifecycle ───

  async kill(): Promise<void> {
    // Stage 2 lifecycle protection: skip kill for containers in stage 2
    try {
      const info = await this.container.inspect();
      if (info.Config?.Labels?.['codelens.stage2'] === 'true') {
        logger.warn(`[docker-sandbox] Skipping kill for stage2 container: ${this.sandboxId}`);
        return;
      }
    } catch { /* container may not exist, proceed with cleanup */ }

    try {
      await this.container.stop({ t: 2 });
    } catch { /* may already be stopped */ }
    try {
      await this.container.remove({ force: true });
    } catch { /* may already be removed */ }
    logger.info(`[docker-sandbox] Container killed: ${this.sandboxId}`);
  }

  async pause(): Promise<void> {
    try {
      await this.container.pause();
      logger.info(`[docker-sandbox] Container paused: ${this.sandboxId}`);
    } catch (err) {
      logger.warn(`[docker-sandbox] Pause failed: ${err}`);
    }
  }

  async resume(): Promise<void> {
    try {
      await this.container.unpause();
    } catch { /* may not be paused */ }
  }

  // ─── Health Check ───

  static async healthCheck(): Promise<{ healthy: boolean; containers: number }> {
    try {
      await docker.ping();
      const containers = await docker.listContainers({
        filters: { label: ['codelens.sandbox=true'] },
      });
      return { healthy: true, containers: containers.length };
    } catch {
      return { healthy: false, containers: 0 };
    }
  }

  // ─── Cleanup stale containers ───

  static async cleanupStale(maxAgeMs: number = 2 * 60 * 60 * 1000): Promise<number> {
    let cleaned = 0;
    try {
      const containers = await docker.listContainers({
        all: true,
        filters: { label: ['codelens.sandbox=true'] },
      });
      const now = Date.now();
      for (const c of containers) {
        const created = c.Created * 1000;
        if (now - created > maxAgeMs) {
          const container = docker.getContainer(c.Id);
          await container.stop({ t: 1 }).catch(() => {});
          await container.remove({ force: true }).catch(() => {});
          cleaned++;
        }
      }
    } catch (err) {
      logger.error(`[docker-sandbox] Cleanup error: ${err}`);
    }
    if (cleaned > 0) {
      logger.info(`[docker-sandbox] Cleaned ${cleaned} stale containers`);
    }
    return cleaned;
  }

  // ─── Internal: exec helper ───

  private async _exec(
    cmd: string,
    opts: { user?: string; timeoutMs?: number } = {},
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const exec = await this.container.exec({
      Cmd: ['bash', '-c', cmd],
      AttachStdout: true,
      AttachStderr: true,
      User: opts.user || 'root',
      WorkingDir: CONTAINER_WORKDIR,
    });

    const stream = await exec.start({});

    return new Promise((resolve, reject) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      // Docker multiplexes stdout/stderr in the stream
      // Use docker modem to demux
      const stdout = new PassThrough();
      const stderr = new PassThrough();

      docker.modem.demuxStream(stream, stdout, stderr);

      stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      let timedOut = false;
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            stream.destroy();
            resolve({
              exitCode: 137,
              stdout: Buffer.concat(stdoutChunks).toString(),
              stderr: Buffer.concat(stderrChunks).toString() + '\n[TIMEOUT]',
            });
          }, opts.timeoutMs)
        : null;

      stream.on('end', async () => {
        if (timedOut) return;
        if (timer) clearTimeout(timer);

        try {
          const info = await exec.inspect();
          const exitCode = info.ExitCode ?? 1;

          // OOM recovery: exit code 137 = killed by SIGKILL (typically OOM killer)
          if (exitCode === 137) {
            reject(new Error(`Process killed by OOM killer (exit code 137) — container memory limit exceeded`));
            return;
          }

          resolve({
            exitCode,
            stdout: Buffer.concat(stdoutChunks).toString(),
            stderr: Buffer.concat(stderrChunks).toString(),
          });
        } catch (err) {
          resolve({
            exitCode: 1,
            stdout: Buffer.concat(stdoutChunks).toString(),
            stderr: Buffer.concat(stderrChunks).toString(),
          });
        }
      });

      stream.on('error', (err: Error) => {
        if (timedOut) return;
        if (timer) clearTimeout(timer);
        reject(err);
      });
    });
  }
}
