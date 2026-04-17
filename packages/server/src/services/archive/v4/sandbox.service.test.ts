/**
 * ARCHIVED V4 FILE
 *
 * NOT compiled, NOT run by V5 test suites. Preserved as reference for Task 5
 * Provider test design. Original path:
 * packages/server/src/services/sandbox.service.test.ts (825 lines).
 *
 * V4 test shape: long-lived sandbox + Prisma template/templateFile mocks +
 *                Redis file-version tracking + scaffold injection.
 * V5 test shape: per-Provider lifecycle (create→writeFiles→execute→destroy),
 *                Factory 3-tier fallback (mock E2B fail → Docker / Docker fail
 *                → Static), 5min cache TTL via vi.useFakeTimers, no Prisma.
 *
 * Key test patches to potentially absorb:
 * - vi.hoisted mock pattern for @e2b/code-interpreter（V5 adopt）
 * - timeout-then-kill assertion（V5 adopt for DockerProvider.execute）
 * - OOM (exit 137) recovery test（V5 adopt for DockerProvider）
 * - createSandbox failure path → ensures partial sandbox is destroyed（V5 adopt）
 *
 * Patches to DISCARD:
 * - Prisma template/templateFile fixture setup
 * - Redis fileversion:* key assertions
 * - stage2Running guard tests（V5 short-lived）
 * - Scaffold file exclusion tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ──

const mockSandbox = vi.hoisted(() => ({
  sandboxId: 'e2b-sandbox-123',
  files: {
    write: vi.fn().mockResolvedValue(undefined),
  },
  commands: {
    run: vi.fn().mockResolvedValue({ exitCode: 0 }),
  },
  pty: {
    create: vi.fn().mockResolvedValue({ pid: 42, kill: vi.fn().mockResolvedValue(undefined) }),
    sendInput: vi.fn().mockResolvedValue(undefined),
    resize: vi.fn().mockResolvedValue(undefined),
  },
  kill: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn().mockResolvedValue(undefined),
}));

const mockEnv = vi.hoisted(() => ({
  E2B_API_KEY: 'test-e2b-key',
  AI_CONCURRENCY_LIMIT: 8,
}));

const mockRedis = vi.hoisted(() => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  rpush: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }),
}));

// ── vi.mock calls ──

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: {
    create: vi.fn().mockResolvedValue(mockSandbox),
    connect: vi.fn().mockResolvedValue(mockSandbox),
  },
}));

vi.mock('../config/db.js', () => ({
  prisma: {
    templateFile: {
      findMany: vi.fn().mockResolvedValue([
        { path: 'app.py', content: 'print("hello")', isHidden: false },
        { path: 'test.py', content: 'import pytest', isHidden: false },
      ]),
    },
    template: {
      findUnique: vi.fn().mockResolvedValue({ language: 'python' }),
    },
  },
}));

vi.mock('../config/env.js', () => ({
  env: mockEnv,
}));

vi.mock('../config/redis.js', () => ({
  redis: mockRedis,
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../lib/template-variables.js', () => ({
  applyVariables: vi.fn((content: string, _vars: Record<string, unknown>) => `resolved:${content}`),
}));

// ── Imports (after mocks) ──

import { sandboxService } from './sandbox.service.js';
import { Sandbox } from '@e2b/code-interpreter';
import { prisma } from '../config/db.js';
import { SandboxError } from '../middleware/errorHandler.js';

// ── Helpers ──

/** Reset all internal state by calling setE2bUnavailable(false) and clearing in-memory maps */
function resetServiceState() {
  sandboxService.setE2bUnavailable(false);
}

