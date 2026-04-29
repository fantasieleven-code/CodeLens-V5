import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useVoiceStore } from '../stores/voice.store.js';
import { useSessionStore } from '../stores/session.store.js';
import VERTC from '@volcengine/rtc';

vi.mock('@volcengine/rtc', () => ({
  default: {
    createEngine: vi.fn(),
    events: {
      onUserJoined: 'onUserJoined',
      onUserLeave: 'onUserLeave',
      onAutoplayFailed: 'onAutoplayFailed',
      onUserPublishStream: 'onUserPublishStream',
    },
  },
  MediaType: { AUDIO: 'audio' },
  StreamIndex: { STREAM_INDEX_MAIN: 'main' },
}));

import { useVoiceRTC } from './useVoiceRTC.js';

describe('useVoiceRTC', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useVoiceStore.getState().reset();
    useSessionStore.getState().reset();
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    // jsdom has no mediaDevices — stub it so early-return paths don't NPE
    // if they ever reach the getUserMedia call.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enabled=false does not call fetch or touch voice.state', () => {
    renderHook(() => useVoiceRTC({ enabled: false }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useVoiceStore.getState().state).toBe('idle');
  });

  it('enabled=true without a session token short-circuits before any fetch', async () => {
    // session.sessionId = null AND session.token = null → hook's early
    // guard returns before setState/fetch/getUserMedia run.
    renderHook(() => useVoiceRTC({ enabled: true }));
    await waitFor(() => {
      // Give the useEffect a tick to fire; state should still be idle.
      expect(useVoiceStore.getState().state).toBe('idle');
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('defaults to the schema-gated V5 start endpoint before requesting the RTC token', async () => {
    const engine = {
      on: vi.fn(),
      joinRoom: vi.fn().mockResolvedValue(undefined),
      startAudioCapture: vi.fn().mockResolvedValue(undefined),
      publishStream: vi.fn().mockResolvedValue(undefined),
      stopAudioCapture: vi.fn().mockResolvedValue(undefined),
      leaveRoom: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn(),
    };
    vi.mocked(VERTC.createEngine).mockReturnValue(engine as never);
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as never);
    useSessionStore.setState({ sessionId: 'sess-voice', token: 'candidate-token' });
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ roomId: 'room-1', taskId: 'task-1', mode: 'custom' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'rtc-token', appId: 'rtc-app', userId: 'candidate-1' }),
      });

    renderHook(() => useVoiceRTC({ enabled: true }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenNthCalledWith(
        1,
        '/api/voice/v5/start',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer candidate-token',
          },
          body: JSON.stringify({ sessionId: 'sess-voice' }),
        }),
      );
    });
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      '/api/voice/token',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
