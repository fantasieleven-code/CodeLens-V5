/**
 * Task B-A12 auth-fallback Commit 1 — requireCandidate body-token fallback.
 *
 * Tests mock `config/db.js` and `jsonwebtoken`; invoke requireCandidate
 * directly with a mocked Request/Response/NextFunction triple. DB-free.
 *
 * Path A (header JWT present) — T1 regression.
 * Path B (no header · body.sessionToken fallback) — T2 happy · T3 invalid.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const sessionFindFirst = vi.hoisted(() => vi.fn());
const jwtVerify = vi.hoisted(() => vi.fn());

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
      findFirst: sessionFindFirst,
    },
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    verify: jwtVerify,
  },
}));

import { requireCandidate } from './auth.js';
import { AuthenticationError } from './errorHandler.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

beforeEach(() => {
  sessionFindFirst.mockReset();
  jwtVerify.mockReset();
});

describe('requireCandidate middleware', () => {
  it('T1 · header JWT present → passes payload through unchanged (regression)', async () => {
    jwtVerify.mockReturnValue({ sub: 'cand-1', role: 'candidate', sessionId: 'sess-1' });

    const req = makeReq({
      headers: { authorization: 'Bearer token-abc' },
    });
    const next = makeNext();
    await requireCandidate(req, makeRes(), next);

    expect(jwtVerify).toHaveBeenCalledWith('token-abc', 'test-secret-123456');
    expect(sessionFindFirst).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ sub: 'cand-1', role: 'candidate', sessionId: 'sess-1' });
  });

  it('T2 · no header · valid body.sessionToken → session resolved · req.auth set', async () => {
    sessionFindFirst.mockResolvedValue({ id: 'sess-42' });

    const req = makeReq({
      body: { sessionToken: 'opaque-token-xyz', profile: { foo: 'bar' } },
    });
    const next = makeNext();
    await requireCandidate(req, makeRes(), next);

    expect(jwtVerify).not.toHaveBeenCalled();
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: { candidateToken: 'opaque-token-xyz' },
      select: { id: true },
    });
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ sub: 'sess-42', role: 'candidate', sessionId: 'sess-42' });
  });

  it('T3 · no header · invalid body.sessionToken → next(AuthenticationError)', async () => {
    sessionFindFirst.mockResolvedValue(null);

    const req = makeReq({ body: { sessionToken: 'bogus-token' } });
    const next = vi.fn() as unknown as NextFunction;
    await requireCandidate(req, makeRes(), next);

    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_REQUIRED');
    expect(req.auth).toBeUndefined();
  });

  it('T4 · no header · no body token → next(AuthenticationError "Authentication required")', async () => {
    const req = makeReq({ body: {} });
    const next = vi.fn() as unknown as NextFunction;
    await requireCandidate(req, makeRes(), next);

    expect(sessionFindFirst).not.toHaveBeenCalled();
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.message).toMatch(/authentication required/i);
  });
});
