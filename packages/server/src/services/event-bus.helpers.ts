/**
 * Pure helpers for the event bus. Split out from `event-bus.service.ts` so unit tests
 * can import `buildBufferedEvent` without pulling in redis / prisma / env dependencies.
 */
import { deriveV5EventCategory, isV5Event } from '@codelens-v5/shared';
import type { EventCategory, V5Event, V5EventPayload } from '@codelens-v5/shared';

export interface BufferedEvent {
  sessionId: string;
  category: EventCategory;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/**
 * Translate emit() args to a BufferedEvent.
 *
 * V5 form: `buildBufferedEvent(V5Event.X, { sessionId, ... })`
 * V4 form: `buildBufferedEvent(sessionId, category, type, payload?)`
 */
export function buildBufferedEvent(
  arg0: V5Event | string,
  arg1: V5EventPayload | EventCategory,
  arg2?: string,
  arg3?: Record<string, unknown>,
  now: () => Date = () => new Date(),
): BufferedEvent {
  if (isV5Event(arg0)) {
    const payload = arg1 as V5EventPayload;
    if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) {
      throw new Error(`[event-bus] V5 event ${arg0} requires payload.sessionId`);
    }
    return {
      sessionId: payload.sessionId,
      category: deriveV5EventCategory(arg0),
      type: arg0,
      payload: payload as Record<string, unknown>,
      timestamp: now().toISOString(),
    };
  }

  // V4 form
  if (typeof arg2 !== 'string') {
    throw new Error('[event-bus] V4 emit requires (sessionId, category, type, payload?)');
  }
  return {
    sessionId: arg0,
    category: arg1 as EventCategory,
    type: arg2,
    payload: arg3 ?? {},
    timestamp: now().toISOString(),
  };
}
