/**
 * Voice routes — Brief #2 v3 A2 test coverage.
 *
 * Strategy: mock `config/env.js` + `config/db.js` + `voice-chat.service.js`
 * + `rtc-token.service.js`, invoke each named handler directly with a
 * mocked Request/Response/NextFunction triple. Mirrors the canonical
 * pattern (see admin.test.ts · candidate-self-view.test.ts) and keeps
 * the suite DB-free.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const sessionFindUnique = vi.hoisted(() => vi.fn());
const isAvailable = vi.hoisted(() => vi.fn());
const generateRtcToken = vi.hoisted(() => vi.fn());

vi.mock('../config/env.js', () => ({
  env: {
    VOLC_RTC_APP_ID: 'test-app-id',
    VOLC_RTC_APP_KEY: 'test-app-key',
    VOLC_AK: 'test-ak',
    VOLC_SK: 'test-sk',
    CP4_LLM_MODE: 'ark',
    CUSTOM_LLM_URL: undefined,
  },
}));

vi.mock('../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: sessionFindUnique,
      update: vi.fn(),
    },
  },
}));

vi.mock('../services/voice-chat.service.js', () => ({
  voiceChatService: {
    isAvailable,
    delayedStartVoiceChat: vi.fn(),
    stopVoiceChat: vi.fn(),
  },
}));

vi.mock('../services/rtc-token.service.js', () => ({
  generateRtcToken,
}));

const { tokenHandler, statusHandler, stopHandler } = await import('./voice.js');

const fakeReq = (body: Record<string, unknown> = {}): Request =>
  ({ body }) as unknown as Request;

function fakeRes(): Response & { _json: unknown } {
  const res = { _json: undefined } as Response & { _json: unknown };
  res.json = vi.fn((payload: unknown) => ((res._json = payload), res)) as unknown as Response['json'];
  return res;
}

function fakeNext(): NextFunction & { calls: unknown[] } {
  const calls: unknown[] = [];
  const next = ((err: unknown) => void calls.push(err)) as NextFunction & { calls: unknown[] };
  next.calls = calls;
  return next;
}

describe('voice.ts handlers · DB-free direct-invoke', () => {
  beforeEach(() => {
    sessionFindUnique.mockReset();
    isAvailable.mockReset();
    generateRtcToken.mockReset();
  });

  it('tokenHandler · happy path · returns token shape with appId', async () => {
    isAvailable.mockReturnValue(true);
    sessionFindUnique.mockResolvedValue({
      id: 's-1',
      candidateId: 'c-1',
      candidate: { name: 'Alice' },
    });
    generateRtcToken.mockReturnValue('rtc-token-xyz');

    const req = fakeReq({ sessionId: 's-1' });
    const res = fakeRes();
    const next = fakeNext();

    await tokenHandler(req, res, next);

    expect(next.calls).toHaveLength(0);
    expect(res._json).toEqual({
      token: 'rtc-token-xyz',
      roomId: 'interview_s-1',
      userId: 'candidate_c-1',
      appId: 'test-app-id',
    });
  });

  it('tokenHandler · 503 guard · voice service unavailable', async () => {
    isAvailable.mockReturnValue(false);

    const req = fakeReq({ sessionId: 's-1' });
    const res = fakeRes();
    const next = fakeNext();

    await tokenHandler(req, res, next);

    expect(next.calls).toHaveLength(1);
    const err = next.calls[0] as { statusCode: number; code: string };
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('VOICE_UNAVAILABLE');
  });

  it('statusHandler · probe reports available state + mode', () => {
    isAvailable.mockReturnValue(true);
    const res = fakeRes();
    statusHandler(fakeReq(), res);
    expect(res._json).toEqual({ available: true, mode: 'ark' });

    isAvailable.mockReturnValue(false);
    const res2 = fakeRes();
    statusHandler(fakeReq(), res2);
    expect(res2._json).toEqual({ available: false, mode: 'ark' });
  });

  it('stopHandler · no-op when session has no voice metadata', async () => {
    sessionFindUnique.mockResolvedValue({ id: 's-1', metadata: {} });

    const req = fakeReq({ sessionId: 's-1' });
    const res = fakeRes();
    const next = fakeNext();

    await stopHandler(req, res, next);

    expect(next.calls).toHaveLength(0);
    expect(res._json).toEqual({ stopped: true });
  });
});
