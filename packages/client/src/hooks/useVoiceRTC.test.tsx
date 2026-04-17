import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useVoiceStore } from '../stores/voice.store.js';
import { useSessionStore } from '../stores/session.store.js';

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
});
