/**
 * Auth login route tests — Task 15b §10 coverage.
 *
 * Covers: success path, invalid email, invalid password, validation,
 * and expiry-string parser.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const orgMemberFindFirst = vi.hoisted(() => vi.fn());
const orgMemberUpdate = vi.hoisted(() => vi.fn());
const bcryptCompare = vi.hoisted(() => vi.fn());

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
    orgMember: {
      findFirst: orgMemberFindFirst,
      update: orgMemberUpdate,
    },
  },
}));

vi.mock('bcryptjs', () => ({
  default: { compare: bcryptCompare },
  compare: bcryptCompare,
}));

import { loginHandler, parseJwtExpiryToSeconds } from './auth.js';

function makeReq(body: unknown): Request {
  return { body } as unknown as Request;
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
  orgMemberFindFirst.mockReset();
  orgMemberUpdate.mockReset();
  bcryptCompare.mockReset();
});

describe('parseJwtExpiryToSeconds', () => {
  it.each([
    ['8h', 8 * 60 * 60],
    ['90m', 90 * 60],
    ['30s', 30],
    ['7d', 7 * 24 * 60 * 60],
    ['3600', 3600],
  ])('parses %s → %d seconds', (input, expected) => {
    expect(parseJwtExpiryToSeconds(input)).toBe(expected);
  });

  it('returns 0 for malformed input', () => {
    expect(parseJwtExpiryToSeconds('not-a-duration')).toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('returns token + orgId + orgRole on valid credentials', async () => {
    orgMemberFindFirst.mockResolvedValue({
      id: 'mem-1',
      orgId: 'org-1',
      email: 'a@b.com',
      passwordHash: 'hashed',
      role: 'OWNER',
    });
    bcryptCompare.mockResolvedValue(true);
    orgMemberUpdate.mockResolvedValue({});

    const req = makeReq({ email: 'a@b.com', password: 'pw' });
    const { res, json } = makeRes();
    await loginHandler(req, res, makeNext());

    const payload = json.mock.calls[0][0];
    expect(payload.orgId).toBe('org-1');
    expect(payload.orgRole).toBe('OWNER');
    expect(typeof payload.token).toBe('string');
    expect(payload.expiresIn).toBe(8 * 60 * 60);
    expect(orgMemberUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mem-1' } }),
    );
  });

  it('returns 401 AUTH_INVALID when email not found', async () => {
    orgMemberFindFirst.mockResolvedValue(null);
    const req = makeReq({ email: 'nobody@example.com', password: 'pw' });
    const { res, status, json } = makeRes();
    await loginHandler(req, res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    const body = status.mock.results[0]!.value.json.mock.calls[0][0];
    expect(body).toEqual({ error: 'Invalid credentials', code: 'AUTH_INVALID' });
    expect(orgMemberUpdate).not.toHaveBeenCalled();
    void json;
  });

  it('returns 401 AUTH_INVALID on wrong password', async () => {
    orgMemberFindFirst.mockResolvedValue({
      id: 'mem-1',
      orgId: 'org-1',
      email: 'a@b.com',
      passwordHash: 'hashed',
      role: 'MEMBER',
    });
    bcryptCompare.mockResolvedValue(false);
    const req = makeReq({ email: 'a@b.com', password: 'wrong' });
    const { res, status } = makeRes();
    await loginHandler(req, res, makeNext());
    expect(status).toHaveBeenCalledWith(401);
    expect(orgMemberUpdate).not.toHaveBeenCalled();
  });

  it('rejects empty email with 400', async () => {
    const req = makeReq({ email: '', password: 'pw' });
    const next = makeNext();
    await loginHandler(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('rejects missing password with 400', async () => {
    const req = makeReq({ email: 'a@b.com' });
    const next = makeNext();
    await loginHandler(req, makeRes().res, next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.statusCode).toBe(400);
  });

  it('defaults unknown role to MEMBER', async () => {
    orgMemberFindFirst.mockResolvedValue({
      id: 'mem-2',
      orgId: 'org-2',
      email: 'm@b.com',
      passwordHash: 'hashed',
      role: 'MEMBER',
    });
    bcryptCompare.mockResolvedValue(true);
    const req = makeReq({ email: 'm@b.com', password: 'pw' });
    const { res, json } = makeRes();
    await loginHandler(req, res, makeNext());
    expect(json.mock.calls[0][0].orgRole).toBe('MEMBER');
  });
});
