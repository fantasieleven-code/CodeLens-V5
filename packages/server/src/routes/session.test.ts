/**
 * Brief #13 D17 — GET /api/v5/session/:sessionId tests.
 *
 * Pattern mirrors candidate-self-view.test.ts: mock `config/db.js`, invoke
 * the handler directly with fake Request/Response. DB-free.
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

import { getSessionForCandidate } from './session.js';

function makeReq(params: Record<string, string>): Request {
  return { params, query: {}, body: {} } as unknown as Request;
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

describe('GET /api/v5/session/:sessionId', () => {
  it('returns the candidate-facing session shape on a valid id', async () => {
    sessionFindUnique.mockResolvedValue({
      id: 'sess-uuid-1',
      status: 'CREATED',
      metadata: {
        suiteId: 'full_stack',
        examInstanceId: 'e0000000-0000-0000-0000-000000000001',
        moduleOrder: ['phase0', 'moduleA', 'mb', 'moduleC', 'selfAssess'],
      },
      candidate: { id: 'cand-1', name: 'Liam Zhu', email: 'liam@test.local' },
    });

    const req = makeReq({ sessionId: 'sess-uuid-1' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await getSessionForCandidate(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body).toEqual({
      id: 'sess-uuid-1',
      candidate: { id: 'cand-1', name: 'Liam Zhu', email: 'liam@test.local' },
      suiteId: 'full_stack',
      examInstanceId: 'e0000000-0000-0000-0000-000000000001',
      status: 'CREATED',
    });
  });

  it('returns 404 NOT_FOUND when the session id is unknown', async () => {
    sessionFindUnique.mockResolvedValue(null);

    const req = makeReq({ sessionId: 'missing-uuid' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getSessionForCandidate(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('falls back to empty strings when metadata is missing or malformed', async () => {
    // Older sessions written before metadata-shape contract enforcement
    // shouldn't crash the route — degrade gracefully.
    sessionFindUnique.mockResolvedValue({
      id: 'sess-legacy',
      status: 'COMPLETED',
      metadata: null,
      candidate: { id: 'cand-2', name: 'X', email: 'x@example.com' },
    });

    const req = makeReq({ sessionId: 'sess-legacy' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await getSessionForCandidate(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(status).toHaveBeenCalledWith(200);
    const body = json.mock.calls[0][0];
    expect(body.suiteId).toBe('');
    expect(body.examInstanceId).toBe('');
    expect(body.status).toBe('COMPLETED');
  });
});
