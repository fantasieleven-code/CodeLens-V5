/** Brief #15 + #18 + #19 · /api/v5/exam routes · module content + completion + submission fallbacks. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type * as ExamDataServiceModule from '../services/exam-data.service.js';
import type * as SessionServiceModule from '../services/session.service.js';

const getMBDataCandidateSafe = vi.hoisted(() => vi.fn());
const endSession = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const persistPhase0Submission = vi.hoisted(() => vi.fn());
const persistModuleASubmission = vi.hoisted(() => vi.fn());
const persistMbSubmission = vi.hoisted(() => vi.fn());
const persistModuleDSubmission = vi.hoisted(() => vi.fn());
const appendAiCompletionEvents = vi.hoisted(() => vi.fn());
const appendChatEvents = vi.hoisted(() => vi.fn());
const appendDiffEvents = vi.hoisted(() => vi.fn());
const appendFileNavigation = vi.hoisted(() => vi.fn());
const appendEditSessions = vi.hoisted(() => vi.fn());
const appendVisibilityEvent = vi.hoisted(() => vi.fn());
const appendTestRuns = vi.hoisted(() => vi.fn());
const persistFinalTestRun = vi.hoisted(() => vi.fn());
const persistSelfAssess = vi.hoisted(() => vi.fn());
const saveRoundAnswer = vi.hoisted(() => vi.fn());

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
  const actual = await importOriginal<typeof ExamDataServiceModule>();
  return {
    ...actual,
    examDataService: { getMBDataCandidateSafe },
  };
});

vi.mock('../services/session.service.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionServiceModule>();
  return {
    ...actual,
    sessionService: { endSession, getSession },
  };
});

vi.mock('../services/modules/p0.service.js', () => ({
  persistPhase0Submission,
}));

vi.mock('../services/modules/ma.service.js', () => ({
  persistModuleASubmission,
}));

vi.mock('../services/modules/mb.service.js', () => ({
  persistMbSubmission,
  appendAiCompletionEvents,
  appendChatEvents,
  appendDiffEvents,
  appendFileNavigation,
  appendEditSessions,
  appendVisibilityEvent,
  appendTestRuns,
  persistFinalTestRun,
}));

vi.mock('../services/modules/md.service.js', () => ({
  persistModuleDSubmission,
}));

vi.mock('../services/modules/se.service.js', () => ({
  persistSelfAssess,
}));

vi.mock('../services/modules/mc.service.js', () => ({
  saveRoundAnswer,
}));

import {
  completeExamSession,
  getExamModuleContent,
  submitPhase0,
  submitModuleA,
  submitMb,
  submitModuleD,
  submitSelfAssess,
  submitModuleCRound,
  submitMbEditorBehavior,
  submitMbTestResult,
} from './exam-content.js';
import { SessionNotFoundError } from '../services/session.service.js';

function makeReq(
  params: Record<string, string>,
  body: Record<string, unknown> = {},
): Request {
  return { params, query: {}, body } as unknown as Request;
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
  endSession.mockReset();
  getSession.mockReset();
  persistPhase0Submission.mockReset();
  persistModuleASubmission.mockReset();
  persistMbSubmission.mockReset();
  persistModuleDSubmission.mockReset();
  appendAiCompletionEvents.mockReset();
  appendChatEvents.mockReset();
  appendDiffEvents.mockReset();
  appendFileNavigation.mockReset();
  appendEditSessions.mockReset();
  appendVisibilityEvent.mockReset();
  appendTestRuns.mockReset();
  persistFinalTestRun.mockReset();
  persistSelfAssess.mockReset();
  saveRoundAnswer.mockReset();
});

const FAKE_SESSION = { id: 'sess-1', status: 'IN_PROGRESS' };

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

describe('POST /api/v5/exam/:sessionId/complete', () => {
  it('returns 200 { ok: true } on happy completion', async () => {
    endSession.mockResolvedValue({ id: 'sess-1', status: 'COMPLETED' });
    const req = makeReq({ sessionId: 'sess-1' });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await completeExamSession(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(endSession).toHaveBeenCalledWith('sess-1');
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 NotFoundError when sessionService throws SessionNotFoundError', async () => {
    endSession.mockRejectedValue(new SessionNotFoundError('missing-id'));
    const req = makeReq({ sessionId: 'missing-id' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await completeExamSession(req, res, fn);

    expect(calls).toHaveLength(1);
    const err = calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('forwards unexpected errors to next() unchanged (errorHandler maps to 500)', async () => {
    const boom = new Error('prisma exploded');
    endSession.mockRejectedValue(boom);
    const req = makeReq({ sessionId: 'sess-1' });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await completeExamSession(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

// ─── Brief #19 · 5 σ HTTP fallback submission endpoints ──────────────

describe('POST /api/v5/exam/:sessionId/phase0/submit', () => {
  it('returns 200 + invokes persistPhase0Submission on happy path', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistPhase0Submission.mockResolvedValue(undefined);
    const submission = { codeReading: { l1Answer: 'x', l2Answer: 'y', l3Answer: 'z', confidence: 0.5 } };
    const req = makeReq({ sessionId: 'sess-1' }, { submission });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitPhase0(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistPhase0Submission).toHaveBeenCalledWith('sess-1', submission);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitPhase0(req, res, fn);

    expect(persistPhase0Submission).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected persist errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    persistPhase0Submission.mockRejectedValue(boom);
    const req = makeReq({ sessionId: 'sess-1' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitPhase0(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

describe('POST /api/v5/exam/:sessionId/modulea/submit', () => {
  it('returns 200 + invokes persistModuleASubmission on happy path', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistModuleASubmission.mockResolvedValue(undefined);
    const submission = { round1: { schemeId: 'A' } };
    const req = makeReq({ sessionId: 'sess-1' }, { submission });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleA(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistModuleASubmission).toHaveBeenCalledWith('sess-1', submission);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleA(req, res, fn);

    expect(persistModuleASubmission).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected persist errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    persistModuleASubmission.mockRejectedValue(boom);
    const req = makeReq({ sessionId: 'sess-1' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleA(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

describe('POST /api/v5/exam/:sessionId/mb/submit', () => {
  it('returns 200 + invokes persistMbSubmission on happy path', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistMbSubmission.mockResolvedValue(undefined);
    const submission = { finalFiles: [], finalTestPassRate: 0.8 };
    const req = makeReq({ sessionId: 'sess-1' }, { submission });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitMb(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistMbSubmission).toHaveBeenCalledWith('sess-1', submission);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitMb(req, res, fn);

    expect(persistMbSubmission).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected persist errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    persistMbSubmission.mockRejectedValue(boom);
    const req = makeReq({ sessionId: 'sess-1' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitMb(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

describe('POST /api/v5/exam/:sessionId/moduled/submit', () => {
  it('returns 200 + invokes persistModuleDSubmission on happy path', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistModuleDSubmission.mockResolvedValue(undefined);
    const submission = {
      subModules: [{ name: 'InventoryService', responsibility: '扣减库存' }],
      interfaceDefinitions: ['POST /orders'],
      dataFlowDescription: 'Client -> API -> InventoryService',
      constraintsSelected: ['性能(吞吐 / 延迟)'],
      tradeoffText: '用最终一致换吞吐。',
      aiOrchestrationPrompts: ['生成库存扣减实现。'],
    };
    const req = makeReq({ sessionId: 'sess-1' }, { submission });
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleD(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistModuleDSubmission).toHaveBeenCalledWith('sess-1', submission);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleD(req, res, fn);

    expect(persistModuleDSubmission).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected persist errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    persistModuleDSubmission.mockRejectedValue(boom);
    const req = makeReq({ sessionId: 'sess-1' }, { submission: {} });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleD(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

describe('POST /api/v5/exam/:sessionId/selfassess/submit', () => {
  it('returns 200 + normalizes selfConfidence (0..100) → confidence (0..1) before persist', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistSelfAssess.mockResolvedValue(undefined);
    const req = makeReq(
      { sessionId: 'sess-1' },
      { selfConfidence: 75, selfIdentifiedRisk: '边界考虑', responseTimeMs: 1200 },
    );
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitSelfAssess(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistSelfAssess).toHaveBeenCalledWith('sess-1', {
      confidence: 0.75,
      reasoning: '边界考虑',
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq(
      { sessionId: 'missing' },
      { selfConfidence: 50, responseTimeMs: 1000 },
    );
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitSelfAssess(req, res, fn);

    expect(persistSelfAssess).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected persist errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    persistSelfAssess.mockRejectedValue(boom);
    const req = makeReq(
      { sessionId: 'sess-1' },
      { selfConfidence: 50, responseTimeMs: 1000 },
    );
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitSelfAssess(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

describe('POST /api/v5/exam/:sessionId/modulec/round/:roundIdx', () => {
  it('returns 200 + invokes saveRoundAnswer with parsed round + body fields', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    saveRoundAnswer.mockResolvedValue(undefined);
    const req = makeReq(
      { sessionId: 'sess-1', roundIdx: '2' },
      { answer: '我的回答', question: 'Emma 的问题', probeStrategy: 'contradiction' },
    );
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleCRound(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(saveRoundAnswer).toHaveBeenCalledWith(
      'sess-1',
      2,
      '我的回答',
      'Emma 的问题',
      'contradiction',
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq(
      { sessionId: 'missing', roundIdx: '0' },
      { answer: 'a', question: 'q', probeStrategy: 'baseline' },
    );
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleCRound(req, res, fn);

    expect(saveRoundAnswer).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });

  it('forwards unexpected saveRoundAnswer errors to next()', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const boom = new Error('prisma exploded');
    saveRoundAnswer.mockRejectedValue(boom);
    const req = makeReq(
      { sessionId: 'sess-1', roundIdx: '0' },
      { answer: 'a', question: 'q', probeStrategy: 'baseline' },
    );
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitModuleCRound(req, res, fn);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(boom);
  });
});

// ─── Brief #20 · MB editor-behavior + test-result + SE reviewedDecisions ──

describe('POST /api/v5/exam/:sessionId/selfassess/submit · reviewedDecisions ext', () => {
  it('forwards reviewedDecisions to persistSelfAssess when present + valid', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistSelfAssess.mockResolvedValue(undefined);
    const req = makeReq(
      { sessionId: 'sess-1' },
      {
        selfConfidence: 80,
        selfIdentifiedRisk: 'r',
        responseTimeMs: 1000,
        reviewedDecisions: ['decision A', 'decision B'],
      },
    );
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitSelfAssess(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistSelfAssess).toHaveBeenCalledWith('sess-1', {
      confidence: 0.8,
      reasoning: 'r',
      reviewedDecisions: ['decision A', 'decision B'],
    });
  });

  it('omits reviewedDecisions when not an array of strings', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistSelfAssess.mockResolvedValue(undefined);
    const req = makeReq(
      { sessionId: 'sess-1' },
      { selfConfidence: 50, responseTimeMs: 1000, reviewedDecisions: [1, 2] },
    );
    const { res } = makeRes();
    const { fn } = makeNext();

    await submitSelfAssess(req, res, fn);

    expect(persistSelfAssess).toHaveBeenCalledWith('sess-1', {
      confidence: 0.5,
      reasoning: '',
    });
  });
});

describe('POST /api/v5/exam/:sessionId/mb/editor-behavior', () => {
  it('dispatches each non-empty slice to its append* function', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const aiCompletionEvents = [{ lineNumber: 1, accepted: true, completionLength: 1, timestamp: 1 }];
    const chatEvents = [{ timestamp: 2, prompt: 'p', response: 'r' }];
    const documentVisibilityEvents = [{ timestamp: 3, hidden: true }];
    const testRuns = [{ timestamp: 4, passRate: 0.9, duration: 2_000 }];
    const req = makeReq(
      { sessionId: 'sess-1' },
      { aiCompletionEvents, chatEvents, documentVisibilityEvents, testRuns, diffEvents: [] },
    );
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbEditorBehavior(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(appendAiCompletionEvents).toHaveBeenCalledWith('sess-1', aiCompletionEvents);
    expect(appendChatEvents).toHaveBeenCalledWith('sess-1', chatEvents);
    expect(appendDiffEvents).not.toHaveBeenCalled();
    expect(appendVisibilityEvent).toHaveBeenCalledWith('sess-1', { timestamp: 3, hidden: true });
    // Brief #20 sub-cycle · testRuns dispatch regression guard
    expect(appendTestRuns).toHaveBeenCalledWith('sess-1', testRuns);
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('returns 200 + no append* calls when body has no events', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    const req = makeReq({ sessionId: 'sess-1' }, {});
    const { res, status } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbEditorBehavior(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(appendAiCompletionEvents).not.toHaveBeenCalled();
    expect(appendChatEvents).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { aiCompletionEvents: [{}] });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbEditorBehavior(req, res, fn);

    expect(appendAiCompletionEvents).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });
});

describe('POST /api/v5/exam/:sessionId/mb/test-result', () => {
  it('returns 200 + invokes persistFinalTestRun on happy path', async () => {
    getSession.mockResolvedValue(FAKE_SESSION);
    persistFinalTestRun.mockResolvedValue(undefined);
    const req = makeReq(
      { sessionId: 'sess-1' },
      { passRate: 0.9, duration: 1234, timestamp: 5678 },
    );
    const { res, status, json } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbTestResult(req, res, fn);

    expect(calls).toHaveLength(0);
    expect(persistFinalTestRun).toHaveBeenCalledWith('sess-1', {
      passRate: 0.9,
      duration: 1234,
      timestamp: 5678,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json.mock.calls[0][0]).toEqual({ ok: true });
  });

  it('returns 400 VALIDATION_ERROR when passRate or duration missing', async () => {
    const req = makeReq({ sessionId: 'sess-1' }, { passRate: 0.5 });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbTestResult(req, res, fn);

    expect(persistFinalTestRun).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(400);
  });

  it('forwards 404 when session does not exist', async () => {
    getSession.mockResolvedValue(null);
    const req = makeReq({ sessionId: 'missing' }, { passRate: 1, duration: 100 });
    const { res } = makeRes();
    const { fn, calls } = makeNext();

    await submitMbTestResult(req, res, fn);

    expect(persistFinalTestRun).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect((calls[0] as { statusCode: number }).statusCode).toBe(404);
  });
});
