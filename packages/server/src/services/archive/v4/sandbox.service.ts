/**
 * ARCHIVED V4 FILE
 *
 * NOT compiled or imported by V5. Preserved as reference for Task 5
 * SandboxProvider abstraction. Original path in V4:
 * packages/server/src/services/sandbox.service.ts (965 lines).
 *
 * V4 context: 长命 sandbox（70min interview + Stage 2 overlap） + 直接绑定
 *             session 生命周期 + tier/schemaVersion 分支 + Redis file version
 *             cache + template/templateFile Prisma 依赖 + scaffold 注入。
 * V5 target:  短命 sandbox（create → writeFiles → execute → destroy < 15s P95）
 *             + Provider 抽象（E2B / Docker / Static）+ 3 级降级 + 5min cache。
 *
 * Key patches to potentially absorb into V5 Provider:
 * - SANDBOX_SECURITY_CONFIG（memoryMB=2048, cpuCount=1, maxTimeoutMs）资源上限
 * - Math.min() timeout clamping 防止调用方传入过大值
 * - AR-7 e2bUnavailable 健康标记（新 sandbox 创建跳过 E2B）→ Factory 降级路径
 * - stage2Running guard 防止 kill 正在评分的 sandbox → V5 destroy 时 session lifecycle 钩子
 * - createSandbox try/catch 中先 destroy 半初始化的 sandbox 再抛错 → V5 cleanup 顺序
 * - logger.info lifecycle 事件（created / killed / timeout） → V5 observability
 *
 * Patches to DISCARD (incompatible with V5 short-lived + Provider 抽象):
 * - tier 相关所有分支
 * - schemaVersion V1/V3/V4 分支
 * - 长命 keepalive / ttl / pause / resume
 * - scaffold 文件 create 时注入（V5 推迟到 MB Cursor）
 * - FILE_VERSION_REDIS_PREFIX file version tracking（V5 用 FileSnapshotService）
 * - debounceTimers / recentWrites file-sync 层（V5 Cursor mode 改 Monaco-driven）
 * - applyVariables template variable substitution（V5 exam-generator 负责）
 */

import { Sandbox } from '@e2b/code-interpreter';
import { prisma } from '../config/db.js';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { FILE_SYNC_DEBOUNCE_MS, ECHO_SUPPRESSION_TTL_MS, SANDBOX_TIMEOUT_MS } from '@codelens/shared';
import type { SandboxCreateOptions } from '@codelens/shared';
import { SandboxError } from '../middleware/errorHandler.js';
import { applyVariables } from '../lib/template-variables.js';

const useDocker = env.SANDBOX_PROVIDER === 'docker';

// Debounce timers per file path
const debounceTimers = new Map<string, NodeJS.Timeout>();
// Echo suppression: recently written files
const recentWrites = new Map<string, number>();

// Active sandboxes
const activeSandboxes = new Map<string, Sandbox>();

// AR-7: E2B platform availability (set by health check, affects NEW sandbox creation only)
let e2bUnavailable = false;
// AR-7: Track which sandboxes are in degraded (mock) mode — does NOT affect other sessions
const degradedSandboxes = new Set<string>();

// Stage 2 lifecycle protection: sandboxes currently running stage 2 scoring must not be killed
const stage2Running = new Set<string>();

/** Mark a sandbox as running stage 2 (prevents kill/cleanup) */
export function markStage2Running(sandboxId: string): void {
  stage2Running.add(sandboxId);
  logger.info(`[sandbox] Marked stage2 running: ${sandboxId}`);
}

/** Unmark a sandbox from stage 2 running (allows kill/cleanup) */
export function unmarkStage2Running(sandboxId: string): void {
  stage2Running.delete(sandboxId);
  logger.info(`[sandbox] Unmarked stage2 running: ${sandboxId}`);
}

// AR-2: Per-file version tracking (key = "sandboxId:path" → version number)
// In-memory cache backed by Redis for crash recovery
const fileVersions = new Map<string, number>();
// AR-2: Per-file latest content cache (for conflict resolution)
const fileContents = new Map<string, string>();

const FILE_VERSION_REDIS_PREFIX = 'fileversion:';
const FILE_VERSION_REDIS_TTL = 7200; // 2h TTL (covers 70min interview + buffer)

const PREWARM_KEY_PREFIX = 'prewarm:';

// ─── Redis TTL Reference ───
// behavior events (Redis Stream): 2h (7200s) — see behavior-collector.service.ts STREAM_TTL_SECONDS
// micro-verify pregenerated: 10min (600s)  — see micro-verify.service.ts PREGENERATED_TTL
// file versions: 2h (7200s)               — FILE_VERSION_REDIS_TTL above
// prewarm sandbox IDs: 10min (600s)        — prewarmSandbox() below
// paused sandbox marker: 1h (3600s)        — pauseSandbox() below
// sandbox creation lock: 2min (120s)       — prewarmSandbox() / getOrCreateSandbox()

// PENDING-11: E2B sandbox security configuration
// These limits apply when E2B Pro plan is active.
// Hobby plan uses default limits (sufficient for development).
const SANDBOX_SECURITY_CONFIG = {
  // Resource limits
  memoryMB: 2048,           // 2GB per sandbox (sufficient for Python/Node/Java projects)
  cpuCount: 1,              // 1 vCPU per sandbox
  // Timeout safety
  maxTimeoutMs: 7_800_000,  // 130min hard cap (70min interview + Stage 2 up to 120min overlap)
  // Process limits (enforced via Firecracker microVM)
  // Note: E2B Firecracker provides hardware-level isolation by default:
  //   - Separate kernel per sandbox
  //   - No shared filesystem between sandboxes
  //   - Network isolation between sandbox instances
  // Application-level restrictions (requires E2B Pro plan custom template):
  //   - Outbound network: DENY ALL except pypi.org, npmjs.org, maven central (for package install)
  //   - Max processes: 64
  //   - Max open files: 1024
  //   - Disk quota: 1GB
} as const;

