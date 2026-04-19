/**
 * behavior:batch ingest (Task 22 / Cluster A).
 *
 * The client's useBehaviorTracker flushes high-volume telemetry under the
 * legacy `behavior:batch` envelope (no `v5:mb:` prefix). This handler
 * dispatches by event.type and persists into
 * session.metadata.mb.editorBehavior.* so the 11 Cluster A signals can
 * read non-empty arrays at scoring time.
 *
 * Pattern H v2.2: every dispatch path requires both a unit test (this PR)
 * and an integration test that proves the persisted shape matches what the
 * signal reads (Task 22 e2e — Pattern H gate).
 *
 * Scope of this PR: only `ai_completion_responded` is persisted, since that
 * single field-read unblocks 6 of 11 Cluster A signals (sDecisionLatencyQuality,
 * sAiCompletionAcceptRate, partial reads from sChatVsDirectRatio /
 * sBlockSelectivity / sModifyQuality / sVerifyDiscipline). The remaining
 * event types (chat_prompt_sent, diff_*, file_*, etc.) are no-op'd here and
 * land in Task 22.x follow-ups; logging the unknown type keeps the gap
 * visible without dropping the whole batch.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import {
  appendAiCompletionEvents,
  type AiCompletionEvent,
} from '../services/modules/mb.service.js';

const eventSchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  payload: z.record(z.unknown()),
});

const batchSchema = z.object({
  sessionId: z.string().min(1),
  events: z.array(eventSchema),
});

type BatchEvent = z.infer<typeof eventSchema>;

export function registerBehaviorHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('behavior:batch', async (raw: unknown) => {
    const parsed = batchSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:behavior] batch schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      return;
    }
    const { sessionId, events } = parsed.data;

    const completions = events
      .filter((e) => e.type === 'ai_completion_responded')
      .map(toAiCompletionEvent)
      .filter((e): e is AiCompletionEvent => e !== null);

    if (completions.length > 0) {
      try {
        await appendAiCompletionEvents(sessionId, completions);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[socket:behavior] persist aiCompletionEvents failed', {
          sessionId,
          socketId: socket.id,
          error: message,
        });
      }
    }

    const unhandled = events.filter((e) => e.type !== 'ai_completion_responded');
    if (unhandled.length > 0) {
      logger.debug('[socket:behavior] dropped non-completion events (Task 22.x follow-up)', {
        sessionId,
        types: Array.from(new Set(unhandled.map((e) => e.type))),
        count: unhandled.length,
      });
    }
  });
}

function toAiCompletionEvent(e: BatchEvent): AiCompletionEvent | null {
  const p = e.payload;
  const lineRaw = typeof p.line === 'number' ? p.line : typeof p.lineNumber === 'number' ? p.lineNumber : null;
  const completionLength = typeof p.completionLength === 'number' ? p.completionLength : null;
  const accepted = typeof p.accepted === 'boolean' ? p.accepted : null;
  if (lineRaw === null || completionLength === null || accepted === null) return null;
  const ts = Date.parse(e.timestamp);
  if (Number.isNaN(ts)) return null;
  return {
    timestamp: ts,
    accepted,
    lineNumber: lineRaw,
    completionLength,
    ...(typeof p.shown === 'boolean' ? { shown: p.shown } : {}),
    ...(typeof p.rejected === 'boolean' ? { rejected: p.rejected } : {}),
    ...(typeof p.shownAt === 'number' ? { shownAt: p.shownAt } : {}),
    ...(typeof p.respondedAt === 'number' ? { respondedAt: p.respondedAt } : {}),
    ...(typeof p.documentVisibleMs === 'number' ? { documentVisibleMs: p.documentVisibleMs } : {}),
  };
}
