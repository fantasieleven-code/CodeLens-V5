/**
 * Voice Store — manages CP4 voice interview state
 */

import { create } from 'zustand';

export type VoiceState = 'idle' | 'requesting_mic' | 'connecting' |
  'listening' | 'thinking' | 'speaking' | 'error' | 'degraded';

interface SubtitleLine {
  speaker: string;
  text: string;
  timestamp: number;
}

interface VoiceStore {
  state: VoiceState;
  mode: 'ark' | 'custom' | null;
  micGranted: boolean;
  roomId: string | null;
  taskId: string | null;
  subtitles: SubtitleLine[];
  errorMessage: string | null;

  setState: (state: VoiceState) => void;
  setMode: (mode: 'ark' | 'custom') => void;
  setMicGranted: (granted: boolean) => void;
  setRoomInfo: (roomId: string, taskId: string) => void;
  addSubtitle: (speaker: string, text: string) => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useVoiceStore = create<VoiceStore>((set) => ({
  state: 'idle',
  mode: null,
  micGranted: false,
  roomId: null,
  taskId: null,
  subtitles: [],
  errorMessage: null,

  setState: (state) => set({ state, errorMessage: state === 'error'
    ? undefined : null }),
  setMode: (mode) => set({ mode }),
  setMicGranted: (granted) => set({ micGranted: granted }),
  setRoomInfo: (roomId, taskId) => set({ roomId, taskId }),
  addSubtitle: (speaker, text) =>
    set((s) => ({
      subtitles: [...s.subtitles.slice(-50), { speaker, text,
        timestamp: Date.now() }],
    })),
  setError: (message) => set({ state: 'error', errorMessage: message }),
  reset: () =>
    set({
      state: 'idle',
      mode: null,
      micGranted: false,
      roomId: null,
      taskId: null,
      subtitles: [],
      errorMessage: null,
    }),
}));
