import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useEditSessionTracker } from './useEditSessionTracker.js';

function makeTracker() {
  return { track: vi.fn() };
}

describe('useEditSessionTracker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens a session on first onEdit without emitting', () => {
    const tracker = makeTracker();
    const { result } = renderHook(() => useEditSessionTracker(tracker));

    act(() => {
      result.current.onEdit('src/a.ts');
    });

    expect(tracker.track).not.toHaveBeenCalled();
  });

  it('emits edit_session_completed with closedBy="idle_timeout" after idle debounce', () => {
    vi.useFakeTimers();
    const tracker = makeTracker();
    const { result } = renderHook(() =>
      useEditSessionTracker(tracker, { idleMs: 30_000 }),
    );

    act(() => {
      result.current.onEdit('src/a.ts');
    });
    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(tracker.track).toHaveBeenCalledTimes(1);
    const [eventType, payload] = tracker.track.mock.calls[0];
    expect(eventType).toBe('edit_session_completed');
    expect(payload).toMatchObject({
      filePath: 'src/a.ts',
      keystrokeCount: 1,
      closedBy: 'idle_timeout',
    });
    expect(typeof payload.startTime).toBe('number');
    expect(typeof payload.endTime).toBe('number');
    expect(payload.durationMs).toBe(payload.endTime - payload.startTime);
  });

  it('emits closedBy="file_switch" when onEdit fires on a different filePath', () => {
    const tracker = makeTracker();
    const { result } = renderHook(() => useEditSessionTracker(tracker));

    act(() => {
      result.current.onEdit('src/a.ts');
      result.current.onEdit('src/a.ts');
      result.current.onEdit('src/b.ts');
    });

    expect(tracker.track).toHaveBeenCalledTimes(1);
    const [eventType, payload] = tracker.track.mock.calls[0];
    expect(eventType).toBe('edit_session_completed');
    expect(payload).toMatchObject({
      filePath: 'src/a.ts',
      keystrokeCount: 2,
      closedBy: 'file_switch',
    });
  });

  it('accumulates keystrokeCount on same file without emitting mid-session', () => {
    vi.useFakeTimers();
    const tracker = makeTracker();
    const { result } = renderHook(() =>
      useEditSessionTracker(tracker, { idleMs: 30_000 }),
    );

    act(() => {
      result.current.onEdit('src/a.ts');
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
      result.current.onEdit('src/a.ts');
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
      result.current.onEdit('src/a.ts');
    });

    expect(tracker.track).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(tracker.track).toHaveBeenCalledTimes(1);
    expect(tracker.track.mock.calls[0][1]).toMatchObject({
      filePath: 'src/a.ts',
      keystrokeCount: 3,
      closedBy: 'idle_timeout',
    });
  });

  it('emits previous session + opens new one when filePath changes (no file_switched event required)', () => {
    const tracker = makeTracker();
    const { result } = renderHook(() => useEditSessionTracker(tracker));

    act(() => {
      result.current.onEdit('src/a.ts');
      result.current.onEdit('src/b.ts');
      result.current.onEdit('src/b.ts');
      result.current.onEdit('src/c.ts');
    });

    expect(tracker.track).toHaveBeenCalledTimes(2);
    expect(tracker.track.mock.calls[0][1]).toMatchObject({
      filePath: 'src/a.ts',
      keystrokeCount: 1,
      closedBy: 'file_switch',
    });
    expect(tracker.track.mock.calls[1][1]).toMatchObject({
      filePath: 'src/b.ts',
      keystrokeCount: 2,
      closedBy: 'file_switch',
    });
  });

  it('flushes active session on unmount', () => {
    const tracker = makeTracker();
    const { result, unmount } = renderHook(() => useEditSessionTracker(tracker));

    act(() => {
      result.current.onEdit('src/a.ts');
      result.current.onEdit('src/a.ts');
    });

    expect(tracker.track).not.toHaveBeenCalled();

    unmount();

    expect(tracker.track).toHaveBeenCalledTimes(1);
    expect(tracker.track.mock.calls[0][1]).toMatchObject({
      filePath: 'src/a.ts',
      keystrokeCount: 2,
      closedBy: 'idle_timeout',
    });
  });
});
