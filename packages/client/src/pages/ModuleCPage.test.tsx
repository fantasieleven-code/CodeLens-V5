import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// @volcengine/rtc has a heavy runtime; mock it before ModuleCPage imports
// resolve (ModuleCPage → useVoiceRTC → @volcengine/rtc).
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

const socketEmit = vi.hoisted(() => vi.fn());
const useVoiceRTCMock = vi.hoisted(() => vi.fn());

vi.mock('../lib/socket.js', () => ({
  getSocket: () => ({ emit: socketEmit, on: vi.fn(), off: vi.fn() }),
}));

vi.mock('../hooks/useVoiceRTC.js', () => ({
  useVoiceRTC: useVoiceRTCMock,
}));

vi.mock('../hooks/useModuleContent.js', () => ({
  useModuleContent: () => ({
    status: 'loaded',
    data: {
      probeStrategies: {
        baseline: 'Baseline prompt',
        contradiction: 'Contradiction prompt',
        weakness: 'Weakness prompt',
        escalation: 'Escalation prompt',
        transfer: 'Transfer prompt',
      },
    },
  }),
}));

import { ModuleCPage } from './ModuleCPage.js';
import { useVoiceStore } from '../stores/voice.store.js';
import { useSessionStore } from '../stores/session.store.js';

describe('ModuleCPage', () => {
  beforeEach(() => {
    socketEmit.mockReset();
    useVoiceRTCMock.mockReset();
    useVoiceRTCMock.mockReturnValue({ startVoice: vi.fn(), stopVoice: vi.fn() });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }));
    useVoiceStore.getState().reset();
    useSessionStore.getState().reset();
    useSessionStore.setState({ sessionId: 'sess-mc', examInstanceId: 'exam-1' });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the mic preflight screen on first mount', () => {
    render(<ModuleCPage />);
    expect(screen.getByTestId('module-c-page')).toBeInTheDocument();
    expect(screen.getByTestId('modulec-preflight')).toBeInTheDocument();
    expect(screen.getByTestId('modulec-preflight-headphones')).toBeInTheDocument();
  });

  it('boots voice mode through the V5 schema-gated start endpoint', () => {
    render(<ModuleCPage />);

    expect(useVoiceRTCMock).toHaveBeenCalledWith({
      enabled: false,
      startEndpoint: '/api/voice/v5/start',
    });
  });

  it('submits text rounds over v5:modulec:answer with sessionId and probeStrategy', async () => {
    render(<ModuleCPage />);

    fireEvent.click(screen.getByTestId('modulec-preflight-skip'));
    fireEvent.click(screen.getByTestId('modulec-mode-text'));
    fireEvent.change(screen.getByTestId('modulec-answer-input'), {
      target: { value: 'This is a candidate text answer.' },
    });
    fireEvent.click(screen.getByTestId('modulec-submit'));

    await waitFor(() => {
      expect(socketEmit).toHaveBeenCalledWith(
        'v5:modulec:answer',
        {
          sessionId: 'sess-mc',
          round: 1,
          question: 'Baseline prompt',
          answer: 'This is a candidate text answer.',
          probeStrategy: 'baseline',
        },
        expect.any(Function),
      );
    });
    expect(fetch).toHaveBeenCalledWith('/api/v5/exam/sess-mc/modulec/round/1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: 'This is a candidate text answer.',
        question: 'Baseline prompt',
        probeStrategy: 'baseline',
      }),
    });
  });

  it('ends the session over socket and skips HTTP complete when ack succeeds', async () => {
    socketEmit.mockImplementation((event: string, _payload: unknown, ack?: (ok: boolean) => void) => {
      if (event === 'session:end') ack?.(true);
    });
    render(<ModuleCPage />);

    fireEvent.click(screen.getByTestId('modulec-preflight-skip'));
    fireEvent.click(screen.getByTestId('modulec-mode-text'));

    for (let i = 0; i < 5; i += 1) {
      fireEvent.change(screen.getByTestId('modulec-answer-input'), {
        target: { value: `This is candidate answer number ${i + 1}.` },
      });
      fireEvent.click(screen.getByTestId('modulec-submit'));
    }

    await screen.findByTestId('modulec-done');
    vi.mocked(fetch).mockClear();
    fireEvent.click(screen.getByTestId('modulec-finish'));

    expect(socketEmit).toHaveBeenCalledWith(
      'session:end',
      { sessionId: 'sess-mc' },
      expect.any(Function),
    );
    expect(fetch).not.toHaveBeenCalledWith('/api/v5/exam/sess-mc/complete', { method: 'POST' });
  });
});
