/**
 * Event Bus Service — Redis-buffered event sourcing with PG batch writes.
 *
 * Collects events in a Redis list, flushes to PostgreSQL in batches
 * (every 1s or when buffer reaches 100 events, whichever comes first).
 *
 * Also handles behavior signal buffering with the same pattern.
 */

import { redis } from '../config/redis.js';
import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';
import type { EventCategory, V5Event, V5EventPayload } from '@codelens-v5/shared';
import { buildBufferedEvent, type BufferedEvent } from './event-bus.helpers.js';

export { buildBufferedEvent, type BufferedEvent };

/**
 * Signal name normalization: client sends lowercase names (useSignalCollector),
 * server services query SCREAMING_SNAKE_CASE names. Map at ingestion time.
 */
const SIGNAL_NAME_MAP: Record<string, string> = {
  paste_event: 'PASTE_FREQUENCY',
  edit_burst: 'TYPING_SPEED',
  idle: 'IDLE_DURATION',
  tab_hidden: 'TAB_SWITCH',
  tab_visible: 'TAB_SWITCH',
  file_switch: 'FILE_SWITCH',
  terminal_command: 'TERMINAL_COMMAND',
  ai_query: 'AI_QUERY',
  ai_response: 'AI_RESPONSE',
};

const EVENT_BUFFER_KEY = 'eventbus:buffer';
const SIGNAL_BUFFER_KEY = 'eventbus:signals';
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_THRESHOLD = 100;

interface BufferedSignal {
  sessionId: string;
  signalType: string;
  value: number;
  context: Record<string, unknown>;
  timestamp: string;
}

class EventBusService {
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  /** Start the periodic flush timer */
  start() {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    logger.info('[event-bus] Started (flush every 1s or 100 events)');
  }

