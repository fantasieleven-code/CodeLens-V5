/**
 * SessionService — V5 session lifecycle (suite-aware, tier-free).
 *
 * 约定 (backend-agent-tasks.md Task 3 + line 1497):
 * - createSession 从 SUITES[suiteId].modules 生成 moduleOrder 写入 metadata。
 * - metadata = { suiteId, moduleOrder, examInstanceId, schemaVersion, submissions }。
 *   schemaVersion 既在 Prisma 列也在 metadata（双写,metadata 供 V5 应用层做不变量检查）。
 * - 不支持 V4 的 tier 概念;传入非法 suiteId 抛 InvalidSuiteIdError。
 * - suiteId / moduleOrder / examInstanceId 存 Json metadata,列层面没有独立字段。
 */

import type { PrismaClient, Session, Prisma } from '@prisma/client';
import type { V5ModuleKey, SuiteId } from '@codelens-v5/shared';
import { SUITES, isSuiteId } from '@codelens-v5/shared';
import { prisma as defaultPrisma } from '../config/db.js';

export interface V5SessionMetadata {
  suiteId: SuiteId;
  moduleOrder: V5ModuleKey[];
  examInstanceId: string;
  schemaVersion: 5;
  submissions: Record<string, unknown>;
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

/** Default session validity window (matches V4 zod sessionCreateSchema 80min default). */
const DEFAULT_DURATION_MS = 80 * 60 * 1000;

export class InvalidSuiteIdError extends Error {
  constructor(suiteId: string) {
    super(
      `Invalid suiteId: "${suiteId}". Must be one of: ${Object.keys(SUITES).join(', ')}`,
    );
    this.name = 'InvalidSuiteIdError';
  }
}

export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}

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

  startSession(sessionId: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
  }

  endSession(sessionId: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', completedAt: new Date() },
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

    // suiteId lives in Json metadata; filter post-query.
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
