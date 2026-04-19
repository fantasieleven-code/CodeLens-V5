/**
 * Module D (MD) socket handler — Task 27 / Cluster C-MD (final cluster).
 *
 * Closes the ModuleDPage → server persist gap. The Task 9 client persists
 * locally via setModuleSubmissionLocal but never round-trips to the server,
 * so all 4 MD signals (sAiOrchestrationQuality AE, sConstraintIdentification
 * / sDesignDecomposition / sTradeoffArticulation SD ×3) score null at the
 * orchestrator. This handler accepts the V5ModuleDSubmission shape directly
 * (no V4 bridge — Phase 1 D3 confirmed live shape ≠ design doc) and writes
 * `metadata.moduleD.*`. Post-Task 27 milestone: 41/47 = 87.2% signal coverage,
 * AE 0→1, SD 0→3, all 6 V5 dimensions non-empty.
 *
 * Naming `moduleD:submit` (lowercase-hyphen) matches `moduleA:submit`
 * (Task 26), `phase0:submit` (Task 25), and `self-assess:submit` (Task 24);
 * see ws.ts client→server declaration for the rationale (no `v5:` prefix
 * because there is a single event, not a per-module multi-event namespace).
 *
 * Zod 6-field schema: validates subModules (array of {name, responsibility,
 * optional interfaces[]}), interfaceDefinitions (string[]),
 * dataFlowDescription (string), constraintsSelected (string[]),
 * tradeoffText (string), aiOrchestrationPrompts (string[]). Live shape per
 * V5ModuleDSubmission — design doc's challengeResponse / designRevision
 * fields are out of scope until they ship to the type.
 *
 * Ack contract: `(ok: boolean) => void`. `ok=false` is reserved for explicit
 * server failures (validation, persist throw); the client treats absence /
 * timeout as recoverable and falls back to local-only persist.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';
import { V5Event } from '@codelens-v5/shared';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { eventBus } from '../services/event-bus.service.js';
import { persistModuleDSubmission } from '../services/modules/md.service.js';

const subModuleSchema = z.object({
  name: z.string(),
  responsibility: z.string(),
  interfaces: z.array(z.string()).optional(),
});

const submissionSchema = z.object({
  subModules: z.array(subModuleSchema),
  interfaceDefinitions: z.array(z.string()),
  dataFlowDescription: z.string(),
  constraintsSelected: z.array(z.string()),
  tradeoffText: z.string(),
  aiOrchestrationPrompts: z.array(z.string()),
});

const payloadSchema = z.object({
  sessionId: z.string().min(1),
  submission: submissionSchema,
});

export function registerModuleDHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('moduleD:submit', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:md] moduleD:submit schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      ack?.(false);
      return;
    }
    const { sessionId, submission } = parsed.data;
    try {
      await persistModuleDSubmission(sessionId, submission as V5ModuleDSubmission);
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId,
        module: 'moduleD',
      });
      ack?.(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[socket:md] moduleD:submit failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      ack?.(false);
    }
  });
}
