import type { PrismaClient, Session } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUITES, SUITE_IDS } from '@codelens-v5/shared';
import {
  InvalidSuiteIdError,
  SessionNotFoundError,
  SessionService,
  type V5SessionMetadata,
} from './session.service.js';
import { logger } from '../lib/logger.js';

type MockFn = ReturnType<typeof vi.fn>;

function buildMockPrisma(): {
  prisma: PrismaClient;
  sessionCreate: MockFn;
  sessionFindUnique: MockFn;
  sessionFindMany: MockFn;
  sessionUpdate: MockFn;
} {
  const sessionCreate = vi.fn();
  const sessionFindUnique = vi.fn();
  const sessionFindMany = vi.fn();
  const sessionUpdate = vi.fn();
  const prisma = {
    session: {
      create: sessionCreate,
      findUnique: sessionFindUnique,
      findMany: sessionFindMany,
      update: sessionUpdate,
    },
  } as unknown as PrismaClient;
  return {
    prisma,
    sessionCreate,
    sessionFindUnique,
    sessionFindMany,
    sessionUpdate,
  };
}

function mockSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    candidateId: 'cand-1',
    orgId: null,
    schemaVersion: 5,
    status: 'CREATED',
    sandboxId: null,
    startedAt: null,
    completedAt: null,
    expiresAt: new Date('2026-12-31'),
    metadata: {},
    scoringResult: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Session;
}

describe('SessionService.createSession', () => {
  let service: SessionService;
  let sessionCreate: MockFn;

  beforeEach(() => {
    const m = buildMockPrisma();
    service = new SessionService(m.prisma);
    sessionCreate = m.sessionCreate;
    sessionCreate.mockImplementation(async ({ data }) =>
      mockSession({
        candidateId: data.candidateId,
        expiresAt: data.expiresAt,
        metadata: data.metadata,
      }),
    );
  });

  it.each(SUITE_IDS)(
    'creates a session for suite "%s" with the suite\'s moduleOrder',
    async (suiteId) => {
      await service.createSession(suiteId, 'cand-1', 'exam-1');

      expect(sessionCreate).toHaveBeenCalledOnce();
      const call = sessionCreate.mock.calls[0][0];
      const meta = call.data.metadata as V5SessionMetadata;

      expect(meta.suiteId).toBe(suiteId);
      expect(meta.moduleOrder).toEqual([...SUITES[suiteId].modules]);
      expect(meta.examInstanceId).toBe('exam-1');
      expect(meta.schemaVersion).toBe(5);
      expect(meta.submissions).toEqual({});
      expect(meta.assessmentQuality).toBe('full');
    },
  );

  it('sets candidateId and status CREATED on the row', async () => {
    await service.createSession('full_stack', 'cand-42', 'exam-99');
    const call = sessionCreate.mock.calls[0][0];
    expect(call.data.candidateId).toBe('cand-42');
    expect(call.data.status).toBe('CREATED');
    expect(call.data.schemaVersion).toBe(5);
  });

  it('defaults assessmentQuality to "full"', async () => {
    await service.createSession('full_stack', 'cand-1', 'exam-1');
    const call = sessionCreate.mock.calls[0][0];
    const meta = call.data.metadata as V5SessionMetadata;
    expect(meta.assessmentQuality).toBe('full');
  });

  it('throws InvalidSuiteIdError on unknown suiteId', async () => {
    await expect(
      // @ts-expect-error — intentionally passing an invalid suiteId
      service.createSession('Full_Stack', 'cand-1', 'exam-1'),
    ).rejects.toBeInstanceOf(InvalidSuiteIdError);
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it('throws InvalidSuiteIdError on empty string suiteId', async () => {
    await expect(
      // @ts-expect-error — intentionally passing an invalid suiteId
      service.createSession('', 'cand-1', 'exam-1'),
    ).rejects.toBeInstanceOf(InvalidSuiteIdError);
  });

  it('expiresAt defaults to ~80 minutes from now', async () => {
    const before = Date.now();
    await service.createSession('quick_screen', 'cand-1', 'exam-1');
    const after = Date.now();

    const call = sessionCreate.mock.calls[0][0];
    const expiresAtMs = (call.data.expiresAt as Date).getTime();
    const expectedFloor = before + 80 * 60 * 1000;
    const expectedCeil = after + 80 * 60 * 1000;
    expect(expiresAtMs).toBeGreaterThanOrEqual(expectedFloor);
    expect(expiresAtMs).toBeLessThanOrEqual(expectedCeil);
  });

  it('respects custom durationMs option', async () => {
    const before = Date.now();
    await service.createSession('full_stack', 'cand-1', 'exam-1', {
      durationMs: 30 * 60 * 1000,
    });
    const after = Date.now();

    const call = sessionCreate.mock.calls[0][0];
    const expiresAtMs = (call.data.expiresAt as Date).getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 30 * 60 * 1000);
  });
});

describe('SessionService.getSession', () => {
  it('delegates to prisma.session.findUnique', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    const row = mockSession({ id: 'sess-7' });
    m.sessionFindUnique.mockResolvedValue(row);

    const result = await svc.getSession('sess-7');

    expect(result).toBe(row);
    expect(m.sessionFindUnique).toHaveBeenCalledWith({ where: { id: 'sess-7' } });
  });

  it('returns null when session is missing', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(null);

    expect(await svc.getSession('missing')).toBeNull();
  });
});

