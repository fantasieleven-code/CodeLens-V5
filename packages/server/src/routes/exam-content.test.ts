/** Brief #15 · GET /api/v5/exam/:examInstanceId/module/:moduleType · 4 route cases. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const getMBDataCandidateSafe = vi.hoisted(() => vi.fn());

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

vi.mock('../services/exam-data.service.js', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../services/exam-data.service.js')
  >();
  return {
    ...actual,
    examDataService: { getMBDataCandidateSafe },
  };
});

import { getExamModuleContent } from './exam-content.js';

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

const FAKE_CANDIDATE_VIEW = {
  featureRequirement: { description: 'd', acceptanceCriteria: ['a1', 'a2'] },
  scaffold: {
    files: [{ path: 'src/x.ts', content: 'export {};', language: 'typescript' }],
    dependencyOrder: ['src/x.ts'],
  },
  violationExamples: [{ exampleIndex: 0, code: 'redis.decr()' }],
};

beforeEach(() => {
  getMBDataCandidateSafe.mockReset();
});

describe('GET /api/v5/exam/:examInstanceId/module/:moduleType', () => {
  it('returns 200 + candidate-safe shape on happy mb', async () => {
    getMBDataCandidateSafe.mockResolvedValue(FAKE_CANDIDATE_VIEW);
    const req = makeReq({ examInstanceId: 'e-1', moduleType: 'mb' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await getExamModuleContent(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual(FAKE_CANDIDATE_VIEW);
  });

  it('returns 404 NOT_FOUND when service returns null for mb', async () => {
    getMBDataCandidateSafe.mockResolvedValue(null);
    const req = makeReq({ examInstanceId: 'missing', moduleType: 'mb' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getExamModuleContent(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('returns 400 VALIDATION_ERROR for unknown moduleType', async () => {
    const req = makeReq({ examInstanceId: 'e-1', moduleType: 'xyz' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await getExamModuleContent(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(getMBDataCandidateSafe).not.toHaveBeenCalled();
  });

  it('returns 501 NOT_IMPLEMENTED for valid-but-unimplemented moduleType', async () => {
    const req = makeReq({ examInstanceId: 'e-1', moduleType: 'p0' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await getExamModuleContent(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(status).toHaveBeenCalledWith(501);
    expect(json.mock.calls[0][0]).toMatchObject({ code: 'NOT_IMPLEMENTED' });
    expect(getMBDataCandidateSafe).not.toHaveBeenCalled();
  });
});

