/**
 * SessionService — V5 session lifecycle (suite-aware, tier-free).
 *
 * 约定 (backend-agent-tasks.md Task 3 + tasks.md line 1497 + V4 patch absorption):
 * - createSession 从 SUITES[suiteId].modules 生成 moduleOrder 写入 metadata。
 * - metadata = {
 *     suiteId, moduleOrder, examInstanceId, schemaVersion, submissions,
 *     assessmentQuality, activeSandboxIds?, startupMs?
 *   }
 * - startSession 重算 expiresAt = now + originalDurationMs，吸收前端鉴权/
 *   连接等待和(后续)sandbox 冷启动时间 — fairness to candidate。
 * - endSession defensive 清理 metadata.activeSandboxIds(通过注入的
 *   sandboxKiller),个别失败不阻止整体 end。
 * - 所有 prisma.session.update 写 metadata 时 spread existing metadata，
 *   防止 suiteId / moduleOrder / submissions 等被覆盖。
 * - assessmentQuality 在 createSession 默认 'full'；Task 5 降级场景切 'degraded'。
 * - 不支持 V4 的 tier 概念；传入非法 suiteId 抛 InvalidSuiteIdError。
 */

import type { PrismaClient, Session, Prisma } from '@prisma/client';
import type { V5ModuleKey, SuiteId } from '@codelens-v5/shared';
import { SUITES, isSuiteId } from '@codelens-v5/shared';
import { prisma as defaultPrisma } from '../config/db.js';
import { logger } from '../lib/logger.js';

export interface V5SessionMetadata {
  suiteId: SuiteId;
  moduleOrder: V5ModuleKey[];
  examInstanceId: string;
  schemaVersion: 5;
  submissions: Record<string, unknown>;
  assessmentQuality: 'full' | 'degraded';
  /** Sandbox ids that are still alive; endSession kills these defensively. */
  activeSandboxIds?: string[];
  /** Startup wall-time reported by caller (sandbox / WS connect). */
  startupMs?: number;
}

export interface SessionListFilters {
  candidateId?: string;
  suiteId?: SuiteId;
  status?: string;
}

export interface CreateSessionOptions {
  /** Override default session duration. */
  durationMs?: number;
}

export interface StartSessionOptions {
  /**
   * Startup wall-time measured by the caller (sandbox / WS connect).
   * Recorded in metadata.startupMs; logged with warn if > SANDBOX_STARTUP_WARN_MS.
   */
  startupMs?: number;
}

export interface SessionServiceOptions {
  /**
   * Hook invoked per active sandbox id during endSession. Task 5 wires the
   * SandboxProvider's kill method here; default is a no-op so unit tests
   * and V5.0 non-sandbox flows do not fail.
   */
  sandboxKiller?: (sandboxId: string) => Promise<void>;
}

/** Default session validity window (matches V4 sessionCreateSchema 80min default). */
const DEFAULT_DURATION_MS = 80 * 60 * 1000;

/** startupMs threshold above which we log a warning. */
const SANDBOX_STARTUP_WARN_MS = 10_000;

export class InvalidSuiteIdError extends Error {
  constructor(suiteId: string) {
    super(
      `Invalid suiteId: "${suiteId}". Must be one of: ${Object.keys(SUITES).join(', ')}`,
    );
    this.name = 'InvalidSuiteIdError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

function extractActiveSandboxIds(meta: Record<string, unknown>): string[] {
  const raw = meta.activeSandboxIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

export class SessionService {
  private readonly sandboxKiller?: (id: string) => Promise<void>;

  constructor(
    private readonly prisma: PrismaClient,
    opts: SessionServiceOptions = {},
  ) {
    this.sandboxKiller = opts.sandboxKiller;
  }

  async createSession(
    suiteId: SuiteId,
    candidateId: string,
    examInstanceId: string,
    opts?: CreateSessionOptions,
  ): Promise<Session> {
    if (!isSuiteId(suiteId)) {
      throw new InvalidSuiteIdError(suiteId as string);
    }

    const suite = SUITES[suiteId];
    const metadata: V5SessionMetadata = {
      suiteId,
      moduleOrder: [...suite.modules] as V5ModuleKey[],
      examInstanceId,
      schemaVersion: 5,
      submissions: {},
      assessmentQuality: 'full',
    };

    const durationMs = opts?.durationMs ?? DEFAULT_DURATION_MS;
    const expiresAt = new Date(Date.now() + durationMs);

    return this.prisma.session.create({
      data: {
        candidateId,
        schemaVersion: 5,
        status: 'CREATED',
        expiresAt,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
  }

  getSession(sessionId: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id: sessionId } });
  }

  /**
   * Fairness: resets expiresAt relative to now, preserving the original
   * duration. Covers the pre-assessment latency (auth handshake, WS connect,
   * Task 5+ sandbox cold-start) so candidates always get the full allotment.
   */
  async startSession(sessionId: string, opts?: StartSessionOptions): Promise<Session> {
    const existing = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!existing) throw new SessionNotFoundError(sessionId);

    const now = new Date();
    const originalDurationMs = existing.expiresAt.getTime() - existing.createdAt.getTime();
    const newExpiresAt = new Date(now.getTime() + originalDurationMs);

    const existingMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
    const nextMeta: Record<string, unknown> = { ...existingMeta };

    if (opts?.startupMs !== undefined) {
      nextMeta.startupMs = opts.startupMs;
      if (opts.startupMs > SANDBOX_STARTUP_WARN_MS) {
        logger.warn('session slow startup', {
          sessionId,
          startupMs: opts.startupMs,
        });
      }
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: now,
        expiresAt: newExpiresAt,
        metadata: nextMeta as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Defensively kills any sandboxes listed in metadata.activeSandboxIds
   * before transitioning to COMPLETED. Individual kill failures are logged
   * but do not abort the state transition.
   */
  async endSession(sessionId: string): Promise<Session> {
    const existing = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!existing) throw new SessionNotFoundError(sessionId);

    const existingMeta = (existing.metadata as Record<string, unknown> | null) ?? {};
    const sandboxIds = extractActiveSandboxIds(existingMeta);

    if (this.sandboxKiller && sandboxIds.length > 0) {
      for (const id of sandboxIds) {
        try {
          await this.sandboxKiller(id);
        } catch (err) {
          logger.warn('session sandbox cleanup failed', {
            sessionId,
            sandboxId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const nextMeta: Record<string, unknown> = {
      ...existingMeta,
      activeSandboxIds: [],
    };

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        metadata: nextMeta as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async listSessions(filters?: SessionListFilters): Promise<Session[]> {
    const where: { candidateId?: string; status?: string } = {};
    if (filters?.candidateId) where.candidateId = filters.candidateId;
    if (filters?.status) where.status = filters.status;

    const sessions = await this.prisma.session.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (filters?.suiteId) {
      const target = filters.suiteId;
      return sessions.filter((s) => {
        const meta = s.metadata as Partial<V5SessionMetadata> | null;
        return meta?.suiteId === target;
      });
    }
    return sessions;
  }
}

export const sessionService = new SessionService(defaultPrisma);