describe('SessionService.startSession', () => {
  it('flips status to IN_PROGRESS and sets startedAt', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(mockSession());
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.startSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sess-1' });
    expect(call.data.status).toBe('IN_PROGRESS');
    expect(call.data.startedAt).toBeInstanceOf(Date);
  });

  it('throws SessionNotFoundError when session is missing', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(null);

    await expect(svc.startSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(m.sessionUpdate).not.toHaveBeenCalled();
  });

  // Patch 1 — fairness: expiresAt must be reset relative to call time.
  it('resets expiresAt relative to call time preserving original duration (fairness)', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);

    // Simulate a 5-second delay between session creation and start.
    const originalDurationMs = 80 * 60 * 1000;
    const createdAt = new Date(Date.now() - 5_000);
    const staleExpiresAt = new Date(createdAt.getTime() + originalDurationMs);

    m.sessionFindUnique.mockResolvedValue(
      mockSession({
        createdAt,
        expiresAt: staleExpiresAt,
        metadata: { suiteId: 'full_stack' },
      }),
    );
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    const before = Date.now();
    await svc.startSession('sess-1');
    const after = Date.now();

    const call = m.sessionUpdate.mock.calls[0][0];
    const newExpiresAt = (call.data.expiresAt as Date).getTime();

    // New expiresAt ≈ now + originalDurationMs; not the stale value.
    expect(newExpiresAt).toBeGreaterThanOrEqual(before + originalDurationMs);
    expect(newExpiresAt).toBeLessThanOrEqual(after + originalDurationMs);
    expect(newExpiresAt).toBeGreaterThan(staleExpiresAt.getTime() + 4_000);
  });

  // Patch 3 — metadata spread: existing fields must survive startSession.
  it('preserves existing metadata fields (spread)', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);

    const existingMeta = {
      suiteId: 'full_stack',
      moduleOrder: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
      examInstanceId: 'exam-42',
      schemaVersion: 5,
      submissions: { phase0: { done: true } },
      assessmentQuality: 'full',
    };
    m.sessionFindUnique.mockResolvedValue(mockSession({ metadata: existingMeta }));
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.startSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    const meta = call.data.metadata as Record<string, unknown>;
    expect(meta.suiteId).toBe('full_stack');
    expect(meta.moduleOrder).toEqual(existingMeta.moduleOrder);
    expect(meta.examInstanceId).toBe('exam-42');
    expect(meta.schemaVersion).toBe(5);
    expect(meta.submissions).toEqual({ phase0: { done: true } });
    expect(meta.assessmentQuality).toBe('full');
  });

  // Patch 4 — startupMs recorded and warned above threshold.
  it('records startupMs in metadata when provided', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(mockSession({ metadata: { suiteId: 'full_stack' } }));
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.startSession('sess-1', { startupMs: 3_200 });

    const call = m.sessionUpdate.mock.calls[0][0];
    const meta = call.data.metadata as Record<string, unknown>;
    expect(meta.startupMs).toBe(3_200);
  });

  it('logs warn when startupMs exceeds 10s threshold', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(mockSession({ metadata: { suiteId: 'full_stack' } }));
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    try {
      await svc.startSession('sess-1', { startupMs: 12_500 });
      expect(warnSpy).toHaveBeenCalledWith(
        'session slow startup',
        expect.objectContaining({ sessionId: 'sess-1', startupMs: 12_500 }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn when startupMs is under threshold', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(mockSession({ metadata: { suiteId: 'full_stack' } }));
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    try {
      await svc.startSession('sess-1', { startupMs: 1_000 });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('SessionService.endSession', () => {
  it('flips status to COMPLETED and sets completedAt', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(mockSession());
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.endSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sess-1' });
    expect(call.data.status).toBe('COMPLETED');
    expect(call.data.completedAt).toBeInstanceOf(Date);
  });

  it('throws SessionNotFoundError when session is missing', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindUnique.mockResolvedValue(null);

    await expect(svc.endSession('missing')).rejects.toBeInstanceOf(SessionNotFoundError);
    expect(m.sessionUpdate).not.toHaveBeenCalled();
  });

  // Patch 2 — sandbox cleanup via injected killer.
  it('invokes sandboxKiller for every id in metadata.activeSandboxIds', async () => {
    const killed: string[] = [];
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma, {
      sandboxKiller: async (id) => {
        killed.push(id);
      },
    });
    m.sessionFindUnique.mockResolvedValue(
      mockSession({
        metadata: {
          suiteId: 'full_stack',
          activeSandboxIds: ['sb-1', 'sb-2', 'sb-3'],
        },
      }),
    );
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.endSession('sess-1');

    expect(killed).toEqual(['sb-1', 'sb-2', 'sb-3']);
    const call = m.sessionUpdate.mock.calls[0][0];
    const meta = call.data.metadata as Record<string, unknown>;
    expect(meta.activeSandboxIds).toEqual([]);
  });

  it('skips cleanup when activeSandboxIds is missing or empty', async () => {
    const killed: string[] = [];
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma, {
      sandboxKiller: async (id) => {
        killed.push(id);
      },
    });
    m.sessionFindUnique.mockResolvedValue(
      mockSession({ metadata: { suiteId: 'full_stack' } }),
    );
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.endSession('sess-1');

    expect(killed).toEqual([]);
  });

  it('does not throw when sandboxKiller is not configured', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma); // no killer
    m.sessionFindUnique.mockResolvedValue(
      mockSession({
        metadata: { suiteId: 'full_stack', activeSandboxIds: ['sb-1'] },
      }),
    );
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await expect(svc.endSession('sess-1')).resolves.toBeDefined();
  });

  it('continues through individual kill failures and still completes', async () => {
    const seen: string[] = [];
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma, {
      sandboxKiller: async (id) => {
        seen.push(id);
        if (id === 'sb-2') throw new Error('e2b API down');
      },
    });
    m.sessionFindUnique.mockResolvedValue(
      mockSession({
        metadata: {
          suiteId: 'full_stack',
          activeSandboxIds: ['sb-1', 'sb-2', 'sb-3'],
        },
      }),
    );
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    try {
      const result = await svc.endSession('sess-1');
      expect(seen).toEqual(['sb-1', 'sb-2', 'sb-3']);
      expect(result.status).toBe('COMPLETED');
      expect(warnSpy).toHaveBeenCalledWith(
        'session sandbox cleanup failed',
        expect.objectContaining({ sandboxId: 'sb-2' }),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  // Patch 3 — metadata spread: existing fields survive endSession.
  it('preserves existing metadata fields (spread)', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);

    const existingMeta = {
      suiteId: 'architect',
      moduleOrder: ['phase0', 'moduleA', 'moduleD', 'selfAssess', 'moduleC'],
      examInstanceId: 'exam-77',
      schemaVersion: 5,
      submissions: { phase0: { done: true }, moduleA: { round1: 'A' } },
      assessmentQuality: 'full',
      activeSandboxIds: [],
    };
    m.sessionFindUnique.mockResolvedValue(mockSession({ metadata: existingMeta }));
    m.sessionUpdate.mockImplementation(async ({ data }) => mockSession(data));

    await svc.endSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    const meta = call.data.metadata as Record<string, unknown>;
    expect(meta.suiteId).toBe('architect');
    expect(meta.moduleOrder).toEqual(existingMeta.moduleOrder);
    expect(meta.examInstanceId).toBe('exam-77');
    expect(meta.submissions).toEqual(existingMeta.submissions);
    expect(meta.assessmentQuality).toBe('full');
  });
});

describe('SessionService.listSessions', () => {
  it('passes candidateId + status to where clause', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionFindMany.mockResolvedValue([]);

    await svc.listSessions({ candidateId: 'cand-1', status: 'COMPLETED' });

    expect(m.sessionFindMany).toHaveBeenCalledWith({
      where: { candidateId: 'cand-1', status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('post-filters by metadata.suiteId', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);

    const rows = [
      mockSession({ id: 'a', metadata: { suiteId: 'full_stack' } }),
      mockSession({ id: 'b', metadata: { suiteId: 'architect' } }),
      mockSession({ id: 'c', metadata: { suiteId: 'full_stack' } }),
    ];
    m.sessionFindMany.mockResolvedValue(rows);

    const result = await svc.listSessions({ suiteId: 'full_stack' });
    expect(result.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('returns all rows when no filters are passed', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    const rows = [mockSession({ id: 'a' }), mockSession({ id: 'b' })];
    m.sessionFindMany.mockResolvedValue(rows);

    const result = await svc.listSessions();
    expect(result).toBe(rows);
    expect(m.sessionFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: 'desc' },
    });
  });
});
