import type { PrismaClient, Session } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SUITES, SUITE_IDS } from '@codelens-v5/shared';
import {
  InvalidSuiteIdError,
  SessionService,
  type V5SessionMetadata,
} from './session.service.js';

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
    },
  );

  it('sets candidateId and status CREATED on the row', async () => {
    await service.createSession('full_stack', 'cand-42', 'exam-99');
    const call = sessionCreate.mock.calls[0][0];
    expect(call.data.candidateId).toBe('cand-42');
    expect(call.data.status).toBe('CREATED');
    expect(call.data.schemaVersion).toBe(5);
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

describe('SessionService.startSession / endSession', () => {
  it('startSession flips status to IN_PROGRESS and sets startedAt', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionUpdate.mockImplementation(async ({ data }) =>
      mockSession({ status: data.status, startedAt: data.startedAt }),
    );

    await svc.startSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sess-1' });
    expect(call.data.status).toBe('IN_PROGRESS');
    expect(call.data.startedAt).toBeInstanceOf(Date);
  });

  it('endSession flips status to COMPLETED and sets completedAt', async () => {
    const m = buildMockPrisma();
    const svc = new SessionService(m.prisma);
    m.sessionUpdate.mockImplementation(async ({ data }) =>
      mockSession({ status: data.status, completedAt: data.completedAt }),
    );

    await svc.endSession('sess-1');

    const call = m.sessionUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'sess-1' });
    expect(call.data.status).toBe('COMPLETED');
    expect(call.data.completedAt).toBeInstanceOf(Date);
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
