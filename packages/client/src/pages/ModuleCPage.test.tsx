import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

// Socket is not used by the preflight screen but the module import chain
// pulls it in; returning a noop emitter keeps mount side-effect-free.
vi.mock('../lib/socket.js', () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));

import { ModuleCPage } from './ModuleCPage.js';
import { useVoiceStore } from '../stores/voice.store.js';
import { useSessionStore } from '../stores/session.store.js';

describe('ModuleCPage', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
    useSessionStore.getState().reset();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  it('renders the mic preflight screen on first mount', () => {
    render(<ModuleCPage />);
    expect(screen.getByTestId('module-c-page')).toBeInTheDocument();
    expect(screen.getByTestId('modulec-preflight')).toBeInTheDocument();
    expect(screen.getByTestId('modulec-preflight-headphones')).toBeInTheDocument();
  });
});
