/**
 * useBehaviorTracker — candidate-side behavior collection.
 *
 * Components call `track('eventType', data)` for discrete events and
 * `trackKeystroke()` for typing activity (count + duration only — never
 * per-key timestamps, for both privacy and bandwidth reasons). The buffer
 * lives in a useRef so accumulating events doesn't trigger re-renders.
 *
 * Flush boundaries are caller-controlled:
 *   - `flush(module)` — call right before a module submit
 *   - automatic on `beforeunload` and `visibilitychange→hidden`
 *
 * Each flush JSON-serializes the buffer and emits `behavior:batch` (payload
 * shape per shared ClientToServerEvents: `{ events: [...] }`) over the
 * shared socket. Payloads >50KB are split into halves recursively until each
 * chunk fits; an unsplittable >50KB singleton is dropped with a console
 * warning rather than risking server-side metadata bloat (the server also
 * enforces the 50KB cap and will drop oversized payloads regardless).
 *
 * The hook is module-scoped: pass sessionId + V5ModuleKey on creation so the
 * hook can route batches to the right session. The client still carries
 * sessionId in the envelope as a compatibility fallback; the server resolves
 * socket-bound identity first.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { V5ModuleKey } from '@codelens-v5/shared';
import { getSocket } from '../lib/socket.js';

/**
 * Cursor-mode behavior event type strings. Used as the `type` argument to
 * `track()` so call sites have autocomplete without widening the hook API.
 * These are NOT socket events — they're local string literals flushed under
 * the `behavior:batch` envelope.
 */
export const CURSOR_BEHAVIOR_EVENTS = [
  'ai_completion_shown',
  'ai_completion_accepted',
  'ai_completion_rejected',
  'ai_completion_responded',
  'chat_prompt_sent',
  'chat_response_received',
  'diff_accepted',
  'diff_rejected',
  'edit_session_completed',
  'file_opened',
  'file_switched',
  'file_closed',
  'cursor_move',
  'key_press',
  'test_run',
  'document_visibility',
  'visibility_change',
] as const;

export type CursorBehaviorEvent = (typeof CURSOR_BEHAVIOR_EVENTS)[number];

const PAYLOAD_LIMIT_BYTES = 50_000;

interface BehaviorBuffer {
  [key: string]: unknown;
}

interface KeystrokeAggregate {
  count: number;
  firstTs: number | null;
  lastTs: number | null;
}

export interface UseBehaviorTrackerReturn {
  /** Append a discrete event to the buffer (with auto-stamped timestamp). */
  track: (eventType: string, data?: Record<string, unknown>) => void;
  /** Cheap keypress counter — flush() folds aggregate count+duration into the buffer. */
  trackKeystroke: () => void;
  /** Record a paste event with content length only (privacy: never the text). */
  trackPaste: (length: number) => void;
  /**
   * Drain the buffer and emit `behavior:batch`. Safe to call when empty (no-op).
   *
   * Overload semantics:
   *   flush()                       — just drain
   *   flush(N: number, payload)     — store payload as data.round{N} = {...} then drain (snapshot)
   *   flush(key: string, payload)   — store payload as data[key] = {...} then drain (snapshot)
   *   flush(undefined, payload)     — shallow-merge payload into the buffer top-level then drain
   */
  flush: (eventType?: string | number, data?: Record<string, unknown>) => void;
}

/**
 * Flatten a BehaviorBuffer into the `{ type, timestamp, payload }[]` shape
 * expected by shared ws.ts ClientToServerEvents['behavior:batch']. Array-valued
 * keys become one event per array element; scalar/object values become a
 * single event carrying the value under `payload.value`.
 */
function flattenBuffer(module: V5ModuleKey, chunk: BehaviorBuffer): Array<{
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}> {
  const out: Array<{ type: string; timestamp: string; payload: Record<string, unknown> }> = [];
  for (const [type, val] of Object.entries(chunk)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const rec = (item && typeof item === 'object' ? item : { value: item }) as Record<string, unknown>;
        const ts = typeof rec.timestamp === 'number' ? new Date(rec.timestamp).toISOString() : new Date().toISOString();
        const rest = { ...rec };
        delete rest.timestamp;
        out.push({ type, timestamp: ts, payload: { module, ...rest } });
      }
    } else {
      const rec = (val && typeof val === 'object' ? val : { value: val }) as Record<string, unknown>;
      out.push({ type, timestamp: new Date().toISOString(), payload: { module, ...rec } });
    }
  }
  return out;
}

