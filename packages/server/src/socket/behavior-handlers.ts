/**
 * behavior:batch ingest (Task 22 + Task 30a / Cluster A).
 *
 * The client's useBehaviorTracker flushes high-volume telemetry under the
 * legacy `behavior:batch` envelope (no `v5:mb:` prefix). This handler
 * dispatches by event.type and persists into
 * session.metadata.mb.editorBehavior.* so the 11 Cluster A signals can
 * read non-empty arrays at scoring time.
 *
 * Pattern H v2.2: every dispatch path requires both a unit test (this PR)
 * and an integration test that proves the persisted shape matches what the
 * signal reads. Task 22 first wired ai_completion_responded; Task 30a
 * extends to chat / diff / file / edit-session pipelines (Pattern H 7th
 * gate at `tests/integration/behavior-batch-pipeline.test.ts`).
 *
 * Per-type dispatch (Task 30a — closes "Task 22.x follow-up" promise):
 *   - ai_completion_*           → appendAiCompletionEvents (Task 22)
 *   - chat_prompt_sent /        → appendChatEvents
 *     chat_response_received
 *   - diff_accepted /           → appendDiffEvents
 *     diff_rejected
 *   - file_opened / _switched / → appendFileNavigation
 *     _closed
 *   - edit_session_completed    → appendEditSessions (client emit lands in
 *                                 Task 30b; today exercised via mocked events
 *                                 in the Pattern H 7th gate)
 *   - cursor_move / key_press / → silent drop (not consumed by any V5 signal)
 *     visibility_change / etc.
 *
 * Race avoidance: per-pipeline appendXxx calls are serialized inside the
 * handler because each does a read-modify-write of session.metadata.
 * Parallelizing would risk one append clobbering another's edits.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import {
  appendAiCompletionEvents,
  appendChatEvents,
  appendDiffEvents,
  appendEditSessions,
  appendFileNavigation,
  type AiCompletionEvent,
  type ChatEvent,
  type DiffEvent,
  type EditSessionEvent,
  type FileNavEvent,
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

const AI_COMPLETION_TYPES = new Set([
  'ai_completion_shown',
  'ai_completion_accepted',
  'ai_completion_rejected',
  'ai_completion_responded',
]);
const CHAT_TYPES = new Set(['chat_prompt_sent', 'chat_response_received']);
const DIFF_TYPES = new Set(['diff_accepted', 'diff_rejected']);
const FILE_TYPES = new Set(['file_opened', 'file_switched', 'file_closed']);
const EDIT_TYPES = new Set(['edit_session_completed']);

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

    const completions: AiCompletionEvent[] = [];
    const chats: ChatEvent[] = [];
    const diffs: DiffEvent[] = [];
    const fileNavs: FileNavEvent[] = [];
    const editSessions: EditSessionEvent[] = [];
    const dropped: string[] = [];

    for (const e of events) {
      if (AI_COMPLETION_TYPES.has(e.type) && e.type === 'ai_completion_responded') {
        const mapped = toAiCompletionEvent(e);
        if (mapped) completions.push(mapped);
        else dropped.push(`${e.type}:invalid-payload`);
        continue;
      }
      if (AI_COMPLETION_TYPES.has(e.type)) {
        // ai_completion_shown / _accepted / _rejected — not yet consumed by a
        // signal; ai_completion_responded is the only mapped subtype today.
        dropped.push(e.type);
        continue;
      }
      if (CHAT_TYPES.has(e.type)) {
        const mapped = toChatEvent(e);
        if (mapped) chats.push(mapped);
        else dropped.push(`${e.type}:invalid-payload`);
        continue;
      }
      if (DIFF_TYPES.has(e.type)) {
        const mapped = toDiffEvent(e);
        if (mapped) diffs.push(mapped);
        else dropped.push(`${e.type}:invalid-payload`);
        continue;
      }
      if (FILE_TYPES.has(e.type)) {
        const mapped = toFileNavEvent(e);
        if (mapped) fileNavs.push(mapped);
        else dropped.push(`${e.type}:invalid-payload`);
        continue;
      }
      if (EDIT_TYPES.has(e.type)) {
        const mapped = toEditSessionEvent(e);
        if (mapped) editSessions.push(mapped);
        else dropped.push(`${e.type}:invalid-payload`);
        continue;
      }
      dropped.push(e.type);
    }

    // Only call the append methods that have something to persist — avoids
    // empty DB round-trips and matches the per-pipeline "at least one event"
    // spec exercised by the unit tests.
    if (completions.length > 0) {
      await safePersist(sessionId, socket.id, 'aiCompletionEvents', () =>
        appendAiCompletionEvents(sessionId, completions),
      );
    }
    if (chats.length > 0) {
      await safePersist(sessionId, socket.id, 'chatEvents', () =>
        appendChatEvents(sessionId, chats),
      );
    }
    if (diffs.length > 0) {
      await safePersist(sessionId, socket.id, 'diffEvents', () =>
        appendDiffEvents(sessionId, diffs),
      );
    }
    if (fileNavs.length > 0) {
      await safePersist(sessionId, socket.id, 'fileNavigationHistory', () =>
        appendFileNavigation(sessionId, fileNavs),
      );
    }
    if (editSessions.length > 0) {
      await safePersist(sessionId, socket.id, 'editSessions', () =>
        appendEditSessions(sessionId, editSessions),
      );
    }

    if (dropped.length > 0) {
      logger.debug('[socket:behavior] dropped unmapped events', {
        sessionId,
        types: Array.from(new Set(dropped)),
        count: dropped.length,
      });
    }
  });
}

async function safePersist(
  sessionId: string,
  socketId: string,
  field: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[socket:behavior] persist failed', {
      sessionId,
      socketId,
      field,
      error: message,
    });
  }
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

function toChatEvent(e: BatchEvent): ChatEvent | null {
  const p = e.payload;
  const prompt = typeof p.prompt === 'string' ? p.prompt : null;
  const responseLength = typeof p.responseLength === 'number' ? p.responseLength : null;
  const duration = typeof p.duration === 'number' ? p.duration : null;
  if (prompt === null || responseLength === null || duration === null) return null;
  const ts = Date.parse(e.timestamp);
  if (Number.isNaN(ts)) return null;
  return {
    timestamp: ts,
    prompt,
    responseLength,
    duration,
    ...(typeof p.diffShownAt === 'number' ? { diffShownAt: p.diffShownAt } : {}),
    ...(typeof p.diffRespondedAt === 'number' ? { diffRespondedAt: p.diffRespondedAt } : {}),
    ...(typeof p.documentVisibleMs === 'number' ? { documentVisibleMs: p.documentVisibleMs } : {}),
  };
}

function toDiffEvent(e: BatchEvent): DiffEvent | null {
  const p = e.payload;
  const accepted = typeof p.accepted === 'boolean' ? p.accepted : e.type === 'diff_accepted' ? true : e.type === 'diff_rejected' ? false : null;
  const linesAdded = typeof p.linesAdded === 'number' ? p.linesAdded : null;
  const linesRemoved = typeof p.linesRemoved === 'number' ? p.linesRemoved : null;
  if (accepted === null || linesAdded === null || linesRemoved === null) return null;
  const ts = Date.parse(e.timestamp);
  if (Number.isNaN(ts)) return null;
  return { timestamp: ts, accepted, linesAdded, linesRemoved };
}

function toFileNavEvent(e: BatchEvent): FileNavEvent | null {
  const p = e.payload;
  const filePath = typeof p.filePath === 'string' ? p.filePath : typeof p.path === 'string' ? p.path : null;
  const explicitAction = typeof p.action === 'string' && (p.action === 'open' || p.action === 'close' || p.action === 'switch')
    ? (p.action as 'open' | 'close' | 'switch')
    : null;
  const inferredAction: 'open' | 'close' | 'switch' | null =
    e.type === 'file_opened' ? 'open' : e.type === 'file_closed' ? 'close' : e.type === 'file_switched' ? 'switch' : null;
  const action = explicitAction ?? inferredAction;
  if (filePath === null || action === null) return null;
  const ts = Date.parse(e.timestamp);
  if (Number.isNaN(ts)) return null;
  return {
    timestamp: ts,
    filePath,
    action,
    ...(typeof p.duration === 'number' ? { duration: p.duration } : {}),
  };
}

function toEditSessionEvent(e: BatchEvent): EditSessionEvent | null {
  const p = e.payload;
  const filePath = typeof p.filePath === 'string' ? p.filePath : null;
  const startTime = typeof p.startTime === 'number' ? p.startTime : null;
  const endTime = typeof p.endTime === 'number' ? p.endTime : null;
  const keystrokeCount = typeof p.keystrokeCount === 'number' ? p.keystrokeCount : null;
  if (filePath === null || startTime === null || endTime === null || keystrokeCount === null) return null;
  return { filePath, startTime, endTime, keystrokeCount };
}