export const sandboxService = {
  async createSandbox(options: SandboxCreateOptions): Promise<string> {
    const { sessionId, templateId, timeoutMs = SANDBOX_TIMEOUT_MS, resolvedVariables } = options;

    // Docker provider: use self-hosted container (low latency)
    if (useDocker) {
      try {
        const { DockerSandbox } = await import('./docker-sandbox.js');

        // Look up template language to select the right sandbox image
        const templateMeta = await prisma.template.findUnique({
          where: { id: templateId },
          select: { language: true },
        });
        const language = templateMeta?.language ?? 'python';
        const dockerSandbox = await DockerSandbox.create({ language });

        // Load template files (excluding B1 scaffold files — injected at Module B transition)
        const templateFiles = await prisma.templateFile.findMany({
          where: { templateId, isHidden: false },
        });
        // Check for scaffold files to exclude (explicit or auto-detected from downstreamImpacts)
        let scaffoldPaths = new Set<string>();
        try {
          const examInst = await prisma.examInstance.findFirst({
            where: { templateModelId: templateId },
            orderBy: { generatedAt: 'desc' },
            select: { requirement: true, codebaseFiles: true },
          });
          const req = examInst?.requirement as Record<string, unknown> | null;
          const scaffoldFiles = req?.scaffoldFiles as Array<{ path: string }> | undefined;
          if (scaffoldFiles && scaffoldFiles.length > 0) {
            scaffoldPaths = new Set(scaffoldFiles.map((f) => f.path));
          } else if (req?.downstreamImpacts && examInst?.codebaseFiles) {
            // Auto-detect: downstreamImpacts files that are feature-specific (not base infra)
            const impacts = (req.downstreamImpacts as string[]).map((d: string) => d.split('::')[0].trim());
            const templatePathSet = new Set(templateFiles.map((f: any) => f.path));
            for (const ip of impacts) {
              // Only exclude files that exist in both codebase and template,
              // and are NOT base infrastructure (audit_service, notification_service are base)
              const isBaseInfra = /audit|notification|config|settings|__init__|main\./i.test(ip);
              if (!isBaseInfra) {
                for (const tf of templateFiles) {
                  if ((tf as any).path === ip || (tf as any).path.endsWith('/' + ip) || ip.endsWith('/' + (tf as any).path)) {
                    scaffoldPaths.add((tf as any).path);
                  }
                }
              }
            }
            // Also add matching test files
            if (scaffoldPaths.size > 0) {
              for (const tf of templateFiles) {
                const p = (tf as any).path as string;
                if (p.includes('test')) {
                  for (const sp of scaffoldPaths) {
                    const baseName = sp.split('/').pop()?.replace(/\.(py|ts|js|java)$/, '') || '';
                    if (p.includes(baseName)) scaffoldPaths.add(p);
                  }
                }
              }
            }
          }
        } catch { /* no ExamInstance — load all files */ }

        const filesToLoad = scaffoldPaths.size > 0
          ? templateFiles.filter((f: any) => !scaffoldPaths.has(f.path))
          : templateFiles;
        if (scaffoldPaths.size > 0) {
          logger.info(`[sandbox] Excluded ${scaffoldPaths.size} scaffold files from sandbox: ${[...scaffoldPaths].join(', ')}`);
        }
        await Promise.all(
          filesToLoad.map((f: any) => {
            const content = resolvedVariables
              ? applyVariables(f.content, resolvedVariables)
              : f.content;
            return dockerSandbox.files.write(f.path, content);
          }),
        );

        // B21: Docker image has all deps pre-installed (fastapi/uvicorn/pytest/sqlalchemy etc.)
        // Hotfix: pip install missing packages that aren't in the Docker image yet
        // (python-multipart needed for FastAPI UploadFile). Remove after Docker image rebuild.
        if (language === 'python') {
          await dockerSandbox.commands.run(
            'pip install -q python-multipart 2>/dev/null || true',
            { timeoutMs: 30_000 },
          ).catch(() => {});
        }
        // B26: For Java, create gradlew wrapper + fallback build.gradle if template omitted one
        // B27: For Maven projects (pom.xml present), use mvn --offline instead of ./gradlew
        if (language === 'java') {
          const isMaven = templateFiles.some((f: any) => f.path === 'pom.xml');
          if (isMaven) {
            // Maven project: copy pre-warmed .m2 from image (already in /root/.m2 via Dockerfile warmup)
            // Maven offline mode works because Spring Boot deps are pre-cached in the image
            await dockerSandbox.commands.run(
              'cp -r /root/.m2 ~/.m2 2>/dev/null || true',
              { timeoutMs: 10_000 },
            ).catch(() => {});
            // Ensure .m2 is owned by candidate
            await dockerSandbox.commands.run(
              'chown -R candidate:candidate ~/.m2 2>/dev/null || true',
              { timeoutMs: 5_000 },
            ).catch(() => {});
          }
          if (!isMaven) {
          const gradlewSetup = '[ -f gradlew ] || { printf "#!/bin/sh\\ngradle \\"$@\\"\\n" > gradlew && chmod +x gradlew; }';
          await dockerSandbox.commands.run(gradlewSetup, { timeoutMs: 5_000 }).catch(() => {});
          // If no build.gradle exists (template generation bug), inject a minimal one so gradle works
          const fallbackBuildGradle = [
            '[ -f build.gradle ] || cat > build.gradle << \'GRADLE_EOF\'',
            'plugins { id \'java\' }',
            'repositories { mavenCentral() }',
            'dependencies {',
            '  testImplementation \'org.junit.jupiter:junit-jupiter:5.9.3\'',
            '  testRuntimeOnly \'org.junit.platform:junit-platform-launcher\'',
            '}',
            'test { useJUnitPlatform() }',
            'GRADLE_EOF',
          ].join('\n');
          await dockerSandbox.files.write('_setup_build.sh', fallbackBuildGradle).catch(() => {});
          await dockerSandbox.commands.run('bash _setup_build.sh && rm -f _setup_build.sh', { timeoutMs: 5_000 }).catch(() => {});
          // Fix smart/curly quotes in build.gradle (LLM sometimes outputs Unicode quotes)
          // Replace \u2018\u2019 ('' left/right single) and \u201c\u201d ("" left/right double) with ASCII
          await dockerSandbox.commands.run(
            '[ -f build.gradle ] && sed -i "s/\\xE2\\x80\\x98/\'/g; s/\\xE2\\x80\\x99/\'/g; s/\\xE2\\x80\\x9C/\"/g; s/\\xE2\\x80\\x9D/\"/g" build.gradle || true',
            { timeoutMs: 5_000 },
          ).catch(() => {});
          // Disable Gradle daemon + cap JVM heap so ./gradlew test doesn't hang in Docker container.
          // Daemon mode is unreliable in containers (slow startup, memory pressure).
          await dockerSandbox.commands.run(
            '[ -f gradle.properties ] || printf "org.gradle.daemon=false\\norg.gradle.jvmargs=-Xmx512m -Xms128m\\n" > gradle.properties',
            { timeoutMs: 5_000 },
          ).catch(() => {});
          } // end !isMaven
        }

        // Node sandbox: symlink pre-cached node_modules so jest/imports work without npm install
        if (language === 'typescript' || language === 'javascript') {
          await dockerSandbox.commands.run(
            '[ -d node_modules ] || ln -s /home/candidate/node_cache/node_modules node_modules',
            { timeoutMs: 5_000 },
          ).catch(() => {});
          // Create minimal package.json if template didn't include one
          await dockerSandbox.commands.run(
            '[ -f package.json ] || printf \'{"name":"project","scripts":{"test":"jest"}}\\n\' > package.json',
            { timeoutMs: 5_000 },
          ).catch(() => {});
          // Create tsconfig.json for TypeScript projects if missing
          if (language === 'typescript') {
            await dockerSandbox.commands.run(
              '[ -f tsconfig.json ] || printf \'{"compilerOptions":{"target":"ES2020","module":"commonjs","jsx":"react-jsx","esModuleInterop":true,"strict":true,"moduleResolution":"node","resolveJsonModule":true,"skipLibCheck":true,"outDir":"./dist"},"include":["src/**/*"]}\\n\' > tsconfig.json',
              { timeoutMs: 5_000 },
            ).catch(() => {});
          }
          // Create jest.config.js for ts-jest if missing
          await dockerSandbox.commands.run(
            '[ -f jest.config.js ] || [ -f jest.config.ts ] || printf \'module.exports={preset:"ts-jest",testEnvironment:"jsdom",moduleFileExtensions:["ts","tsx","js","jsx"],transform:{"^.+\\\\.tsx?$":"ts-jest"},testMatch:["**/*.test.ts","**/*.test.tsx","**/*.test.js"]}\\n\' > jest.config.js',
            { timeoutMs: 5_000 },
          ).catch(() => {});
        }

        const sandboxId = dockerSandbox.sandboxId;
        activeSandboxes.set(sandboxId, dockerSandbox as any);
        await prisma.session.update({ where: { id: sessionId }, data: { sandboxId } });
        logger.info(`Docker sandbox created: ${sandboxId} for session ${sessionId}`);
        return sandboxId;
      } catch (error) {
        logger.error('Docker sandbox creation failed, falling back to degraded mode', error);
        degradedSandboxes.add(`mock-sandbox-${sessionId}`);
        return `mock-sandbox-${sessionId}`;
      }
    }

    if (!env.E2B_API_KEY) {
      logger.warn('E2B_API_KEY not set, sandbox creation skipped');
      return `mock-sandbox-${sessionId}`;
    }

    // AR-7: Try E2B, fall back to degraded mode on failure
    try {
      const clampedTimeoutMs = Math.min(timeoutMs, SANDBOX_TIMEOUT_MS, SANDBOX_SECURITY_CONFIG.maxTimeoutMs);
      const sandbox = await Sandbox.create({
        apiKey: env.E2B_API_KEY,
        timeoutMs: clampedTimeoutMs,
      });

      const sandboxId = sandbox.sandboxId;
      activeSandboxes.set(sandboxId, sandbox);

      // Load template files into sandbox (exclude hidden test files)
      const templateFiles = await prisma.templateFile.findMany({
        where: { templateId, isHidden: false },
      });

      // M1-2: Apply template variables before writing files to sandbox
      await Promise.all(
        templateFiles.map((f) => {
          const content = resolvedVariables
            ? applyVariables(f.content, resolvedVariables)
            : f.content;
          return sandbox.files.write(f.path, content);
        }),
      );

      // AR-11: Install dependencies based on template language/metadata
      const template = await prisma.template.findUnique({
        where: { id: templateId },
        select: { language: true, metadata: true },
      });
      const templateMeta = (template?.metadata as Record<string, unknown>) || {};
      const installCmd = (templateMeta.installCommand as string) || this._getInstallCommand(template?.language ?? 'python');
      // Install terminal tools (nano, less) in parallel with language deps
      const toolsInstall = sandbox.commands.run(
        'DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nano less 2>/dev/null || true',
        { timeoutMs: 20_000 },
      ).catch(() => {});

      // Write helpful shell aliases for a comfortable terminal experience
      const aliasContent = [
        'alias ll="ls -la"',
        'alias la="ls -A"',
        'alias ..="cd .."',
        '# new <filename> — create and open a file in nano',
        'new() { touch "$1" && nano "$1"; }',
        '# Fix xterm.js paste: enable bracketed paste so stray chars don\'t appear',
        'bind \'set enable-bracketed-paste on\' 2>/dev/null || true',
        '# Disable history expansion to prevent ! in pasted code from causing errors',
        'set +H',
        '# B18: Set PYTHONPATH so project-local modules resolve without install',
        'export PYTHONPATH=/root:$PYTHONPATH',
        '# B11: Route pip through Tsinghua mirror to work around PyPI access issues',
        'alias pip=\'pip -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn\'',
        'alias pip3=\'pip3 -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn\'',
      ].join('\n') + '\n';
      await sandbox.files.write('/root/.codelens_rc', aliasContent).catch(() => {});
      // Run setup commands independently — each failure is tolerated so later commands still run
      await sandbox.commands.run(
        'grep -q ".codelens_rc" /root/.bashrc 2>/dev/null || echo "source /root/.codelens_rc" >> /root/.bashrc',
        { timeoutMs: 5_000 },
      ).catch(() => {});
      // B18: add /root to sys.path via .pth file in site-packages (shell-independent; site.py processes .pth files automatically)
      // Step 1: find the site-packages directory
      const b18SiteDir = await sandbox.commands.run(
        'python3 -c "import site; print(site.getsitepackages()[0])"',
        { timeoutMs: 5_000 },
      ).then((r: { stdout?: string }) => r.stdout?.trim() || '/usr/local/lib/python3/dist-packages')
       .catch(() => '/usr/local/lib/python3/dist-packages');
      logger.info(`[B18] site-packages dir: ${b18SiteDir}`);
      // Step 2: create dir and write .pth file
      await sandbox.commands.run(`mkdir -p "${b18SiteDir}"`, { timeoutMs: 3_000 }).catch(() => {});
      await sandbox.files.write(`${b18SiteDir}/codelens.pth`, '/root\n').catch((e: unknown) => {
        logger.warn(`[B18] failed to write codelens.pth: ${e}`);
      });
      // B18 backup: PYTHONPATH in bash config files
      await sandbox.commands.run(
        'grep -q "PYTHONPATH" /root/.bashrc 2>/dev/null || echo "export PYTHONPATH=/root" >> /root/.bashrc' +
        ' && (touch /root/.bash_profile && grep -q "PYTHONPATH" /root/.bash_profile 2>/dev/null || echo "export PYTHONPATH=/root" >> /root/.bash_profile)',
        { timeoutMs: 5_000 },
      ).catch(() => {});
      // B11: write pip.conf to route pip through Tsinghua mirror (shell-independent, pip reads directly)
      await sandbox.commands.run(
        'mkdir -p /root/.config/pip' +
        ' && printf "[global]\\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple\\ntrusted-host = pypi.tuna.tsinghua.edu.cn\\n" > /root/.config/pip/pip.conf' +
        ' && printf "[global]\\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple\\ntrusted-host = pypi.tuna.tsinghua.edu.cn\\n" > /etc/pip.conf',
        { timeoutMs: 5_000 },
      ).catch(() => {});
      // Java needs more time: apt-get install default-jdk + maven can take ~90s
      const installTimeoutMs = (template?.language ?? 'python').toLowerCase() === 'java' ? 120_000 : 30_000;
      if (installCmd) {
        await Promise.all([
          sandbox.commands.run(installCmd, { timeoutMs: installTimeoutMs }),
          toolsInstall,
        ]);
      } else {
        await toolsInstall;
      }

      logger.info(`Sandbox created: ${sandboxId} for session ${sessionId}`);
      return sandboxId;
    } catch (error) {
      logger.error(`E2B sandbox creation failed for session ${sessionId}`, error);
      const mockId = `degraded-sandbox-${sessionId}`;
      degradedSandboxes.add(mockId);
      return mockId;
    }
  },

  /**
   * AR-5: Pre-warm a sandbox ahead of session start.
   * Stores the sandboxId in Redis so startSession can pick it up.
   */
  async prewarmSandbox(sessionId: string, templateId: string, resolvedVariables?: Record<string, string | number>): Promise<string> {
    // Acquire lock to prevent double-creation race with getOrCreateSandbox()
    const lockKey = `sandbox:lock:${sessionId}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 120, 'NX');
    if (!lockAcquired) {
      logger.info(`Prewarm skipped for session ${sessionId}: sandbox creation already in progress`);
      // Wait for the other creator to finish and return its ID
      const existingId = await redis.get(`${PREWARM_KEY_PREFIX}${sessionId}`);
      if (existingId) return existingId;
      // Fallback: let getOrCreateSandbox handle it
      return `pending-${sessionId}`;
    }

    try {
      const sandboxId = await this.createSandbox({
        sessionId,
        templateId,
        timeoutMs: SANDBOX_TIMEOUT_MS,
        resolvedVariables,
      });

      await redis.set(`${PREWARM_KEY_PREFIX}${sessionId}`, sandboxId, 'EX', 600);
      logger.info(`Sandbox pre-warmed for session ${sessionId}: ${sandboxId}`);
      return sandboxId;
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  },

  /**
   * AR-5: Get pre-warmed sandbox or create a new one.
   * Uses Redis lock to prevent double-creation when prewarm is still in-flight.
   */
  async getOrCreateSandbox(options: SandboxCreateOptions): Promise<string> {
    const { sessionId } = options;

    // Check if pre-warmed sandbox is ready
    const prewarmedId = await redis.get(`${PREWARM_KEY_PREFIX}${sessionId}`);
    if (prewarmedId && activeSandboxes.has(prewarmedId)) {
      await redis.del(`${PREWARM_KEY_PREFIX}${sessionId}`);
      logger.info(`Using pre-warmed sandbox ${prewarmedId} for session ${sessionId}`);
      return prewarmedId;
    }

    // SECURITY: Use Redis lock to prevent double-creation race with prewarmSandbox()
    const lockKey = `sandbox:lock:${sessionId}`;
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 120, 'NX'); // 2min TTL
    if (!lockAcquired) {
      // Another process (prewarm) is creating a sandbox — wait for it
      logger.info(`Sandbox creation locked for session ${sessionId}, waiting for prewarm...`);
      for (let i = 0; i < 30; i++) { // Wait up to 30s
        await new Promise((r) => setTimeout(r, 1000));
        const readyId = await redis.get(`${PREWARM_KEY_PREFIX}${sessionId}`);
        if (readyId && activeSandboxes.has(readyId)) {
          await redis.del(`${PREWARM_KEY_PREFIX}${sessionId}`);
          await redis.del(lockKey);
          logger.info(`Pre-warmed sandbox became available: ${readyId} for session ${sessionId}`);
          return readyId;
        }
      }
      // Prewarm didn't complete in time — release lock and create fresh
      logger.warn(`Prewarm timeout for session ${sessionId}, creating fresh sandbox`);
      await redis.del(lockKey);
    }

    try {
      const sandboxId = await this.createSandbox(options);
      return sandboxId;
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  },

  /** AR-7: Check if a specific sandbox is in degraded mode */
  isDegraded(sandboxId?: string): boolean {
    if (sandboxId) {
      return degradedSandboxes.has(sandboxId);
    }
    return e2bUnavailable;
  },

  /** AR-7: Set E2B platform availability from external health check */
  setE2bUnavailable(value: boolean): void {
    if (e2bUnavailable !== value) {
      logger.info(`E2B platform ${value ? 'unavailable' : 'available'}`);
    }
    e2bUnavailable = value;
  },

  /**
   * AR-5: Pause a sandbox to save E2B billing during session pauses.
   * E2B supports pause/resume via sandbox.pause() and Sandbox.connect().
   */
  async pauseSandbox(sandboxId: string): Promise<void> {
    if (degradedSandboxes.has(sandboxId) || !env.E2B_API_KEY) return;

    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) {
      logger.warn(`Cannot pause sandbox: not found in active map: ${sandboxId}`);
      return;
    }

    try {
      // E2B SDK exposes pause on sandbox instances (may not be in type defs yet)
      await (sandbox as unknown as { pause: () => Promise<void> }).pause();
      activeSandboxes.delete(sandboxId);
      // Store ID in Redis so we can reconnect later
      await redis.set(`paused:${sandboxId}`, '1', 'EX', 3600);
      logger.info(`Sandbox paused: ${sandboxId}`);
    } catch (error) {
      logger.error(`Failed to pause sandbox ${sandboxId}:`, error);
    }
  },

  /**
   * AR-5: Resume a previously paused sandbox.
   */
  async resumeSandbox(sandboxId: string): Promise<Sandbox | null> {
    if (!env.E2B_API_KEY) return null;

    try {
      const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.E2B_API_KEY });
      activeSandboxes.set(sandboxId, sandbox);
      await redis.del(`paused:${sandboxId}`);
      logger.info(`Sandbox resumed: ${sandboxId}`);
      return sandbox;
    } catch (error) {
      logger.error(`Failed to resume sandbox ${sandboxId}:`, error);
      return null;
    }
  },

  /**
   * AR-5: Pre-allocate a pool of sandboxes stored in Redis for fast session start.
   */
  async preallocatePool(count: number, templateId: string): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      try {
        const placeholderId = `pool-${Date.now()}-${i}`;
        const sandboxId = await this.createSandbox({
          sessionId: placeholderId,
          templateId,
          timeoutMs: SANDBOX_TIMEOUT_MS,
        });
        await redis.rpush('sandbox:pool', sandboxId);
        ids.push(sandboxId);
      } catch (error) {
        logger.error(`Pool allocation failed at index ${i}:`, error);
        break;
      }
    }
    logger.info(`Pre-allocated ${ids.length}/${count} sandboxes for template ${templateId}`);
    return ids;
  },

  /**
   * Sync a file to the sandbox with version checking (AR-2).
   * Returns { ok, newVersion, serverContent? } — if ok=false, it's a version conflict.
   */
  async syncFile(
    sandboxId: string,
    path: string,
    content: string,
    baseVersion?: number,
  ): Promise<{ ok: boolean; newVersion: number; serverContent?: string }> {
    const key = `${sandboxId}:${path}`;

    // AR-2: Version conflict check — try in-memory first, fall back to Redis on miss
    let currentVersion = fileVersions.get(key);
    if (currentVersion === undefined) {
      // Server may have restarted — recover from Redis
      const redisVersion = await redis.get(`${FILE_VERSION_REDIS_PREFIX}${key}`);
      currentVersion = redisVersion ? parseInt(redisVersion, 10) : 0;
      if (currentVersion > 0) {
        fileVersions.set(key, currentVersion);
        logger.info(`Recovered file version from Redis: ${path} v${currentVersion}`);
      }
    }
    if (baseVersion !== undefined && baseVersion < currentVersion) {
      logger.warn(`File version conflict: ${path} base=${baseVersion} server=${currentVersion}`);
      return { ok: false, newVersion: currentVersion, serverContent: fileContents.get(key) };
    }

    // Debounce writes
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    // AR-2: Optimistically bump version and cache content
    const newVersion = currentVersion + 1;
    fileVersions.set(key, newVersion);
    fileContents.set(key, content);
    // Persist to Redis (fire-and-forget, non-blocking)
    redis.set(`${FILE_VERSION_REDIS_PREFIX}${key}`, String(newVersion), 'EX', FILE_VERSION_REDIS_TTL).catch(() => {});

    // AR-7: In degraded mode for this sandbox, skip actual write but still track versions
    if (degradedSandboxes.has(sandboxId)) {
      return { ok: true, newVersion };
    }

    return new Promise((resolve) => {
      debounceTimers.set(
        key,
        setTimeout(async () => {
          debounceTimers.delete(key);
          const sandbox = activeSandboxes.get(sandboxId);
          if (!sandbox) return resolve({ ok: true, newVersion });

          // Mark for echo suppression
          recentWrites.set(key, Date.now());
          setTimeout(() => recentWrites.delete(key), ECHO_SUPPRESSION_TTL_MS);

          try {
            await sandbox.files.write(path, content);
          } catch (err) {
            logger.error(`syncFile write failed for ${path} in sandbox ${sandboxId}:`, err);
          }
          resolve({ ok: true, newVersion });
        }, FILE_SYNC_DEBOUNCE_MS),
      );
    });
  },

  isEchoSuppressed(sandboxId: string, path: string): boolean {
    const key = `${sandboxId}:${path}`;
    const writeTime = recentWrites.get(key);
    if (!writeTime) return false;
    return Date.now() - writeTime < ECHO_SUPPRESSION_TTL_MS;
  },

  async createPty(
    sandboxId: string,
    onData: (data: Uint8Array) => void,
    options?: { cols?: number; rows?: number },
  ): Promise<{ write: (data: string) => void; kill: () => void; resize: (size: { cols: number; rows: number }) => void }> {
    // AR-7: In degraded mode for this sandbox, return a no-op PTY mock
    if (degradedSandboxes.has(sandboxId)) {
      logger.warn(`PTY requested in degraded mode for sandbox: ${sandboxId}`);
      return { write: () => {}, kill: () => {}, resize: () => {} };
    }

    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) throw new SandboxError(`Sandbox not found: ${sandboxId}`);

    const handle = await sandbox.pty.create({
      cols: options?.cols ?? 120,
      rows: options?.rows ?? 40,
      timeoutMs: 0, // No timeout for PTY
      onData,
      envs: {
        TERM: 'xterm-256color',
        HOME: '/root',
        COLORTERM: 'truecolor',
        // B18: PYTHONPATH so project-local modules resolve without install
        PYTHONPATH: '/root',
        // B11: Route pip through Tsinghua mirror (env vars apply even without .bashrc aliases)
        PIP_INDEX_URL: 'https://pypi.tuna.tsinghua.edu.cn/simple',
        PIP_TRUSTED_HOST: 'pypi.tuna.tsinghua.edu.cn',
      },
    });

    const pid = handle.pid;

    // Return a unified wrapper — E2B PTY input/resize are on sandbox.pty, not on handle
    return {
      write: (data: string) => {
        sandbox.pty.sendInput(pid, new TextEncoder().encode(data)).catch((e) =>
          logger.error(`PTY write error: ${e}`),
        );
      },
      kill: () => {
        try { handle.kill(); } catch (e) { logger.error(`PTY kill error: ${e}`); }
      },
      resize: (size: { cols: number; rows: number }) => {
        sandbox.pty.resize(pid, size).catch((e) =>
          logger.error(`PTY resize error: ${e}`),
        );
      },
    };
  },

  async reconnect(sandboxId: string): Promise<Sandbox> {
    if (!env.E2B_API_KEY) {
      throw new SandboxError('E2B_API_KEY not configured');
    }

    const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.E2B_API_KEY });
    activeSandboxes.set(sandboxId, sandbox);
    logger.info(`Reconnected to sandbox: ${sandboxId}`);
    return sandbox;
  },

  async kill(sandboxId: string): Promise<void> {
    // Stage 2 lifecycle protection: skip kill if stage 2 is running
    if (stage2Running.has(sandboxId)) {
      logger.warn(`[sandbox] Skipping kill for sandbox in stage2: ${sandboxId}`);
      return;
    }

    const sandbox = activeSandboxes.get(sandboxId);
    if (sandbox) {
      await sandbox.kill();
      activeSandboxes.delete(sandboxId);

      // Clean up in-memory maps and Redis keys to prevent memory leaks
      const prefix = `${sandboxId}:`;
      const redisKeysToDelete: string[] = [];
      for (const key of fileVersions.keys()) {
        if (key.startsWith(prefix)) {
          fileVersions.delete(key);
          redisKeysToDelete.push(`${FILE_VERSION_REDIS_PREFIX}${key}`);
        }
      }
      for (const key of fileContents.keys()) {
        if (key.startsWith(prefix)) fileContents.delete(key);
      }
      for (const key of recentWrites.keys()) {
        if (key.startsWith(prefix)) recentWrites.delete(key);
      }
      for (const key of debounceTimers.keys()) {
        if (key.startsWith(prefix)) {
          clearTimeout(debounceTimers.get(key));
          debounceTimers.delete(key);
        }
      }
      // Clean up Redis file version keys
      if (redisKeysToDelete.length > 0) {
        redis.del(...redisKeysToDelete).catch(() => {});
      }

      degradedSandboxes.delete(sandboxId);
      logger.info(`Sandbox killed: ${sandboxId}`);
    }
  },

  getSandbox(sandboxId: string): Sandbox | undefined {
    return activeSandboxes.get(sandboxId);
  },

  /**
   * AR-2: Initialize file versions after sandbox creation or template loading.
   */
  async initFileVersions(sandboxId: string, files: Array<{ path: string; content: string }>): Promise<void> {
    const pipeline = redis.pipeline();
    for (const f of files) {
      const key = `${sandboxId}:${f.path}`;
      fileVersions.set(key, 1);
      fileContents.set(key, f.content);
      // Persist version to Redis for crash recovery
      pipeline.set(`${FILE_VERSION_REDIS_PREFIX}${key}`, '1', 'EX', FILE_VERSION_REDIS_TTL);
    }
    await pipeline.exec();
  },

  /**
   * AR-2: Get current version for a file.
   */
  getFileVersion(sandboxId: string, path: string): number {
    return fileVersions.get(`${sandboxId}:${path}`) ?? 0;
  },

  /**
   * AR-2: Bump version from external change (terminal command modifying a file).
   */
  recordExternalChange(sandboxId: string, path: string, content: string): number {
    const key = `${sandboxId}:${path}`;
    const newVersion = (fileVersions.get(key) ?? 0) + 1;
    fileVersions.set(key, newVersion);
    fileContents.set(key, content);
    // Persist to Redis (fire-and-forget)
    redis.set(`${FILE_VERSION_REDIS_PREFIX}${key}`, String(newVersion), 'EX', FILE_VERSION_REDIS_TTL).catch(() => {});
    return newVersion;
  },

  /**
   * M1-6: Get current file contents from in-memory cache.
   * Returns files that have been tracked via syncFile/initFileVersions.
   */
  getFiles(sandboxId: string): Array<{ path: string; content: string }> {
    const prefix = `${sandboxId}:`;
    const files: Array<{ path: string; content: string }> = [];
    for (const [key, content] of fileContents.entries()) {
      if (key.startsWith(prefix)) {
        files.push({ path: key.slice(prefix.length), content });
      }
    }
    return files;
  },

  /**
   * Clean up orphaned prewarmed sandboxes that were never picked up.
   * Compares activeSandboxes against sessions in DB — kills any sandbox
   * not associated with an active session.
   */
  async cleanupOrphanedSandboxes(): Promise<number> {
    if (!env.E2B_API_KEY) return 0;

    let cleaned = 0;
    const activeSessionIds = new Set<string>();

    try {
      // Include active sessions AND completed sessions with running Stage 2
      const activeSessions = await prisma.session.findMany({
        where: { status: { in: ['CREATED', 'SANDBOX_READY', 'IN_PROGRESS', 'PAUSED'] } },
        select: { sandboxId: true },
      });
      for (const s of activeSessions) {
        if (s.sandboxId) activeSessionIds.add(s.sandboxId);
      }
      // M3: Protect sandboxes with in-progress Stage 2 runs
      const stage2Running = await prisma.stage2Result.findMany({
        where: { completedAt: null },
        select: { session: { select: { sandboxId: true } } },
      });
      for (const s2 of stage2Running) {
        if (s2.session.sandboxId) activeSessionIds.add(s2.session.sandboxId);
      }
    } catch (err) {
      logger.error('Failed to query active sessions for orphan cleanup:', err);
      return 0;
    }

    for (const sandboxId of activeSandboxes.keys()) {
      if (!activeSessionIds.has(sandboxId) && !sandboxId.startsWith('pool-')) {
        logger.info(`Cleaning up orphaned sandbox: ${sandboxId}`);
        await this.kill(sandboxId).catch((e) =>
          logger.error(`Failed to kill orphaned sandbox ${sandboxId}:`, e),
        );
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} orphaned sandboxes`);
    }
    return cleaned;
  },

  /**
   * List all non-hidden, non-dependency files in the sandbox workspace.
   * Used for FileTree sync after terminal creates files.
   */
  async listFiles(sandboxId: string): Promise<string[]> {
    if (degradedSandboxes.has(sandboxId)) return [];
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) return [];
    try {
      const result = await sandbox.commands.run(
        "find . -type f ! -path '*/.*' ! -path '*/node_modules/*' ! -path '*/__pycache__/*' ! -path '*/target/*' ! -path '*/dist/*' | sed 's|^\\./||' | sort",
        { timeoutMs: 5_000 },
      );
      return result.stdout.trim().split('\n').filter(Boolean);
    } catch (e) {
      logger.error(`listFiles failed for ${sandboxId}:`, e);
      return [];
    }
  },

  /**
   * Read a single file from the sandbox (for terminal-created files).
   */
  async readFile(sandboxId: string, path: string): Promise<string | null> {
    if (degradedSandboxes.has(sandboxId)) return null;
    const sandbox = await this._getOrConnect(sandboxId);
    if (!sandbox) return null;
    try {
      const raw = await sandbox.files.read(path);
      return typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);
    } catch (e) {
      logger.error(`readFile failed for ${sandboxId} path=${path}:`, e);
      return null;
    }
  },

  /**
   * Auto-connect to an E2B sandbox if not in the in-memory activeSandboxes map.
   * Needed when sandbox was created externally or server restarted.
   */
  async _getOrConnect(sandboxId: string): Promise<Sandbox | null> {
    const existing = activeSandboxes.get(sandboxId);
    if (existing) return existing;
    // v4 sessions use E2B even when SANDBOX_PROVIDER=docker (docker is v3 only)
    if (!env.E2B_API_KEY) return null;
    try {
      const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.E2B_API_KEY });
      activeSandboxes.set(sandboxId, sandbox as any);
      logger.info(`Auto-connected to E2B sandbox: ${sandboxId}`);
      return sandbox as any;
    } catch (e: any) {
      logger.warn(`Failed to connect to E2B sandbox ${sandboxId}: ${e.message}`);
      return null;
    }
  },

  /**
   * v4 (added for mb1-agent.service.ts): Write a file into the sandbox.
   * Used by the MB1 tool-use loop for the `write_file` tool.
   * Purely additive — does not touch any v3 code path.
   */
  async writeFile(sandboxId: string, path: string, content: string): Promise<boolean> {
    if (degradedSandboxes.has(sandboxId)) return false;
    const sandbox = await this._getOrConnect(sandboxId);
    if (!sandbox) return false;
    try {
      await sandbox.files.write(path, content);
      return true;
    } catch (e) {
      logger.error(`writeFile failed for ${sandboxId} path=${path}:`, e);
      return false;
    }
  },

  /**
   * v4 (added for mb1-agent.service.ts): Run a shell command in the sandbox
   * and return stdout/stderr/exitCode. Used by the MB1 tool-use loop for the
   * `run_command` tool. Purely additive — does not touch any v3 code path.
   */
  async runCommand(
    sandboxId: string,
    cmd: string,
    timeoutMs = 30_000,
    opts?: { cwd?: string; envs?: Record<string, string> },
  ): Promise<{ stdout: string; stderr: string; exitCode: number } | null> {
    if (degradedSandboxes.has(sandboxId)) return null;
    const sandbox = await this._getOrConnect(sandboxId);
    if (!sandbox) return null;
    try {
      const result = await sandbox.commands.run(cmd, {
        timeoutMs,
        ...(opts?.cwd ? { cwd: opts.cwd } : {}),
        ...(opts?.envs ? { envs: opts.envs } : {}),
      });
      return {
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || ''),
        exitCode: typeof result.exitCode === 'number' ? result.exitCode : 0,
      };
    } catch (e: any) {
      // E2B throws on non-zero exit; surface stdout/stderr from the error if present
      const stdout = String(e?.result?.stdout || e?.stdout || '');
      const stderr = String(e?.result?.stderr || e?.stderr || e?.message || '');
      const exitCode = typeof e?.result?.exitCode === 'number' ? e.result.exitCode : 1;
      logger.warn(`runCommand non-zero exit for ${sandboxId}: cmd="${cmd.slice(0, 80)}" exit=${exitCode}`);
      return { stdout, stderr, exitCode };
    }
  },

  /**
   * B14: Delete a file from the sandbox filesystem.
   */
  async deleteFile(sandboxId: string, path: string): Promise<boolean> {
    if (degradedSandboxes.has(sandboxId)) return false;
    const sandbox = activeSandboxes.get(sandboxId);
    if (!sandbox) return false;
    try {
      await sandbox.commands.run(`rm -f "${path}"`, { timeoutMs: 5_000 });
      return true;
    } catch (e) {
      logger.error(`deleteFile failed for ${sandboxId} path=${path}:`, e);
      return false;
    }
  },

  /**
   * AR-11: Get install command based on template language.
   */
  _getInstallCommand(language: string): string | null {
    switch (language.toLowerCase()) {
      case 'python':
        // B12: Include common web/API runtime packages so candidates can run servers
        return 'pip install -q -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn sqlalchemy pytest pytest-json-report pytest-asyncio pytest-metadata fastapi "uvicorn[standard]" httpx requests pydantic pydantic-settings anyio python-multipart';
      case 'typescript':
      case 'javascript':
        return 'npm install 2>/dev/null || true';
      case 'java':
        // B26/B27: JDK17 + Gradle 8.5 + Maven are pre-installed in codelens-sandbox-java:latest image.
        // Network is disabled at runtime (NetworkMode=none) — all deps must be pre-cached.
        // Detect Maven (pom.xml) vs Gradle (build.gradle) and set up accordingly.
        return [
          // Maven project: copy pre-warmed .m2 repo from image root; skip gradlew setup
          'if [ -f pom.xml ]; then',
          '  [ -d ~/.m2 ] || cp -r /root/.m2 ~/.m2 2>/dev/null || true;',
          'else',
          // Gradle project: create gradlew wrapper pointing to system gradle
          '  [ -f gradlew ] || { printf "#!/bin/sh\\ngradle \\"$@\\"\\n" > gradlew && chmod +x gradlew; };',
          '  [ -f build.gradle ] && (nohup gradle dependencies --quiet > /tmp/gradle-init.log 2>&1 &) || true;',
          'fi',
        ].join(' ');
      default:
        return null;
    }
  },
};
