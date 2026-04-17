import { beforeEach, describe, expect, it } from 'vitest';
import { useVoiceStore } from './voice.store.js';

describe('useVoiceStore', () => {
  beforeEach(() => {
    useVoiceStore.getState().reset();
  });

  it('starts idle with empty subtitles and no room info', () => {
    const s = useVoiceStore.getState();
    expect(s.state).toBe('idle');
    expect(s.mode).toBeNull();
    expect(s.micGranted).toBe(false);
    expect(s.roomId).toBeNull();
    expect(s.taskId).toBeNull();
    expect(s.subtitles).toEqual([]);
    expect(s.errorMessage).toBeNull();
  });

  it('setState transitions through listening / thinking / speaking', () => {
    const { setState } = useVoiceStore.getState();
    setState('listening');
    expect(useVoiceStore.getState().state).toBe('listening');
    setState('thinking');
    expect(useVoiceStore.getState().state).toBe('thinking');
    setState('speaking');
    expect(useVoiceStore.getState().state).toBe('speaking');
  });

  it('setError transitions to error state and preserves the message', () => {
    useVoiceStore.getState().setError('Mic blocked');
    const s = useVoiceStore.getState();
    expect(s.state).toBe('error');
    expect(s.errorMessage).toBe('Mic blocked');
  });

  it('setRoomInfo + setMode reflect RTC boot response', () => {
    useVoiceStore.getState().setRoomInfo('room-42', 'task-xyz');
    useVoiceStore.getState().setMode('ark');
    const s = useVoiceStore.getState();
    expect(s.roomId).toBe('room-42');
    expect(s.taskId).toBe('task-xyz');
    expect(s.mode).toBe('ark');
  });

  it('addSubtitle appends entries and caps at 51 via slice(-50)', () => {
    const { addSubtitle } = useVoiceStore.getState();
    for (let i = 0; i < 60; i++) {
      addSubtitle(i % 2 === 0 ? 'AI_1' : 'USER_1', `line ${i}`);
    }
    const subs = useVoiceStore.getState().subtitles;
    // slice(-50) on a 50-length array then push 1 = 51 entries, and each
    // further addSubtitle repeats that pattern, so the buffer tops out at 51.
    expect(subs.length).toBe(51);
    expect(subs[subs.length - 1].text).toBe('line 59');
    expect(subs[0].text).toBe('line 9');
  });

  it('reset clears all transient state back to initial', () => {
    const store = useVoiceStore.getState();
    store.setState('listening');
    store.setMicGranted(true);
    store.setRoomInfo('r', 't');
    store.setMode('custom');
    store.addSubtitle('AI_1', 'hi');
    store.reset();
    const s = useVoiceStore.getState();
    expect(s.state).toBe('idle');
    expect(s.micGranted).toBe(false);
    expect(s.roomId).toBeNull();
    expect(s.mode).toBeNull();
    expect(s.subtitles).toEqual([]);
  });
});
