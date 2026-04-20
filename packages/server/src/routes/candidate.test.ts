/**
 * Task B-A12 Commit 4 — POST /api/candidate/profile/submit tests.
 *
 * Strategy mirrors admin.test.ts: mock `config/db.js`, invoke the handler
 * directly with a mocked Request/Response/NextFunction triple. DB-free.
 *
 * 6 tests:
 *   1. profile-only submit → 200 + candidateProfile persisted
 *   2. consent-only submit → 200 + consentAcceptedAt stamped
 *   3. both submitted together → 200 + both persisted
 *   4. empty body → 400 ValidationError
 *   5. invalid profile enum → 400 ValidationError
 *   6. Prisma P2025 (session not found) → 404 NotFoundError
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { CandidateProfile } from '@codelens-v5/shared';

const sessionUpdate = vi.hoisted(() => vi.fn());

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
      update: sessionUpdate,
    },
  },
}));

import { submitCandidateProfile } from './candidate.js';

const validProfile: CandidateProfile = {
  yearsOfExperience: 7,
  currentRole: 'fullstack',
  primaryTechStack: ['typescript', 'react', 'postgres'],
  companySize: 'large',
  aiToolYears: 2,
  primaryAiTool: 'claude_code',
  dailyAiUsageHours: '3_6',
};

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    auth: { sub: 'cand-1', role: 'candidate', sessionId: 'sess-1' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

beforeEach(() => {
  sessionUpdate.mockReset();
});

describe('POST /api/candidate/profile/submit', () => {
  it('persists profile-only submission and returns saved state', async () => {
    sessionUpdate.mockResolvedValue({
      id: 'sess-1',
      candidateProfile: validProfile,
      consentAcceptedAt: null,
    });

    const req = makeReq({ body: { profile: validProfile } });
    const { res, status, json } = makeRes();
    const next = makeNext();

    await submitCandidateProfile(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    const payload = json.mock.calls[0]![0] as {
      ok: boolean;
      sessionId: string;
      profile: CandidateProfile;
      consentAcceptedAt: string | null;
    };
    expect(payload.ok).toBe(true);
    expect(payload.sessionId).toBe('sess-1');
    expect(payload.profile).toEqual(validProfile);
    expect(payload.consentAcceptedAt).toBeNull();
    expect(sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ candidateProfile: validProfile }),
      }),
    );
    expect(
      (sessionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> }).data,
    ).not.toHaveProperty('consentAcceptedAt');
  });

  it('stamps consentAcceptedAt when consent-only body is submitted', async () => {
    sessionUpdate.mockResolvedValue({
      id: 'sess-1',
      candidateProfile: null,
      consentAcceptedAt: new Date('2026-04-20T08:00:00.000Z'),
    });

    const req = makeReq({ body: { consentAccepted: true } });
    const { res, json } = makeRes();
    await submitCandidateProfile(req, res, makeNext());

    const callArgs = sessionUpdate.mock.calls[0]![0] as {
      data: { consentAcceptedAt: Date };
    };
    expect(callArgs.data.consentAcceptedAt).toBeInstanceOf(Date);
    expect(callArgs.data).not.toHaveProperty('candidateProfile');

    const payload = json.mock.calls[0]![0] as { consentAcceptedAt: string | null };
    expect(payload.consentAcceptedAt).toBe('2026-04-20T08:00:00.000Z');
  });

  it('persists both profile and consent when submitted together', async () => {
    const acceptedAt = new Date('2026-04-20T09:30:00.000Z');
    sessionUpdate.mockResolvedValue({
      id: 'sess-1',
      candidateProfile: validProfile,
      consentAcceptedAt: acceptedAt,
    });

    const req = makeReq({
      body: { profile: validProfile, consentAccepted: true },
    });
    const { res, json } = makeRes();
    await submitCandidateProfile(req, res, makeNext());

    const payload = json.mock.calls[0]![0] as {
      profile: CandidateProfile;
      consentAcceptedAt: string | null;
    };
    expect(payload.profile).toEqual(validProfile);
    expect(payload.consentAcceptedAt).toBe('2026-04-20T09:30:00.000Z');
  });

  it('rejects empty body with a 400 ValidationError', async () => {
    const req = makeReq({ body: {} });
    const next = vi.fn() as unknown as NextFunction;
    await submitCandidateProfile(req, makeRes().res, next);

    expect(sessionUpdate).not.toHaveBeenCalled();
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(String(err.message)).toMatch(/at least one of profile or consentAccepted/i);
  });

  it('rejects invalid enum in profile with a 400 ValidationError', async () => {
    const req = makeReq({
      body: { profile: { ...validProfile, currentRole: 'designer' } },
    });
    const next = vi.fn() as unknown as NextFunction;
    await submitCandidateProfile(req, makeRes().res, next);

    expect(sessionUpdate).not.toHaveBeenCalled();
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('surfaces Prisma P2025 as a 404 NotFoundError', async () => {
    sessionUpdate.mockRejectedValue(
      Object.assign(new Error('record to update not found'), { code: 'P2025' }),
    );

    const req = makeReq({ body: { consentAccepted: true } });
    const next = vi.fn() as unknown as NextFunction;
    await submitCandidateProfile(req, makeRes().res, next);

    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('rejects a candidate token lacking a sessionId claim with 401', async () => {
    const req = makeReq({
      auth: { sub: 'cand-1', role: 'candidate' },
      body: { consentAccepted: true },
    });
    const next = vi.fn() as unknown as NextFunction;
    await submitCandidateProfile(req, makeRes().res, next);

    expect(sessionUpdate).not.toHaveBeenCalled();
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(err.statusCode).toBe(401);
  });
});