describe('sandbox.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Restore E2B_API_KEY for most tests
    mockEnv.E2B_API_KEY = 'test-e2b-key';
    resetServiceState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════
  // createSandbox
  // ═══════════════════════════════════════════
  describe('createSandbox', () => {
    it('returns mock sandbox id when E2B_API_KEY is not set', async () => {
      mockEnv.E2B_API_KEY = '';
      const id = await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });
      expect(id).toBe('mock-sandbox-sess-1');
      expect(Sandbox.create).not.toHaveBeenCalled();
    });

    it('creates a real sandbox and loads template files', async () => {
      const id = await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(id).toBe('e2b-sandbox-123');
      expect(Sandbox.create).toHaveBeenCalledWith({
        apiKey: 'test-e2b-key',
        timeoutMs: 60000,
      });
      // Template files written to sandbox (may also write aux files like .codelens_rc)
      expect(mockSandbox.files.write).toHaveBeenCalledWith('app.py', 'print("hello")');
      expect(mockSandbox.files.write).toHaveBeenCalledWith('test.py', 'import pytest');
    });

    it('applies template variables when resolvedVariables provided', async () => {
      const vars = { PORT: 3000 };
      await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
        resolvedVariables: vars,
      });

      // applyVariables mock prepends "resolved:" to content
      expect(mockSandbox.files.write).toHaveBeenCalledWith('app.py', 'resolved:print("hello")');
    });

    it('runs install command based on template language', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        expect.stringContaining('sqlalchemy'),
        { timeoutMs: 30_000 },
      );
    });

    it('runs npm install for typescript templates', async () => {
      (prisma.template.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        language: 'typescript',
      });

      await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(mockSandbox.commands.run).toHaveBeenCalledWith(
        'npm install 2>/dev/null || true',
        { timeoutMs: 30_000 },
      );
    });

    it('enters degraded mode when E2B create fails', async () => {
      (Sandbox.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('E2B down'));

      const id = await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(id).toBe('degraded-sandbox-sess-1');
      expect(sandboxService.isDegraded('degraded-sandbox-sess-1')).toBe(true);
      // Other sandboxes should NOT be affected (per-session isolation)
      expect(sandboxService.isDegraded('other-sandbox')).toBe(false);
    });

    it('e2bUnavailable can be set and cleared independently', () => {
      sandboxService.setE2bUnavailable(true);
      expect(sandboxService.isDegraded()).toBe(true);

      sandboxService.setE2bUnavailable(false);
      expect(sandboxService.isDegraded()).toBe(false);
    });

    it('uses default SANDBOX_TIMEOUT_MS when timeoutMs not provided', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-1',
        templateId: 'tmpl-1',
      });

      // The default comes from destructuring; SANDBOX_TIMEOUT_MS = 55 * 60 * 1000 = 3300000
      expect(Sandbox.create).toHaveBeenCalledWith(
        expect.objectContaining({ timeoutMs: 3_300_000 }),
      );
    });
  });

  // ═══════════════════════════════════════════
  // prewarmSandbox
  // ═══════════════════════════════════════════
  describe('prewarmSandbox', () => {
    it('creates sandbox and stores id in Redis with 600s TTL', async () => {
      const id = await sandboxService.prewarmSandbox('sess-1', 'tmpl-1');

      expect(id).toBe('e2b-sandbox-123');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'prewarm:sess-1',
        'e2b-sandbox-123',
        'EX',
        600,
      );
    });
  });

  // ═══════════════════════════════════════════
  // getOrCreateSandbox
  // ═══════════════════════════════════════════
  describe('getOrCreateSandbox', () => {
    it('returns prewarmed sandbox if available in redis and active', async () => {
      // First create a sandbox so it's in activeSandboxes
      await sandboxService.createSandbox({
        sessionId: 'sess-pre',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      // Mock Redis returning the prewarmed id
      mockRedis.get.mockResolvedValueOnce('e2b-sandbox-123');

      const id = await sandboxService.getOrCreateSandbox({
        sessionId: 'sess-pre',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(id).toBe('e2b-sandbox-123');
      expect(mockRedis.del).toHaveBeenCalledWith('prewarm:sess-pre');
    });

    it('creates new sandbox if no prewarmed id in redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const id = await sandboxService.getOrCreateSandbox({
        sessionId: 'sess-new',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(id).toBe('e2b-sandbox-123');
      expect(Sandbox.create).toHaveBeenCalled();
    });

    it('creates new sandbox if prewarmed id not in activeSandboxes', async () => {
      // Redis returns an id that is NOT in activeSandboxes
      mockRedis.get.mockResolvedValueOnce('stale-sandbox-999');

      const id = await sandboxService.getOrCreateSandbox({
        sessionId: 'sess-stale',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(id).toBe('e2b-sandbox-123');
    });
  });

  // ═══════════════════════════════════════════
  // isDegraded / setE2bUnavailable
  // ═══════════════════════════════════════════
  describe('isDegraded / setE2bUnavailable', () => {
    it('defaults to false', () => {
      expect(sandboxService.isDegraded()).toBe(false);
    });

    it('can be set to true', () => {
      sandboxService.setE2bUnavailable(true);
      expect(sandboxService.isDegraded()).toBe(true);
    });

    it('can be toggled back to false', () => {
      sandboxService.setE2bUnavailable(true);
      sandboxService.setE2bUnavailable(false);
      expect(sandboxService.isDegraded()).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // pauseSandbox
  // ═══════════════════════════════════════════
  describe('pauseSandbox', () => {
    it('does nothing for degraded sandbox', async () => {
      // Simulate a failed creation that marks this sandbox as degraded
      (Sandbox.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('E2B down'));
      const degradedId = await sandboxService.createSandbox({
        sessionId: 'pause-test', templateId: 'tmpl-1', timeoutMs: 60000,
      });
      await sandboxService.pauseSandbox(degradedId);
      expect(mockSandbox.pause).not.toHaveBeenCalled();
    });

    it('does nothing when E2B_API_KEY is not set', async () => {
      mockEnv.E2B_API_KEY = '';
      await sandboxService.pauseSandbox('any-id');
      expect(mockSandbox.pause).not.toHaveBeenCalled();
    });

    it('does nothing if sandbox is not in activeSandboxes', async () => {
      await sandboxService.pauseSandbox('nonexistent-id');
      expect(mockSandbox.pause).not.toHaveBeenCalled();
    });

    it('pauses sandbox, removes from active map, stores in Redis', async () => {
      // Create sandbox first to add to activeSandboxes
      await sandboxService.createSandbox({
        sessionId: 'sess-p',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      await sandboxService.pauseSandbox('e2b-sandbox-123');

      expect(mockSandbox.pause).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith('paused:e2b-sandbox-123', '1', 'EX', 3600);
      expect(sandboxService.getSandbox('e2b-sandbox-123')).toBeUndefined();
    });

    it('handles pause failure gracefully', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-pf',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      mockSandbox.pause.mockRejectedValueOnce(new Error('pause failed'));
      // Should not throw
      await sandboxService.pauseSandbox('e2b-sandbox-123');
    });
  });

  // ═══════════════════════════════════════════
  // resumeSandbox
  // ═══════════════════════════════════════════
  describe('resumeSandbox', () => {
    it('returns null when E2B_API_KEY is not set', async () => {
      mockEnv.E2B_API_KEY = '';
      const result = await sandboxService.resumeSandbox('sb-1');
      expect(result).toBeNull();
    });

    it('connects to sandbox, adds to active map, deletes redis key', async () => {
      const result = await sandboxService.resumeSandbox('sb-resumed');

      expect(Sandbox.connect).toHaveBeenCalledWith('sb-resumed', { apiKey: 'test-e2b-key' });
      expect(result).toBe(mockSandbox);
      expect(mockRedis.del).toHaveBeenCalledWith('paused:sb-resumed');
      expect(sandboxService.getSandbox('sb-resumed')).toBe(mockSandbox);
    });

    it('returns null on connect failure', async () => {
      (Sandbox.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connect failed'));

      const result = await sandboxService.resumeSandbox('sb-fail');
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // preallocatePool
  // ═══════════════════════════════════════════
  describe('preallocatePool', () => {
    it('creates multiple sandboxes and pushes to redis pool', async () => {
      const ids = await sandboxService.preallocatePool(3, 'tmpl-1');

      expect(ids).toHaveLength(3);
      expect(Sandbox.create).toHaveBeenCalledTimes(3);
      expect(mockRedis.rpush).toHaveBeenCalledTimes(3);
      for (const call of (mockRedis.rpush as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call[0]).toBe('sandbox:pool');
      }
    });

    it('stops on failure and returns partial results', async () => {
      // createSandbox catches E2B errors internally, so to trigger the break
      // in preallocatePool we need redis.rpush to throw
      mockRedis.rpush
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('redis down'));

      const ids = await sandboxService.preallocatePool(3, 'tmpl-1');
      expect(ids).toHaveLength(1);
    });

    it('handles count=0 gracefully', async () => {
      const ids = await sandboxService.preallocatePool(0, 'tmpl-1');
      expect(ids).toHaveLength(0);
      expect(Sandbox.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // syncFile — version tracking (AR-2)
  // ═══════════════════════════════════════════
  describe('syncFile', () => {
    it('rejects write with stale baseVersion (conflict)', async () => {
      sandboxService.initFileVersions('sb-sync', [
        { path: 'app.py', content: 'v1 content' },
      ]);
      sandboxService.recordExternalChange('sb-sync', 'app.py', 'v2 content');

      const result = await sandboxService.syncFile('sb-sync', 'app.py', 'stale write', 1);
      expect(result.ok).toBe(false);
      expect(result.newVersion).toBe(2);
      expect(result.serverContent).toBe('v2 content');
    });

    it('accepts write with current baseVersion', async () => {
      sandboxService.initFileVersions('sb-sync2', [
        { path: 'app.py', content: 'v1 content' },
      ]);

      const promise = sandboxService.syncFile('sb-sync2', 'app.py', 'v2 content', 1);
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(result.newVersion).toBe(2);
    });

    it('accepts write without baseVersion (backward compat)', async () => {
      sandboxService.initFileVersions('sb-sync3', [
        { path: 'app.py', content: 'v1 content' },
      ]);

      const promise = sandboxService.syncFile('sb-sync3', 'app.py', 'new content');
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;
      expect(result.ok).toBe(true);
      expect(result.newVersion).toBe(2);
    });

    it('returns immediately for degraded sandbox', async () => {
      // Create a degraded sandbox via failed creation
      (Sandbox.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('E2B down'));
      const degradedId = await sandboxService.createSandbox({
        sessionId: 'sync-deg', templateId: 'tmpl-1', timeoutMs: 60000,
      });
      sandboxService.initFileVersions(degradedId, [
        { path: 'app.py', content: 'original' },
      ]);

      const result = await sandboxService.syncFile(degradedId, 'app.py', 'new content', 1);
      expect(result.ok).toBe(true);
      expect(result.newVersion).toBe(2);
    });

    it('debounces writes and writes to sandbox after delay', async () => {
      // Create sandbox to add to activeSandboxes
      await sandboxService.createSandbox({
        sessionId: 'sess-deb',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });
      vi.clearAllMocks();

      sandboxService.initFileVersions('e2b-sandbox-123', [
        { path: 'file.py', content: 'init' },
      ]);

      // Start syncFile - it creates a debounced timer
      const promise = sandboxService.syncFile('e2b-sandbox-123', 'file.py', 'updated', 1);

      // Advance past debounce (FILE_SYNC_DEBOUNCE_MS = 500)
      await vi.advanceTimersByTimeAsync(600);

      const result = await promise;
      expect(result.ok).toBe(true);
      expect(mockSandbox.files.write).toHaveBeenCalledWith('file.py', 'updated');
    });

    it('resolves with ok:true when sandbox not in active map (non-degraded)', async () => {
      sandboxService.initFileVersions('orphan-sb', [
        { path: 'file.py', content: 'init' },
      ]);

      const promise = sandboxService.syncFile('orphan-sb', 'file.py', 'content', 1);
      await vi.advanceTimersByTimeAsync(600);

      const result = await promise;
      expect(result.ok).toBe(true);
      expect(result.newVersion).toBe(2);
    });
  });

  // ═══════════════════════════════════════════
  // isEchoSuppressed
  // ═══════════════════════════════════════════
  describe('isEchoSuppressed', () => {
    it('returns false for unknown paths', () => {
      expect(sandboxService.isEchoSuppressed('sb-x', 'unknown.py')).toBe(false);
    });

    it('returns true after a syncFile write within TTL', async () => {
      // Create sandbox
      await sandboxService.createSandbox({
        sessionId: 'sess-echo',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      sandboxService.initFileVersions('e2b-sandbox-123', [
        { path: 'echo.py', content: 'init' },
      ]);

      // Trigger syncFile that will write to sandbox
      const promise = sandboxService.syncFile('e2b-sandbox-123', 'echo.py', 'updated', 1);
      await vi.advanceTimersByTimeAsync(600);
      await promise;

      // Should be suppressed now (within 2000ms TTL)
      expect(sandboxService.isEchoSuppressed('e2b-sandbox-123', 'echo.py')).toBe(true);

      // Advance past ECHO_SUPPRESSION_TTL_MS (2000ms)
      await vi.advanceTimersByTimeAsync(2100);
      expect(sandboxService.isEchoSuppressed('e2b-sandbox-123', 'echo.py')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // createPty
  // ═══════════════════════════════════════════
  describe('createPty', () => {
    it('returns no-op PTY for degraded sandbox', async () => {
      (Sandbox.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('E2B down'));
      const degradedId = await sandboxService.createSandbox({
        sessionId: 'pty-deg', templateId: 'tmpl-1', timeoutMs: 60000,
      });
      const onData = vi.fn();
      const pty = await sandboxService.createPty(degradedId, onData);

      expect(pty.write).toBeTypeOf('function');
      expect(pty.kill).toBeTypeOf('function');
      expect(pty.resize).toBeTypeOf('function');

      // No-ops should not throw
      pty.write('test');
      pty.kill();
      pty.resize({ cols: 80, rows: 24 });
    });

    it('throws SandboxError when sandbox not found', async () => {
      await expect(
        sandboxService.createPty('nonexistent', vi.fn()),
      ).rejects.toThrow(SandboxError);
    });

    it('creates PTY with default dimensions', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-pty',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      const onData = vi.fn();
      const pty = await sandboxService.createPty('e2b-sandbox-123', onData);

      expect(mockSandbox.pty.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cols: 120,
          rows: 40,
          timeoutMs: 0,
          onData,
        }),
      );

      expect(pty.write).toBeTypeOf('function');
      expect(pty.kill).toBeTypeOf('function');
      expect(pty.resize).toBeTypeOf('function');
    });

    it('creates PTY with custom dimensions', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-pty2',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      const onData = vi.fn();
      await sandboxService.createPty('e2b-sandbox-123', onData, { cols: 80, rows: 24 });

      expect(mockSandbox.pty.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cols: 80,
          rows: 24,
          timeoutMs: 0,
          onData,
        }),
      );
    });

    it('PTY write sends input to sandbox', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-pty3',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      const pty = await sandboxService.createPty('e2b-sandbox-123', vi.fn());
      pty.write('ls\n');

      // sendInput is called with pid and encoded data
      expect(mockSandbox.pty.sendInput).toHaveBeenCalledWith(42, expect.any(Uint8Array));
    });

    it('PTY resize calls sandbox.pty.resize', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-pty4',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      const pty = await sandboxService.createPty('e2b-sandbox-123', vi.fn());
      pty.resize({ cols: 100, rows: 50 });

      expect(mockSandbox.pty.resize).toHaveBeenCalledWith(42, { cols: 100, rows: 50 });
    });
  });

  // ═══════════════════════════════════════════
  // reconnect
  // ═══════════════════════════════════════════
  describe('reconnect', () => {
    it('throws SandboxError when E2B_API_KEY not configured', async () => {
      mockEnv.E2B_API_KEY = '';
      await expect(sandboxService.reconnect('sb-1')).rejects.toThrow(SandboxError);
      await expect(sandboxService.reconnect('sb-1')).rejects.toThrow('E2B_API_KEY not configured');
    });

    it('connects to sandbox and adds to active map', async () => {
      const sandbox = await sandboxService.reconnect('sb-reconnect');

      expect(Sandbox.connect).toHaveBeenCalledWith('sb-reconnect', { apiKey: 'test-e2b-key' });
      expect(sandbox).toBe(mockSandbox);
      expect(sandboxService.getSandbox('sb-reconnect')).toBe(mockSandbox);
    });
  });

  // ═══════════════════════════════════════════
  // kill
  // ═══════════════════════════════════════════
  describe('kill', () => {
    it('kills sandbox and removes from active map', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-kill',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });

      expect(sandboxService.getSandbox('e2b-sandbox-123')).toBeDefined();

      await sandboxService.kill('e2b-sandbox-123');

      expect(mockSandbox.kill).toHaveBeenCalled();
      expect(sandboxService.getSandbox('e2b-sandbox-123')).toBeUndefined();
    });

    it('does nothing for unknown sandbox id', async () => {
      await sandboxService.kill('nonexistent');
      expect(mockSandbox.kill).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // getSandbox
  // ═══════════════════════════════════════════
  describe('getSandbox', () => {
    it('returns undefined for unknown sandbox', () => {
      expect(sandboxService.getSandbox('unknown')).toBeUndefined();
    });

    it('returns sandbox after creation', async () => {
      await sandboxService.createSandbox({
        sessionId: 'sess-get',
        templateId: 'tmpl-1',
        timeoutMs: 60000,
      });
      expect(sandboxService.getSandbox('e2b-sandbox-123')).toBe(mockSandbox);
    });
  });

  // ═══════════════════════════════════════════
  // initFileVersions
  // ═══════════════════════════════════════════
  describe('initFileVersions', () => {
    it('initializes versions to 1 for all files', () => {
      sandboxService.initFileVersions('sb-init', [
        { path: 'a.py', content: 'aaa' },
        { path: 'b.py', content: 'bbb' },
      ]);

      expect(sandboxService.getFileVersion('sb-init', 'a.py')).toBe(1);
      expect(sandboxService.getFileVersion('sb-init', 'b.py')).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  // getFileVersion
  // ═══════════════════════════════════════════
  describe('getFileVersion', () => {
    it('returns 0 for unknown files', () => {
      expect(sandboxService.getFileVersion('sb-x', 'unknown.py')).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // recordExternalChange
  // ═══════════════════════════════════════════
  describe('recordExternalChange', () => {
    it('bumps version and caches content', () => {
      sandboxService.initFileVersions('sb-ext', [
        { path: 'file.py', content: 'original' },
      ]);

      const newVersion = sandboxService.recordExternalChange('sb-ext', 'file.py', 'modified');
      expect(newVersion).toBe(2);
      expect(sandboxService.getFileVersion('sb-ext', 'file.py')).toBe(2);
    });

    it('starts from 1 for files without prior version', () => {
      const newVersion = sandboxService.recordExternalChange('sb-new', 'new.py', 'content');
      expect(newVersion).toBe(1);
    });
  });

  // ═══════════════════════════════════════════
  // getFiles
  // ═══════════════════════════════════════════
  describe('getFiles', () => {
    it('returns all tracked files for a sandbox', () => {
      sandboxService.initFileVersions('sb-files', [
        { path: 'a.py', content: 'aaa' },
        { path: 'b.py', content: 'bbb' },
      ]);

      const files = sandboxService.getFiles('sb-files');
      expect(files).toHaveLength(2);
      expect(files).toContainEqual({ path: 'a.py', content: 'aaa' });
      expect(files).toContainEqual({ path: 'b.py', content: 'bbb' });
    });

    it('returns empty array for unknown sandbox', () => {
      const files = sandboxService.getFiles('sb-unknown');
      expect(files).toEqual([]);
    });

    it('reflects content updates from recordExternalChange', () => {
      sandboxService.initFileVersions('sb-up', [
        { path: 'f.py', content: 'v1' },
      ]);
      sandboxService.recordExternalChange('sb-up', 'f.py', 'v2');

      const files = sandboxService.getFiles('sb-up');
      expect(files).toContainEqual({ path: 'f.py', content: 'v2' });
    });
  });

  // ═══════════════════════════════════════════
  // _getInstallCommand
  // ═══════════════════════════════════════════
  describe('_getInstallCommand', () => {
    it('returns pip install for python', () => {
      const cmd = sandboxService._getInstallCommand('python');
      expect(cmd).toContain('sqlalchemy');
      expect(cmd).toContain('pytest');
    });

    it('returns npm install for typescript', () => {
      expect(sandboxService._getInstallCommand('typescript')).toBe('npm install 2>/dev/null || true');
    });

    it('returns npm install for javascript', () => {
      expect(sandboxService._getInstallCommand('javascript')).toBe('npm install 2>/dev/null || true');
    });

    // Regression: previously returned mvn command, but Docker sandbox uses system gradle + wrapper.
    // Bug: _getInstallCommand was only run in E2B path; Docker path skipped it entirely so no gradlew was created.
    // Fix: sandbox.service.ts Docker path now explicitly runs gradlew setup for java.
    it('returns gradlew wrapper setup for java', () => {
      const cmd = sandboxService._getInstallCommand('java');
      expect(cmd).toContain('gradlew');
      expect(cmd).not.toContain('mvn');
    });

    it('returns null for unknown languages', () => {
      expect(sandboxService._getInstallCommand('rust')).toBeNull();
      expect(sandboxService._getInstallCommand('go')).toBeNull();
    });

    it('is case-insensitive', () => {
      const cmd = sandboxService._getInstallCommand('Python');
      expect(cmd).toContain('sqlalchemy');
      expect(sandboxService._getInstallCommand('TYPESCRIPT')).toBe('npm install 2>/dev/null || true');
    });
  });
});
