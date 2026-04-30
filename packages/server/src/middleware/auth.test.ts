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

import { requireAdmin, requireCandidate, requireOrg, requireOrgOwner } from './auth.js';
import { AuthenticationError, AuthorizationError } from './errorHandler.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

function firstNextArg(next: NextFunction): unknown {
  return (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
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
    // Brief #13 D15 · Path B body-token now accepts either the random
    // `candidateToken` field OR the `sessionId` (Hotfix #12 Path A URL
    // contract). Test exercises the OR clause; T2b covers the sessionId
    // branch explicitly.
    sessionFindFirst.mockResolvedValue({ id: 'sess-42' });

    const req = makeReq({
      body: { sessionToken: 'opaque-token-xyz', profile: { foo: 'bar' } },
    });
    const next = makeNext();
    await requireCandidate(req, makeRes(), next);

    expect(jwtVerify).not.toHaveBeenCalled();
    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { candidateToken: 'opaque-token-xyz' },
          { id: 'opaque-token-xyz' },
        ],
      },
      select: { id: true },
    });
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ sub: 'sess-42', role: 'candidate', sessionId: 'sess-42' });
  });

  it('T2b · no header · body.sessionToken === sessionId → resolved via id branch (Hotfix #12 Path A contract)', async () => {
    // The frontend's candidate URL is /candidate/${sessionId}/consent · the
    // consent page passes that param verbatim into the request body, so
    // body-token equals the sessionId, NOT the random candidateToken field.
    // Backend Path B's OR clause makes this lookup succeed.
    sessionFindFirst.mockResolvedValue({ id: 'sess-abc' });

    const req = makeReq({
      body: { sessionToken: 'sess-abc', consentAccepted: true },
    });
    const next = makeNext();
    await requireCandidate(req, makeRes(), next);

    expect(sessionFindFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ candidateToken: 'sess-abc' }, { id: 'sess-abc' }],
      },
      select: { id: true },
    });
    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({ sub: 'sess-abc', role: 'candidate', sessionId: 'sess-abc' });
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

describe('admin/org auth middleware error envelopes', () => {
  it('requireAdmin · no token → next(AuthenticationError), no direct response write', () => {
    const res = makeRes();
    const next = makeNext();

    requireAdmin(makeReq(), res, next);

    const err = firstNextArg(next);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect((err as AuthenticationError).statusCode).toBe(401);
    expect((err as AuthenticationError).code).toBe('AUTH_REQUIRED');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('requireAdmin · non-admin token → next(AuthorizationError), no direct response write', () => {
    jwtVerify.mockReturnValue({ sub: 'cand-1', role: 'candidate' });
    const res = makeRes();
    const next = makeNext();

    requireAdmin(makeReq({ headers: { authorization: 'Bearer token-abc' } }), res, next);

    const err = firstNextArg(next);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).statusCode).toBe(403);
    expect((err as AuthorizationError).code).toBe('FORBIDDEN');
    expect((err as AuthorizationError).message).toBe('Admin access required');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('requireAdmin · valid admin token → injects auth/org and calls next()', () => {
    jwtVerify.mockReturnValue({
      sub: 'admin-1',
      role: 'admin',
      orgId: 'org-1',
      orgRole: 'OWNER',
    });
    const req = makeReq({ headers: { authorization: 'Bearer token-abc' } });
    const next = makeNext();

    requireAdmin(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.auth).toEqual({
      sub: 'admin-1',
      role: 'admin',
      orgId: 'org-1',
      orgRole: 'OWNER',
    });
    expect(req.orgId).toBe('org-1');
  });

  it('requireOrg · admin token without orgId → next(AuthorizationError)', () => {
    jwtVerify.mockReturnValue({ sub: 'admin-1', role: 'admin' });
    const next = makeNext();

    requireOrg(makeReq({ headers: { authorization: 'Bearer token-abc' } }), makeRes(), next);

    const err = firstNextArg(next);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).message).toBe('Organization membership required');
  });

  it('requireOrgOwner · MEMBER token → next(AuthorizationError)', () => {
    jwtVerify.mockReturnValue({
      sub: 'admin-1',
      role: 'admin',
      orgId: 'org-1',
      orgRole: 'MEMBER',
    });
    const next = makeNext();

    requireOrgOwner(makeReq({ headers: { authorization: 'Bearer token-abc' } }), makeRes(), next);

    const err = firstNextArg(next);
    expect(err).toBeInstanceOf(AuthorizationError);
    expect((err as AuthorizationError).message).toBe('Organization owner access required');
  });

  it('requireOrgOwner · valid OWNER token → injects org and calls next()', () => {
    jwtVerify.mockReturnValue({
      sub: 'admin-1',
      role: 'admin',
      orgId: 'org-1',
      orgRole: 'OWNER',
    });
    const req = makeReq({ headers: { authorization: 'Bearer token-abc' } });
    const next = makeNext();

    requireOrgOwner(req, makeRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.orgId).toBe('org-1');
  });
});