/**
 * Recursively split-and-emit a buffer chunk so each socket frame stays
 * under PAYLOAD_LIMIT_BYTES. Returns nothing — emits inline.
 */
function emitChunk(
  socket: ReturnType<typeof getSocket>,
  sessionId: string,
  module: V5ModuleKey,
  chunk: BehaviorBuffer,
): void {
  const sz = JSON.stringify(chunk).length;
  if (sz <= PAYLOAD_LIMIT_BYTES) {
    socket.emit('behavior:batch', { sessionId, events: flattenBuffer(module, chunk) });
    return;
  }
  const keys = Object.keys(chunk);
  if (keys.length === 1) {
    const key = keys[0];
    const val = chunk[key];
    if (Array.isArray(val) && val.length > 1) {
      const mid = Math.floor(val.length / 2);
      emitChunk(socket, sessionId, module, { [key]: val.slice(0, mid) });
      emitChunk(socket, sessionId, module, { [key]: val.slice(mid) });
    } else {
      // Singleton scalar/object that can't be split — drop and warn.
      // eslint-disable-next-line no-console
      console.warn(
        '[useBehaviorTracker] dropping unsplittable >50KB behavior payload',
        { module, key, sizeBytes: sz },
      );
    }
    return;
  }
  const mid = Math.floor(keys.length / 2);
  const a: BehaviorBuffer = {};
  const b: BehaviorBuffer = {};
  keys.slice(0, mid).forEach((k) => {
    a[k] = chunk[k];
  });
  keys.slice(mid).forEach((k) => {
    b[k] = chunk[k];
  });
  emitChunk(socket, sessionId, module, a);
  emitChunk(socket, sessionId, module, b);
}

export function useBehaviorTracker(sessionId: string, module: V5ModuleKey): UseBehaviorTrackerReturn {
  // useRef so accumulating events never causes re-renders. Buffers are
  // recreated on each flush so we never carry stale state between modules.
  const bufferRef = useRef<BehaviorBuffer>({});
  const keystrokeRef = useRef<KeystrokeAggregate>({ count: 0, firstTs: null, lastTs: null });

  const track = useCallback((eventType: string, data?: Record<string, unknown>) => {
    const buf = bufferRef.current;
    if (!buf[eventType]) buf[eventType] = [];
    const arr = buf[eventType];
    if (Array.isArray(arr)) {
      arr.push({ ...(data ?? {}), timestamp: Date.now() });
    }
  }, []);

  const trackKeystroke = useCallback(() => {
    const k = keystrokeRef.current;
    const now = Date.now();
    if (k.firstTs === null) k.firstTs = now;
    k.lastTs = now;
    k.count += 1;
  }, []);

  const trackPaste = useCallback((length: number) => {
    const buf = bufferRef.current;
    if (!buf.paste) buf.paste = [];
    const arr = buf.paste;
    if (Array.isArray(arr)) {
      arr.push({ length, timestamp: Date.now() });
    }
  }, []);

  const flush = useCallback(
    (eventType?: string | number, data?: Record<string, unknown>) => {
      // Fold pending keystroke aggregate in before draining the buffer.
      const k = keystrokeRef.current;
      if (k.count > 0) {
        const duration = k.firstTs !== null && k.lastTs !== null ? k.lastTs - k.firstTs : 0;
        const buf = bufferRef.current;
        const existing = (buf.keystrokes as { count: number; durationMs: number } | undefined) ?? {
          count: 0,
          durationMs: 0,
        };
        buf.keystrokes = {
          count: existing.count + k.count,
          durationMs: existing.durationMs + duration,
        };
        keystrokeRef.current = { count: 0, firstTs: null, lastTs: null };
      }

      // Snapshot/merge incoming payload before drain.
      if (data) {
        if (eventType === undefined || eventType === null) {
          Object.assign(bufferRef.current, data);
        } else {
          const key = typeof eventType === 'number' ? `round${eventType}` : eventType;
          bufferRef.current[key] = data;
        }
      }

      if (Object.keys(bufferRef.current).length === 0) return;
      const drained = bufferRef.current;
      bufferRef.current = {};
      emitChunk(getSocket(), sessionId, module, drained);
    },
    [sessionId, module],
  );

  useEffect(() => {
    // Page-hide / unload safety net — drain whatever's still buffered.
    const onPageHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', onPageHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flush]);

  return { track, trackKeystroke, trackPaste, flush };
}