  /** Stop flushing and drain remaining events */
  async stop() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush(); // drain remaining
    logger.info('[event-bus] Stopped');
  }

  /**
   * V5 form: emit a V5Event with a payload carrying `sessionId`.
   * Category is derived from the event via `deriveV5EventCategory`.
   */
  async emit(event: V5Event, payload: V5EventPayload): Promise<void>;
  /** V4 form: emit with explicit sessionId / category / type. */
  async emit(
    sessionId: string,
    category: EventCategory,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<void>;
  async emit(
    arg0: V5Event | string,
    arg1: V5EventPayload | EventCategory,
    arg2?: string,
    arg3?: Record<string, unknown>,
  ): Promise<void> {
    const buffered = buildBufferedEvent(arg0, arg1, arg2, arg3);
    const len = await redis.rpush(EVENT_BUFFER_KEY, JSON.stringify(buffered));

    // Flush immediately if threshold reached
    if (len >= FLUSH_THRESHOLD) {
      this.flush().catch(() => {});
    }
  }

  /**
   * Buffer behavior signals.
   * @param source — 'system' for server-generated signals (trusted for scoring),
   *                 'client' for candidate-submitted signals (lower trust, marked accordingly).
   */
  async emitSignals(
    sessionId: string,
    signals: Array<{ type: string; value: number; context?: Record<string, unknown> }>,
    source: 'system' | 'client' = 'system',
  ) {
    const pipeline = redis.pipeline();
    for (const s of signals) {
      const normalized = SIGNAL_NAME_MAP[s.type] ?? s.type;
      const buffered: BufferedSignal = {
        sessionId,
        signalType: normalized,
        value: s.value,
        context: { ...s.context, rawType: s.type, source },
        timestamp: new Date().toISOString(),
      };
      pipeline.rpush(SIGNAL_BUFFER_KEY, JSON.stringify(buffered));
    }
    await pipeline.exec();
  }

  /** Flush buffered events and signals to PostgreSQL */
  async flush() {
    if (this.flushing) return;
    this.flushing = true;

    try {
      await Promise.all([this.flushEvents(), this.flushSignals()]);
    } catch (error) {
      logger.error('[event-bus] Flush error:', error);
    } finally {
      this.flushing = false;
    }
  }

  private async flushEvents() {
    // Atomically grab all buffered events
    const count = await redis.llen(EVENT_BUFFER_KEY);
    if (count === 0) return;

    // Use LRANGE + LTRIM atomically via pipeline
    const pipeline = redis.pipeline();
    pipeline.lrange(EVENT_BUFFER_KEY, 0, count - 1);
    pipeline.ltrim(EVENT_BUFFER_KEY, count, -1);
    const results = await pipeline.exec();

    const rawEvents = (results?.[0]?.[1] as string[]) || [];
    if (rawEvents.length === 0) return;

    const events: BufferedEvent[] = [];
    for (const raw of rawEvents) {
      try {
        events.push(JSON.parse(raw));
      } catch {
        logger.warn('[event-bus] Skipping malformed event');
      }
    }

    if (events.length === 0) return;

    try {
      await prisma.eventLog.createMany({
        data: events.map((e) => ({
          sessionId: e.sessionId,
          category: e.category,
          type: e.type,
          payload: e.payload as Record<string, string>,
          timestamp: new Date(e.timestamp),
        })),
      });
      logger.debug(`[event-bus] Flushed ${events.length} events to PG`);
    } catch (err) {
      logger.warn(
        `[event-bus] Failed to flush ${events.length} events to PG (PrismaValidation?):`,
        err,
      );
    }
  }

  private async flushSignals() {
    const count = await redis.llen(SIGNAL_BUFFER_KEY);
    if (count === 0) return;

    const pipeline = redis.pipeline();
    pipeline.lrange(SIGNAL_BUFFER_KEY, 0, count - 1);
    pipeline.ltrim(SIGNAL_BUFFER_KEY, count, -1);
    const results = await pipeline.exec();

    const rawSignals = (results?.[0]?.[1] as string[]) || [];
    if (rawSignals.length === 0) return;

    const signals: BufferedSignal[] = [];
    for (const raw of rawSignals) {
      try {
        signals.push(JSON.parse(raw));
      } catch {
        logger.warn('[event-bus] Skipping malformed signal');
      }
    }

    if (signals.length === 0) return;

    try {
      // @ts-expect-error TODO(task-13): behaviorSignal Prisma model lands with signal registry integration
      await prisma.behaviorSignal.createMany({
        data: signals.map((s) => ({
          sessionId: s.sessionId,
          signalType: s.signalType,
          value: s.value,
          context: s.context as Record<string, string>,
          timestamp: new Date(s.timestamp),
        })),
      });
      logger.debug(`[event-bus] Flushed ${signals.length} signals to PG`);
    } catch (err) {
      logger.warn(
        `[event-bus] Failed to flush ${signals.length} signals to PG (PrismaValidation?):`,
        err,
      );
      return; // Skip downstream analysis if persist failed
    }

    // M3-1: Trigger async signal analysis for affected sessions
    const sessionIds = [...new Set(signals.map((s) => s.sessionId))];
    for (const sid of sessionIds) {
      // Fire-and-forget: don't block flush on analysis
      // @ts-expect-error TODO(task-13): signal-analysis worker module lands with signal registry integration
      import('../workers/signal-analysis.worker.js')
        .then((worker) => worker.processSignalBatch(sid))
        .catch((err) => logger.error(`[event-bus] Signal analysis error for ${sid}:`, err));
    }
  }

  /** Query events for a session (for replay) */
  async getSessionEvents(
    sessionId: string,
    options?: {
      category?: EventCategory;
      fromTimestamp?: Date;
      toTimestamp?: Date;
      limit?: number;
    },
  ) {
    return prisma.eventLog.findMany({
      where: {
        sessionId,
        ...(options?.category && { category: options.category }),
        ...(options?.fromTimestamp || options?.toTimestamp
          ? {
              timestamp: {
                ...(options?.fromTimestamp && { gte: options.fromTimestamp }),
                ...(options?.toTimestamp && { lte: options.toTimestamp }),
              },
            }
          : {}),
      },
      orderBy: { timestamp: 'asc' },
      ...(options?.limit && { take: options.limit }),
    });
  }

  /** Query events for a specific checkpoint */
  async getCheckpointEvents(sessionId: string, checkpoint: number) {
    return prisma.eventLog.findMany({
      where: {
        sessionId,
        payload: {
          path: ['checkpoint'],
          equals: checkpoint,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /** Get behavior signals for a session */
  async getSessionSignals(sessionId: string, signalType?: string) {
    // @ts-expect-error TODO(task-13): behaviorSignal Prisma model lands with signal registry integration
    return prisma.behaviorSignal.findMany({
      where: {
        sessionId,
        ...(signalType && { signalType }),
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  /** Get buffer stats (for health/monitoring) */
  async getBufferStats() {
    const [eventCount, signalCount] = await Promise.all([
      redis.llen(EVENT_BUFFER_KEY),
      redis.llen(SIGNAL_BUFFER_KEY),
    ]);
    return { eventBufferSize: eventCount, signalBufferSize: signalCount };
  }
}

export const eventBus = new EventBusService();
