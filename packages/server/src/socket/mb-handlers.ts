/**
 * MB (Cursor mode) socket handlers.
 *
 * Wires the 8 client-facing events per docs/v5-planning/backend-agent-tasks.md
 * §Task 12 L1201-1296, plus v5:mb:visibility_change from Round 2 Part 3 调整 4
 * (docs/v5-planning/v5-design-clarifications.md L550-588).
 *
 * Design notes:
 *   - Every payload carries `sessionId` — socket-level auth is added later (Task 15).
 *   - chat_generate uses modelFactory.stream() role=coding_agent (Qwen primary,
 *     Claude fallback); the default model override is `qwen3-coder-instruct`.
 *   - completion_request uses modelFactory.generate() with `qwen3-coder-base`.
 *   - run_test creates a short-lived sandbox, runs `pytest -v`, destroys it.
 *   - file_change mutates fileSnapshotService in-memory; no DB write until
 *     FileSnapshotService.persistToMetadata() is called on submission.
 *   - visibility_change appends directly to metadata.mb.editorBehavior so
 *     sDecisionLatencyQuality has the tab-visibility history at scoring time.
 *   - Errors are logged + surfaced to the client via `*_error` emits; they never
 *     throw out of the socket listener (which would crash the connection).
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { V5MBAudit, V5MBPlanning, V5MBStandards, V5MBSubmission } from '@codelens-v5/shared';
import { V5Event } from '@codelens-v5/shared';

import { logger } from '../lib/logger.js';
import { eventBus } from '../services/event-bus.service.js';
import { getLangfuse } from '../lib/langfuse.js';
import { modelFactory } from '../services/model/index.js';
import { sandboxFactory } from '../services/sandbox/index.js';
import { fileSnapshotService } from '../services/file-snapshot.service.js';
import { promptRegistry } from '../services/prompt-registry.service.js';
import {
  calculatePassRate,
  persistAudit,
  persistPlanning,
  persistStandards,
  persistFinalTestRun,
  persistMbSubmission,
  appendVisibilityEvent,
} from '../services/modules/mb.service.js';
import {
  ackBoolean,
  describeSocketError,
  failSocketRequest,
  type BooleanAck,
} from './socket-contract.js';
import { missingSessionMessage, resolveSocketSessionId } from './socket-session.js';

interface PlanningPayload {
  sessionId: string;
  planning: V5MBPlanning;
}

interface StandardsPayload {
  sessionId: string;
  rulesContent: string;
  agentContent?: string;
}

interface AuditPayload {
  sessionId: string;
  violations: V5MBAudit['violations'];
}

interface ChatGeneratePayload {
  sessionId: string;
  prompt: string;
  filesContext: string;
}

interface CompletionRequestPayload {
  sessionId: string;
  filePath: string;
  content: string;
  line: number;
  column: number;
}

interface RunTestPayload {
  sessionId: string;
}

interface FileChangePayload {
  sessionId: string;
  filePath: string;
  content: string;
  source: 'manual_edit' | 'ai_chat' | 'ai_completion';
}

interface VisibilityChangePayload {
  sessionId: string;
  timestamp: number;
  hidden: boolean;
}

interface SubmitPayload {
  sessionId?: string;
  submission: V5MBSubmission;
}

type Ack = (ok: boolean) => void;

function safe<T extends unknown[]>(
  socket: Socket,
  event: string,
  handler: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[socket:mb] ${event} failed`, { socketId: socket.id, error: message });
      socket.emit(`${event}:error`, { error: message });
    }
  };
}

export function registerMBHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on(
    'v5:mb:planning:submit',
    async (payload: PlanningPayload, ack?: Ack) => {
      try {
        await persistPlanning(payload.sessionId, payload.planning);
        await eventBus.emit(V5Event.MODULE_SUBMITTED, {
          sessionId: payload.sessionId,
          module: 'mb.planning',
        });
        ack?.(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[socket:mb] v5:mb:planning:submit failed', {
          socketId: socket.id,
          sessionId: payload?.sessionId,
          error: message,
        });
        socket.emit('v5:mb:planning:submit:error', { error: message });
        ack?.(false);
      }
    },
  );

  socket.on(
    'v5:mb:standards:submit',
    async (payload: StandardsPayload, ack?: Ack) => {
      try {
        const standards: V5MBStandards = {
          rulesContent: payload.rulesContent,
          ...(payload.agentContent !== undefined ? { agentContent: payload.agentContent } : {}),
        };
        await persistStandards(payload.sessionId, standards);
        await eventBus.emit(V5Event.MODULE_SUBMITTED, {
          sessionId: payload.sessionId,
          module: 'mb.standards',
        });
        ack?.(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('[socket:mb] v5:mb:standards:submit failed', {
          socketId: socket.id,
          sessionId: payload?.sessionId,
          error: message,
        });
        socket.emit('v5:mb:standards:submit:error', { error: message });
        ack?.(false);
      }
    },
  );

  socket.on(
    'v5:mb:audit:submit',
    safe(socket, 'v5:mb:audit:submit', async (payload: AuditPayload) => {
      await persistAudit(payload.sessionId, { violations: payload.violations });
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId: payload.sessionId,
        module: 'mb.audit',
      });
    }),
  );

  socket.on(
    'v5:mb:chat_generate',
    safe(socket, 'v5:mb:chat_generate', async (payload: ChatGeneratePayload) => {
      const systemPrompt = await promptRegistry
        .get('mb.chat_generate')
        .catch(() => 'You are a coding assistant. Reply with a unified diff where applicable.');
      const startedAt = Date.now();
      let accumulated = '';
      for await (const chunk of modelFactory.stream('coding_agent', {
        sessionId: payload.sessionId,
        model: 'qwen3-coder-instruct',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'system', content: `Files context: ${payload.filesContext}` },
          { role: 'user', content: payload.prompt },
        ],
      })) {
        if (chunk.content) {
          accumulated += chunk.content;
          socket.emit('v5:mb:chat_stream', { content: chunk.content, done: chunk.done });
        }
      }
      socket.emit('v5:mb:chat_complete', { diff: accumulated });

      void traceMB('mb.chat_generate', payload.sessionId, {
        input: { promptLen: payload.prompt.length, filesCtxLen: payload.filesContext.length },
        output: { responseLen: accumulated.length, latencyMs: Date.now() - startedAt },
        metadata: { model: 'qwen3-coder-instruct' },
      });
    }),
  );

  socket.on(
    'v5:mb:completion_request',
    safe(socket, 'v5:mb:completion_request', async (payload: CompletionRequestPayload) => {
      const startedAt = Date.now();
      const result = await modelFactory.generate('coding_agent', {
        sessionId: payload.sessionId,
        model: 'qwen3-coder-base',
        maxTokens: 50,
        messages: [
          { role: 'system', content: 'Complete the code at the cursor position.' },
          {
            role: 'user',
            content: `File: ${payload.filePath}\n\n${payload.content}\n\nCursor at line ${payload.line}, col ${payload.column}`,
          },
        ],
      });

      socket.emit('v5:mb:completion_response', { completion: result.content });

      await eventBus.emit(V5Event.MB_COMPLETION_SHOWN, {
        sessionId: payload.sessionId,
        filePath: payload.filePath,
        line: payload.line,
      });

      void traceMB('mb.completion_request', payload.sessionId, {
        input: { filePath: payload.filePath, line: payload.line, column: payload.column },
        output: { completionLen: result.content.length, latencyMs: Date.now() - startedAt },
        metadata: { model: 'qwen3-coder-base' },
      });
    }),
  );

  socket.on(
    'v5:mb:run_test',
    safe(socket, 'v5:mb:run_test', async (payload: RunTestPayload) => {
      const files = fileSnapshotService.getSnapshot(payload.sessionId);
      const provider = await sandboxFactory.getProvider();
      const sandbox = await provider.create();
      try {
        await provider.writeFiles(sandbox, files);
        const result = await provider.execute(sandbox, 'pytest -v', 30_000);
        const passRate = calculatePassRate(result.stdout);
        socket.emit('v5:mb:test_result', {
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          passRate,
          durationMs: result.durationMs,
        });
        await persistFinalTestRun(payload.sessionId, {
          passRate,
          duration: result.durationMs,
        });
        await eventBus.emit(V5Event.MB_TEST_RUN, {
          sessionId: payload.sessionId,
          passRate,
          duration: result.durationMs,
        });
      } finally {
        await provider.destroy(sandbox).catch((err) => {
          logger.warn('[socket:mb] sandbox destroy failed', {
            sessionId: payload.sessionId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }),
  );

  socket.on(
    'v5:mb:file_change',
    safe(socket, 'v5:mb:file_change', async (payload: FileChangePayload) => {
      fileSnapshotService.setFileContent(
        payload.sessionId,
        payload.filePath,
        payload.content,
        payload.source,
      );
    }),
  );

  socket.on(
    'v5:mb:visibility_change',
    safe(socket, 'v5:mb:visibility_change', async (payload: VisibilityChangePayload) => {
      await appendVisibilityEvent(payload.sessionId, {
        timestamp: payload.timestamp,
        hidden: payload.hidden,
      });
    }),
  );

  socket.on(
    'v5:mb:submit',
    async (payload: SubmitPayload, ack?: BooleanAck) => {
      const sessionId = resolveSocketSessionId(socket, payload);
      if (!sessionId) {
        failSocketRequest(
          socket,
          'v5:mb:submit',
          'VALIDATION_ERROR',
          missingSessionMessage('v5:mb:submit'),
          ack,
        );
        return;
      }
      try {
        await fileSnapshotService.persistToMetadata(sessionId);
        await persistMbSubmission(sessionId, payload.submission);
        await eventBus.emit(V5Event.MODULE_SUBMITTED, {
          sessionId,
          module: 'mb.submit',
        });
        ackBoolean(ack, true);
      } catch (err) {
        const message = describeSocketError(err);
        logger.warn('[socket:mb] v5:mb:submit failed', {
          socketId: socket.id,
          sessionId,
          error: message,
        });
        failSocketRequest(socket, 'v5:mb:submit', 'PERSIST_FAILED', message, ack);
      }
    },
  );
}

async function traceMB(
  name: string,
  sessionId: string,
  params: { input: unknown; output: unknown; metadata?: Record<string, unknown> },
): Promise<void> {
  try {
    const langfuse = await getLangfuse();
    langfuse.trace({ name, sessionId, ...params });
  } catch (err) {
    logger.debug(`[mb] langfuse trace failed`, {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
