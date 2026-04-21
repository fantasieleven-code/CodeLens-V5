/**
 * Task B-A10-lite C3 — GET /api/candidate/self-view/:sessionId/:privateToken tests.
 *
 * Pattern mirrors candidate.test.ts: mock `config/db.js`, invoke the handler
 * directly with fake Request/Response. DB-free.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const sessionFindUnique = vi.hoisted(() => vi.fn());

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
    },
  },
}));

import { getCandidateSelfView } from './candidate-self-view.js';

const scoringResultFixture = {
  grade: 'A',
  composite: 85,
  dimensions: {
    technicalJudgment: 90,
    aiEngineering: 80,
    systemDesign: 75,
    codeQuality: 70,
    communication: 65,
    metacognition: 60,
  },
  confidence: 'high',
  boundaryAnalysis: {},
  reasoning: 'admin-only',
  signals: {},
  capabilityProfiles: [
    {
      id: 'independent_delivery',
      nameZh: '独立交付能力',
      nameEn: 'Independent Delivery',
      score: 88,
      label: '自主',
      dimensionBreakdown: { technicalJudgment: 36 },
      evidenceSignals: ['sSchemeJudgment'],
      description: '候选人能独立拿到需求',
    },
  ],
};

function makeReq(params: Record<string, string>): Request {
  return {
    params,
    query: {},
    body: {},
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status, json } as unknown as Response, status, json };
}

function makeNext(): { fn: NextFunction; calls: unknown[] } {
  const calls: unknown[] = [];
  const fn = ((err: unknown) => {
    if (err !== undefined) calls.push(err);
  }) as unknown as NextFunction;
  return { fn, calls };
}

beforeEach(() => {
  sessionFindUnique.mockReset();
});

describe('GET /api/candidate/self-view/:sessionId/:privateToken', () => {
  it('returns V5CandidateSelfView on valid session + matching token', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      candidateSelfViewToken: 'selfview-token-xyz',
      completedAt: new Date('2026-04-21T10:00:00.000Z'),
      status: 'COMPLETED',
      scoringResult: scoringResultFixture,
    });

    const req = makeReq({ sessionId: 'sess-1', privateToken: 'selfview-token-xyz' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await getCandidateSelfView(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.sessionId).toBe('sess-1');
    expect(body.capabilityProfiles[0].id).toBe('independent_delivery');
    expect(body.dimensionRadar).toHaveLength(6);
    expect(Object.keys(body).sort()).toEqual(
      ['capabilityProfiles', 'completedAt', 'dimensionRadar', 'sessionId'].sort(),
    );
  });

  it('returns 404 NOT_FOUND when session is missing', async () => {
    sessionFindUnique.mockResolvedValue(null);

    const req = makeReq({ sessionId: 'missing', privateToken: 'anything' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getCandidateSelfView(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 404 (uniform) on token mismatch — 防 enumeration', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      candidateSelfViewToken: 'correct-token',
      completedAt: new Date(),
      status: 'COMPLETED',
      scoringResult: scoringResultFixture,
    });

    const req = makeReq({ sessionId: 'sess-1', privateToken: 'wrong-token' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getCandidateSelfView(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 400 SESSION_INCOMPLETE when session not yet COMPLETED', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      candidateSelfViewToken: 'selfview-token-xyz',
      completedAt: null,
      status: 'IN_PROGRESS',
      scoringResult: null,
    });

    const req = makeReq({ sessionId: 'sess-1', privateToken: 'selfview-token-xyz' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getCandidateSelfView(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('SESSION_INCOMPLETE');
  });

  it('does NOT accept admin candidateToken as privateToken (two-token separation)', async () => {
    // Session has BOTH tokens minted — attacker passes candidateToken in URL.
    sessionFindUnique.mockResolvedValue({
      id: 'sess-1',
      candidateSelfViewToken: 'selfview-token-xyz',
      completedAt: new Date(),
      status: 'COMPLETED',
      scoringResult: scoringResultFixture,
    });

    const req = makeReq({
      sessionId: 'sess-1',
      privateToken: 'candidate-exam-token-abc', // admin-visible, not self-view
    });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getCandidateSelfView(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });
});
