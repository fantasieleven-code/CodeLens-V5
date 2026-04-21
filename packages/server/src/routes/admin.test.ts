/**
 * Admin routes — Task 15b §10 test coverage.
 *
 * Strategy: mock `config/db.js` + `scoring-hydrator.service.js`, invoke each
 * handler directly with a mocked Request/Response/NextFunction triple. This
 * mirrors the existing pattern (see file-snapshot.service.test.ts) and keeps
 * the suite DB-free.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { V5AdminSessionCreateRequest, V5ScoringResult } from '@codelens-v5/shared';

// ────────────────────────── hoisted mocks ──────────────────────────

const sessionFindUnique = vi.hoisted(() => vi.fn());
const sessionFindMany = vi.hoisted(() => vi.fn());
const sessionCount = vi.hoisted(() => vi.fn());
const sessionCreate = vi.hoisted(() => vi.fn());
const candidateUpsert = vi.hoisted(() => vi.fn());
const examInstanceFindUnique = vi.hoisted(() => vi.fn());
const examInstanceFindMany = vi.hoisted(() => vi.fn());
const hydrateAndScore = vi.hoisted(() => vi.fn());

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-123456',
    JWT_ADMIN_EXPIRY: '8h',
    JWT_CANDIDATE_EXPIRY: '90m',
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://test/test',
    REDIS_URL: 'redis://localhost:6379',
    SANDBOX_PROVIDER: 'docker',
    PORT: 4000,
  },
}));

vi.mock('../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: sessionFindUnique,
      findMany: sessionFindMany,
      count: sessionCount,
      create: sessionCreate,
    },
    candidate: {
      upsert: candidateUpsert,
    },
    examInstance: {
      findUnique: examInstanceFindUnique,
      findMany: examInstanceFindMany,
    },
  },
}));

vi.mock('../services/scoring-hydrator.service.js', () => ({
  scoringHydratorService: {
    hydrateAndScore,
  },
}));

vi.mock('../services/auth.service.js', () => ({
  signShareToken: vi.fn(() => 'mock-share-token'),
}));

// signals/index.js imports 48 signal modules which pull env etc. The admin
// registry is only exercised in the report endpoint test; stub the heavy
// registerAllSignals so unrelated tests don't pay the module-load cost.
vi.mock('../signals/index.js', () => ({
  registerAllSignals: vi.fn((reg: { register: (d: unknown) => void }) => {
    reg.register({
      id: 'sMock',
      dimension: 'technicalJudgment',
      moduleSource: 'P0',
      isLLMWhitelist: false,
      compute: async () => ({ value: 1, evidence: [], computedAt: 0, algorithmVersion: 'v1' }),
    });
  }),
}));

import {
  createAdminSession,
  listAdminSessions,
  getAdminSession,
  getAdminSessionReport,
  getAdminSessionProfile,
  listAdminExamInstances,
  listAdminSuites,
  getAdminStatsOverview,
} from './admin.js';

// ────────────────────────── test helpers ──────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    orgId: 'org-1',
    query: {},
    params: {},
    body: {},
    headers: { origin: 'https://app.test' },
    protocol: 'https',
    get: () => 'app.test',
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

function makeNext(): NextFunction & { mock: ReturnType<typeof vi.fn> } {
  const fn = vi.fn();
  return fn as unknown as NextFunction & { mock: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
  sessionFindMany.mockReset();
  sessionCount.mockReset();
  sessionCreate.mockReset();
  candidateUpsert.mockReset();
  examInstanceFindUnique.mockReset();
  examInstanceFindMany.mockReset();
  hydrateAndScore.mockReset();
});

// ────────────────────────── endpoint 1: create session ──────────────────────────

describe('POST /admin/sessions/create', () => {
  const validBody: V5AdminSessionCreateRequest = {
    suiteId: 'full_stack',
    examInstanceId: 'exam-1',
    candidate: { name: 'Alice', email: 'alice@example.com' },
  };

  it('creates a session + candidate and returns shareableLink', async () => {
    examInstanceFindUnique.mockResolvedValue({ id: 'exam-1', orgId: 'org-1' });
    candidateUpsert.mockResolvedValue({ id: 'cand-1', name: 'Alice', email: 'alice@example.com' });
    sessionCreate.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'CREATED',
      candidateId: 'cand-1',
      candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' },
      createdAt: new Date(1_700_000_000_000),
      startedAt: null,
      completedAt: null,
      metadata: { suiteId: 'full_stack', examInstanceId: 'exam-1' },
      scoringResult: null,
    });

    const req = makeReq({ body: validBody });
    const { res, status } = makeRes();
    const next = makeNext();

    await createAdminSession(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(201);
    const payload = status.mock.results[0]!.value.json.mock.calls[0][0];
    expect(payload.session.id).toBe('sess-1');
    expect(payload.session.candidate.email).toBe('alice@example.com');
    expect(payload.shareableLink).toBe('https://app.test/shared/mock-share-token');
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orgId: 'org-1' }) }),
    );
    // B-A12 auth-fallback · candidateToken minted + returned + persisted.
    expect(payload.candidateToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const createArgs = sessionCreate.mock.calls[0][0] as {
      data: { candidateToken: string; candidateSelfViewToken: string };
    };
    expect(createArgs.data.candidateToken).toBe(payload.candidateToken);
  });

  it('B-A10-lite · mints candidateSelfViewToken distinct from candidateToken and persists both', async () => {
    examInstanceFindUnique.mockResolvedValue({ id: 'exam-1', orgId: 'org-1' });
    candidateUpsert.mockResolvedValue({ id: 'cand-1', name: 'Alice', email: 'alice@example.com' });
    sessionCreate.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'CREATED',
      candidateId: 'cand-1',
      candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' },
      createdAt: new Date(1_700_000_000_000),
      startedAt: null,
      completedAt: null,
      metadata: { suiteId: 'full_stack', examInstanceId: 'exam-1' },
      scoringResult: null,
    });

    const req = makeReq({ body: validBody });
    const { res, status } = makeRes();
    await createAdminSession(req, res, makeNext());

    const payload = status.mock.results[0]!.value.json.mock.calls[0][0];
    expect(payload.candidateSelfViewToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(payload.candidateSelfViewToken).not.toBe(payload.candidateToken);

    const createArgs = sessionCreate.mock.calls[0][0] as {
      data: { candidateToken: string; candidateSelfViewToken: string };
    };
    expect(createArgs.data.candidateSelfViewToken).toBe(payload.candidateSelfViewToken);
  });

  it('B-A10-lite · selfViewUrl embeds sessionId + selfViewToken off request origin', async () => {
    examInstanceFindUnique.mockResolvedValue({ id: 'exam-1', orgId: 'org-1' });
    candidateUpsert.mockResolvedValue({ id: 'cand-1', name: 'Alice', email: 'alice@example.com' });
    sessionCreate.mockResolvedValue({
      id: 'sess-xyz',
      orgId: 'org-1',
      status: 'CREATED',
      candidateId: 'cand-1',
      candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' },
      createdAt: new Date(1_700_000_000_000),
      startedAt: null,
      completedAt: null,
      metadata: { suiteId: 'full_stack', examInstanceId: 'exam-1' },
      scoringResult: null,
    });

    const req = makeReq({ body: validBody });
    const { res, status } = makeRes();
    await createAdminSession(req, res, makeNext());

    const payload = status.mock.results[0]!.value.json.mock.calls[0][0];
    expect(payload.selfViewUrl).toBe(
      `https://app.test/candidate/self-view/sess-xyz/${payload.candidateSelfViewToken}`,
    );
  });

  it('B-A10-lite · selfViewUrl and shareableLink are distinct (two-audience separation)', async () => {
    examInstanceFindUnique.mockResolvedValue({ id: 'exam-1', orgId: 'org-1' });
    candidateUpsert.mockResolvedValue({ id: 'cand-1', name: 'Alice', email: 'alice@example.com' });
    sessionCreate.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'CREATED',
      candidateId: 'cand-1',
      candidate: { id: 'cand-1', name: 'Alice', email: 'alice@example.com' },
      createdAt: new Date(1_700_000_000_000),
      startedAt: null,
      completedAt: null,
      metadata: { suiteId: 'full_stack', examInstanceId: 'exam-1' },
      scoringResult: null,
    });

    const req = makeReq({ body: validBody });
    const { res, status } = makeRes();
    await createAdminSession(req, res, makeNext());

    const payload = status.mock.results[0]!.value.json.mock.calls[0][0];
    expect(payload.selfViewUrl).not.toBe(payload.shareableLink);
    expect(payload.shareableLink).toMatch(/\/shared\//);
    expect(payload.selfViewUrl).toMatch(/\/candidate\/self-view\//);
  });

  it('refuses when orgId missing (auth guard)', async () => {
    const req = makeReq({ orgId: undefined, body: validBody });
    const next = makeNext();
    await createAdminSession(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });

  it('refuses invalid suiteId', async () => {
    const req = makeReq({ body: { ...validBody, suiteId: 'nope' as 'full_stack' } });
    const next = makeNext();
    await createAdminSession(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('refuses cross-org ExamInstance', async () => {
    examInstanceFindUnique.mockResolvedValue({ id: 'exam-1', orgId: 'org-OTHER' });
    const req = makeReq({ body: validBody });
    const next = makeNext();
    await createAdminSession(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

// ────────────────────────── endpoint 2: list sessions ──────────────────────────

describe('GET /admin/sessions', () => {
  it('returns paginated envelope scoped to orgId', async () => {
    sessionCount.mockResolvedValue(2);
    sessionFindMany.mockResolvedValue([
      {
        id: 's1',
        orgId: 'org-1',
        status: 'COMPLETED',
        candidateId: 'c1',
        candidate: { id: 'c1', name: 'X', email: 'x@y.com' },
        createdAt: new Date(1),
        startedAt: null,
        completedAt: new Date(2),
        metadata: { suiteId: 'full_stack', examInstanceId: 'e1' },
        scoringResult: { grade: 'A', composite: 80 },
      },
    ]);

    const req = makeReq({ query: { page: '1', pageSize: '10' } });
    const { res, json } = makeRes();
    await listAdminSessions(req, res, makeNext());

    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: 'org-1' }) }),
    );
    const payload = json.mock.calls[0][0];
    expect(payload.total).toBe(2);
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].grade).toBe('A');
    expect(payload.items[0].composite).toBe(80);
  });
});

// ────────────────────────── endpoint 3: get session ──────────────────────────

describe('GET /admin/sessions/:sessionId', () => {
  it('returns session when orgId matches', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'IN_PROGRESS',
      candidateId: 'c1',
      candidate: { id: 'c1', name: 'Alice', email: 'a@b.com' },
      createdAt: new Date(1),
      startedAt: new Date(2),
      completedAt: null,
      metadata: { suiteId: 'architect', examInstanceId: 'e1' },
      scoringResult: null,
    });
    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const { res, json } = makeRes();
    await getAdminSession(req, res, makeNext());
    const payload = json.mock.calls[0][0];
    expect(payload.id).toBe('sess-1');
    expect(payload.suiteId).toBe('architect');
  });

  it('404s when session missing', async () => {
    sessionFindUnique.mockResolvedValue(null);
    const req = makeReq({ params: { sessionId: 'sess-missing' } });
    const next = makeNext();
    await getAdminSession(req, makeRes().res, next);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].statusCode).toBe(404);
  });

  it('403s on cross-org access (orgId scope)', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-OTHER',
      status: 'CREATED',
      candidateId: 'c1',
      candidate: { id: 'c1', name: '', email: '' },
      createdAt: new Date(1),
      startedAt: null,
      completedAt: null,
      metadata: {},
      scoringResult: null,
    });
    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const next = makeNext();
    await getAdminSession(req, makeRes().res, next);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].statusCode).toBe(403);
  });
});

// ────────────────────────── endpoint 4: report ──────────────────────────

describe('GET /admin/sessions/:sessionId/report', () => {
  const mockScoring: V5ScoringResult = {
    grade: 'A',
    composite: 80,
    dimensions: {
      technicalJudgment: 80,
      aiEngineering: 75,
      systemDesign: 70,
      codeQuality: 80,
      communication: 85,
      metacognition: 70,
    },
    confidence: 'high',
    boundaryAnalysis: {
      nearestUpperGrade: 'S',
      distanceToUpper: 5,
      blockingFactor: null,
      nearestLowerGrade: 'B+',
      distanceToLower: 15,
    },
    reasoning: 'mock',
    signals: {},
    capabilityProfiles: [],
  };

  it('refuses non-completed sessions', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'IN_PROGRESS',
      candidate: { id: 'c1', name: 'X', email: 'x@y.com' },
      createdAt: new Date(1),
      completedAt: null,
      metadata: {},
      scoringResult: null,
    });
    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const next = makeNext();
    await getAdminSessionReport(req, makeRes().res, next);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0].statusCode).toBe(400);
  });

  it('assembles V5AdminSessionReport on happy path', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      status: 'COMPLETED',
      candidate: { id: 'c1', name: 'Alice', email: 'a@b.com' },
      createdAt: new Date(1),
      completedAt: new Date(2),
      metadata: { submissions: { foo: 'bar' } },
      scoringResult: mockScoring,
    });
    hydrateAndScore.mockResolvedValue({
      sessionId: 'sess-1',
      suiteId: 'full_stack',
      participatingModules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
      scoringResult: mockScoring,
      hydrationReport: { phase0: 'present', moduleA: 'present', mb: 'present', moduleD: 'absent', selfAssess: 'present', moduleC: 'present', examData: {} },
    });

    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const { res, json } = makeRes();
    await getAdminSessionReport(req, res, makeNext());
    const payload = json.mock.calls[0][0];
    expect(payload.sessionId).toBe('sess-1');
    expect(payload.suite.id).toBe('full_stack');
    expect(payload.gradeDecision.grade).toBe('A');
    expect(payload.gradeDecision.composite).toBe(80);
    expect(payload.signalDefinitions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'sMock' })]),
    );
  });
});

// ────────────────────────── endpoint 8: session profile (Task B-A12) ──────────────────────────

describe('GET /admin/sessions/:sessionId/profile', () => {
  const mockProfile = {
    yearsOfExperience: 5,
    currentRole: 'backend' as const,
    primaryTechStack: ['go', 'postgres'],
    companySize: 'medium' as const,
    aiToolYears: 1 as const,
    primaryAiTool: 'cursor' as const,
    dailyAiUsageHours: '1_3' as const,
  };

  it('returns candidate profile + consentAcceptedAt when session matches orgId', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-1',
      candidateProfile: mockProfile,
      consentAcceptedAt: new Date('2026-04-20T10:15:00.000Z'),
    });
    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const { res, json } = makeRes();
    await getAdminSessionProfile(req, res, makeNext());
    const payload = json.mock.calls[0]![0];
    expect(payload.sessionId).toBe('sess-1');
    expect(payload.candidateProfile).toEqual(mockProfile);
    expect(payload.consentAcceptedAt).toBe('2026-04-20T10:15:00.000Z');
  });

  it('404s when session missing', async () => {
    sessionFindUnique.mockResolvedValue(null);
    const req = makeReq({ params: { sessionId: 'sess-missing' } });
    const next = makeNext();
    await getAdminSessionProfile(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(404);
  });

  it('403s when session belongs to a different org', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      orgId: 'org-OTHER',
      candidateProfile: null,
      consentAcceptedAt: null,
    });
    const req = makeReq({ params: { sessionId: 'sess-1' } });
    const next = makeNext();
    await getAdminSessionProfile(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(403);
  });
});

// ────────────────────────── endpoint 5: exam instances ──────────────────────────

describe('GET /admin/exam-instances', () => {
  it('maps rows with derived suiteId + titleZh', async () => {
    examInstanceFindMany.mockResolvedValue([
      {
        id: 'exam-1',
        techStack: 'react+node',
        domain: 'saas',
        challengePattern: 'crud',
        archStyle: null,
        level: 'mid',
        orgId: 'org-1',
        usedCount: 5,
        avgCompositeScore: 72.5,
        discriminationScore: 0.4,
        lastUsedAt: new Date(1_700_000_000_000),
        businessScenario: { systemName: '订单管理系统' },
        modules: [
          { moduleType: 'P0' },
          { moduleType: 'MA' },
          { moduleType: 'MB' },
          { moduleType: 'SE' },
          { moduleType: 'MC' },
        ],
      },
    ]);

    const req = makeReq();
    const { res, json } = makeRes();
    await listAdminExamInstances(req, res, makeNext());
    const payload = json.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0].suiteId).toBe('full_stack');
    expect(payload[0].titleZh).toBe('订单管理系统');
    expect(payload[0].usedCount).toBe(5);
    expect(payload[0].avgCompositeScore).toBe(72.5);
  });
});

// ────────────────────────── endpoint 6: suites ──────────────────────────

describe('GET /admin/suites', () => {
  it('returns all 5 suite definitions', () => {
    const req = makeReq();
    const { res, json } = makeRes();
    listAdminSuites(req, res);
    const payload = json.mock.calls[0][0];
    expect(payload).toHaveLength(5);
    expect(payload.map((s: { id: string }) => s.id).sort()).toEqual(
      ['ai_engineer', 'architect', 'deep_dive', 'full_stack', 'quick_screen'],
    );
  });
});

// ────────────────────────── endpoint 7: stats overview ──────────────────────────

describe('GET /admin/stats/overview', () => {
  it('aggregates totals + distributions orgId-scoped', async () => {
    sessionFindMany.mockResolvedValue([
      { status: 'COMPLETED', metadata: { suiteId: 'full_stack' }, scoringResult: { grade: 'A', composite: 80 } },
      { status: 'COMPLETED', metadata: { suiteId: 'architect' }, scoringResult: { grade: 'S', composite: 90 } },
      { status: 'IN_PROGRESS', metadata: { suiteId: 'full_stack' }, scoringResult: null },
    ]);
    const req = makeReq();
    const { res, json } = makeRes();
    await getAdminStatsOverview(req, res, makeNext());
    const payload = json.mock.calls[0][0];
    expect(payload.totalSessions).toBe(3);
    expect(payload.completedSessions).toBe(2);
    expect(payload.completionRate).toBeCloseTo(2 / 3);
    expect(payload.averageComposite).toBe(85);
    expect(payload.gradeDistribution.A).toBe(1);
    expect(payload.gradeDistribution.S).toBe(1);
    expect(payload.suiteDistribution.full_stack).toBe(2);
    expect(payload.suiteDistribution.architect).toBe(1);
    expect(sessionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-1' } }),
    );
  });

  it('returns zeros on empty dataset', async () => {
    sessionFindMany.mockResolvedValue([]);
    const req = makeReq();
    const { res, json } = makeRes();
    await getAdminStatsOverview(req, res, makeNext());
    const payload = json.mock.calls[0][0];
    expect(payload.totalSessions).toBe(0);
    expect(payload.completionRate).toBe(0);
    expect(payload.averageComposite).toBe(0);
  });
});
