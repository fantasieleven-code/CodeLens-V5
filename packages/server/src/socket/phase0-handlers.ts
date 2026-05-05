/**
 * Phase 0 (P0) socket handler — Task 25 / Cluster C-P0.
 *
 * Closes the Phase0Page → server persist gap. The Task 9 client persists
 * locally via setModuleSubmissionLocal but never round-trips to the server,
 * so all 5 P0 signals (sBaselineReading, sTechProfile, sDecisionStyle,
 * sAiClaimDetection, sAiCalibration) score null at the orchestrator. This
 * handler accepts the V5Phase0Submission shape directly (no V4 bridge unlike
 * Task 24's `self-assess:submit`) and writes `metadata.phase0.*`.
 *
 * Naming `phase0:submit` (lowercase-hyphen) matches `self-assess:submit`
 * (Task 24) — see ws.ts client→server declaration for the rationale.
 *
 * Ack contract: `(ok: boolean) => void`. `ok=false` is reserved for explicit
 * server failures (validation, persist throw); the client treats absence /
 * timeout as recoverable and falls back to local-only persist.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { V5Phase0Submission } from '@codelens-v5/shared';
import { V5Event } from '@codelens-v5/shared';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { eventBus } from '../services/event-bus.service.js';
import { persistPhase0Submission } from '../services/modules/p0.service.js';
import { ackBoolean, describeSocketError, failSocketRequest } from './socket-contract.js';
import { missingSessionMessage, resolveSocketSessionId } from './socket-session.js';

const submissionSchema = z.object({
  codeReading: z.object({
    l1Answer: z.string(),
    l2Answer: z.string(),
    l3Answer: z.string(),
    confidence: z.number(),
  }),
  aiOutputJudgment: z.array(
    z.object({
      choice: z.enum(['A', 'B', 'both_good', 'both_bad']),
      reasoning: z.string(),
    }),
  ),
  aiClaimVerification: z.object({
    response: z.string(),
    submittedAt: z.number(),
  }),
  decision: z.object({
    choice: z.string(),
    reasoning: z.string(),
  }),
  inputBehavior: z.record(z.unknown()).optional(),
});

const payloadSchema = z.object({
  sessionId: z.string().min(1).optional(),
  submission: submissionSchema,
});

export function registerPhase0Handlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('phase0:submit', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:p0] phase0:submit schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      failSocketRequest(socket, 'phase0:submit', 'VALIDATION_ERROR', parsed.error.message, ack);
      return;
    }
    const { submission } = parsed.data;
    const sessionId = resolveSocketSessionId(socket, parsed.data);
    if (!sessionId) {
      const message = missingSessionMessage('phase0:submit');
      logger.warn('[socket:p0] phase0:submit missing session identity', {
        socketId: socket.id,
      });
      failSocketRequest(socket, 'phase0:submit', 'VALIDATION_ERROR', message, ack);
      return;
    }
    try {
      await persistPhase0Submission(sessionId, submission as V5Phase0Submission);
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId,
        module: 'phase0',
      });
      ackBoolean(ack, true);
    } catch (err) {
      const message = describeSocketError(err);
      logger.warn('[socket:p0] phase0:submit failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      failSocketRequest(socket, 'phase0:submit', 'PERSIST_FAILED', message, ack);
    }
  });
}
