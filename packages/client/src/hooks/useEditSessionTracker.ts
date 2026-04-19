/**
 * useEditSessionTracker — Task 30b · MB edit-session emitter.
 *
 * Converts per-keystroke Monaco content-change events into server-consumable
 * `edit_session_completed` events. A session is a contiguous period of editing
 * in a single file; it closes on one of two triggers (first-to-fire wins):
 *
 *   1. Idle-debounce (default 30s of no edits on the active file)
 *   2. File-switch boundary (next `onEdit` call carries a different filePath)
 *
 * On close we emit via the parent tracker's `track('edit_session_completed', payload)`,
 * piggy-backing on `useBehaviorTracker`'s existing `behavior:batch` pipeline.
 *
 * Schema matches `packages/shared/src/types/v5-submissions.ts` EditSession:
 *   { filePath, startTime, endTime, keystrokeCount, closedBy, durationMs }
 *
 * `closedBy` + `durationMs` are Task 30b-added optional fields (see shared types
 * header). Pre-Task 30b snapshots may lack them; signals currently only consume
 * filePath / startTime (sEditPatternQuality) and keystrokeCount (sModifyQuality).
 *
 * Design note — file-switch detection is inline rather than listening for a
 * `file_switched` event: that event is declared in CURSOR_BEHAVIOR_EVENTS but
 * no producer actually emits it. Comparing filePath on each `onEdit` call is
 * both simpler and doesn't depend on a cross-component emit path.
 */

import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_IDLE_MS = 30_000;

interface ActiveSession {
  filePath: string;
  startTime: number;
  keystrokeCount: number;
}

type Tracker = {
  track: (eventType: string, data?: Record<string, unknown>) => void;
};

export interface UseEditSessionTrackerOptions {
  /** Override idle-close threshold (default 30_000ms). Mostly for tests. */
  idleMs?: number;
}

export interface UseEditSessionTrackerReturn {
  /**
   * Report a content-change on a file. Opens a session if none active,
   * extends the active session if filePath matches, or closes the active
   * session with `closedBy: 'file_switch'` and opens a new one otherwise.
   */
  onEdit: (filePath: string) => void;
}

export function useEditSessionTracker(
  tracker: Tracker,
  options: UseEditSessionTrackerOptions = {},
): UseEditSessionTrackerReturn {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const sessionRef = useRef<ActiveSession | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackerRef = useRef<Tracker>(tracker);

  useEffect(() => {
    trackerRef.current = tracker;
  }, [tracker]);

  const clearIdleTimer = () => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  };

  const emitAndClose = useCallback((closedBy: 'idle_timeout' | 'file_switch') => {
    const s = sessionRef.current;
    if (!s) return;
    const endTime = Date.now();
    trackerRef.current.track('edit_session_completed', {
      filePath: s.filePath,
      startTime: s.startTime,
      endTime,
      keystrokeCount: s.keystrokeCount,
      closedBy,
      durationMs: endTime - s.startTime,
    });
    sessionRef.current = null;
    clearIdleTimer();
  }, []);

  const scheduleIdleClose = useCallback(() => {
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      emitAndClose('idle_timeout');
    }, idleMs);
  }, [idleMs, emitAndClose]);

  const onEdit = useCallback(
    (filePath: string) => {
      const s = sessionRef.current;
      if (s === null) {
        sessionRef.current = { filePath, startTime: Date.now(), keystrokeCount: 1 };
        scheduleIdleClose();
        return;
      }
      if (s.filePath !== filePath) {
        emitAndClose('file_switch');
        sessionRef.current = { filePath, startTime: Date.now(), keystrokeCount: 1 };
        scheduleIdleClose();
        return;
      }
      s.keystrokeCount += 1;
      scheduleIdleClose();
    },
    [emitAndClose, scheduleIdleClose],
  );

  // Unmount safety — flush active session. Page-unload drains also happen via
  // useBehaviorTracker's beforeunload/visibilitychange listeners, but those
  // only flush buffer; the active session must first emit into the buffer.
  useEffect(() => {
    return () => {
      if (sessionRef.current !== null) {
        emitAndClose('idle_timeout');
      }
    };
  }, [emitAndClose]);

  return { onEdit };
}
