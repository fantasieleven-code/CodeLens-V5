import { beforeEach, describe, expect, it, vi } from 'vitest';

import { persistCandidateSubmission } from './persistCandidateSubmission.js';

const emit = vi.fn();

vi.mock('./socket.js', () => ({
  getSocket: () => ({ emit }),
}));

const payload = {
  sessionId: 'sess-1',
  submission: {
    audit: { violations: [] },
    finalFiles: [],
    finalTestPassRate: 0,
    editorBehavior: {
      aiCompletionEvents: [],
      chatEvents: [],
      diffEvents: [],
      fileNavigationHistory: [],
      editSessions: [],
      testRuns: [],
    },
  },
} as const;

describe('persistCandidateSubmission', () => {
  beforeEach(() => {
    emit.mockReset();
    vi.unstubAllGlobals();
  });

  it('uses the socket ack as the primary persistence path', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    emit.mockImplementation((_event, _payload, ack: (ok: boolean) => void) => ack(true));

    const ok = await persistCandidateSubmission({
      event: 'v5:mb:submit',
      payload,
      http: { url: '/api/v5/exam/sess-1/mb/submit', body: { submission: payload.submission } },
    });

    expect(ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('falls back to HTTP only after socket ack failure', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    emit.mockImplementation((_event, _payload, ack: (ok: boolean) => void) => ack(false));

    const ok = await persistCandidateSubmission({
      event: 'v5:mb:submit',
      payload,
      http: { url: '/api/v5/exam/sess-1/mb/submit', body: { submission: payload.submission } },
    });

    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/v5/exam/sess-1/mb/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submission: payload.submission }),
    });
  });

  it('returns false when both socket and HTTP persistence fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    emit.mockImplementation((_event, _payload, ack: (ok: boolean) => void) => ack(false));

    await expect(
      persistCandidateSubmission({
        event: 'v5:mb:submit',
        payload,
        http: { url: '/api/v5/exam/sess-1/mb/submit', body: { submission: payload.submission } },
      }),
    ).resolves.toBe(false);
  });
});
