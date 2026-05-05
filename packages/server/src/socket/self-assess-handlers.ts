/**
 * SelfAssess (SE) socket handler — Task 24 / Cluster D.
 *
 * Wires the V4-legacy `self-assess:submit` event (Frontend PR #58 emits this
 * verbatim, V5 prefix would break that contract — Pattern C #4 lesson).
 *
 * Dual-shape bridge: Frontend can emit either a V4-flavored envelope
 *   { sessionId, selfConfidence (0-100), selfIdentifiedRisk?, responseTimeMs }
 * or a V5-native envelope
 *   { sessionId, submission: V5SelfAssessSubmission }
 * and the V5 sMetaCognition signal reads V5SelfAssessSubmission shape
 *   { confidence (0-1, peak 0.6), reasoning, reviewedDecisions? }
 * Server normalizes V4 → V5 here before persist and accepts V5 directly so the
 * client can migrate without an event rename. The V4 bridge remains until
 * usage logs prove it is unused.
 *
 * Mapping rationale:
 *   - selfConfidence (0-100) → confidence (0-1) via division by 100, then
 *     clamp01 (defensive — Frontend slider is 0-100 so the input range is
 *     trusted, but a malformed payload shouldn't crash scoring).
 *   - selfIdentifiedRisk → reasoning (rename only, semantic identity).
 *   - reviewedDecisions → pass through when present; old V4 clients omit it,
 *     so sMetaCognition's reviewScore naturally degrades to 0 for that shape.
 *   - responseTimeMs → dropped: no V5 consumer in the current signal set.
 *
 * Ack contract: `(ok: boolean) => void` — preserves PR #58 timeout guard
 * shape verbatim (settled flag pattern + 8s setTimeout fallback). Switching
 * to `{ success: boolean }` would break Frontend tests at L175,189 and the
 * timeout-restoration logic at L97-122. The `ok` boolean covers the success
 * channel; `ok=false` is reserved for explicit server failures (validation,
 * persist throw).
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { V5SelfAssessSubmission } from '@codelens-v5/shared';
import { V5Event } from '@codelens-v5/shared';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { eventBus } from '../services/event-bus.service.js';
import { persistSelfAssess } from '../services/modules/se.service.js';
import { ackBoolean, describeSocketError, failSocketRequest } from './socket-contract.js';

const reviewedDecisionsSchema = z.array(z.string()).optional();

const legacyPayloadSchema = z.object({
  sessionId: z.string().min(1),
  selfConfidence: z.number(),
  selfIdentifiedRisk: z.string().optional(),
  responseTimeMs: z.number(),
  reviewedDecisions: reviewedDecisionsSchema,
});

const v5SubmissionSchema = z.object({
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  reviewedDecisions: reviewedDecisionsSchema,
});

const v5EnvelopeSchema = z.object({
  sessionId: z.string().min(1),
  submission: v5SubmissionSchema,
});

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

type ParsedSelfAssessPayload =
  | {
      ok: true;
      sessionId: string;
      submission: V5SelfAssessSubmission;
      shape: 'v4-bridge' | 'v5-native';
    }
  | { ok: false; message: string };

function normalizeLegacy(payload: z.infer<typeof legacyPayloadSchema>): V5SelfAssessSubmission {
  return {
    confidence: clamp01(payload.selfConfidence / 100),
    reasoning: payload.selfIdentifiedRisk ?? '',
    ...(payload.reviewedDecisions !== undefined
      ? { reviewedDecisions: payload.reviewedDecisions }
      : {}),
  };
}

function parseSelfAssessPayload(raw: unknown): ParsedSelfAssessPayload {
  const v5 = v5EnvelopeSchema.safeParse(raw);
  if (v5.success) {
    return {
      ok: true,
      sessionId: v5.data.sessionId,
      submission: v5.data.submission,
      shape: 'v5-native',
    };
  }

  const legacy = legacyPayloadSchema.safeParse(raw);
  if (legacy.success) {
    return {
      ok: true,
      sessionId: legacy.data.sessionId,
      submission: normalizeLegacy(legacy.data),
      shape: 'v4-bridge',
    };
  }

  return { ok: false, message: legacy.error.message };
}

export function registerSelfAssessHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('self-assess:submit', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = parseSelfAssessPayload(raw);
    if (!parsed.ok) {
      logger.warn('[socket:se] self-assess:submit schema invalid', {
        socketId: socket.id,
        error: parsed.message,
      });
      failSocketRequest(socket, 'self-assess:submit', 'VALIDATION_ERROR', parsed.message, ack);
      return;
    }

    const { sessionId, submission, shape } = parsed;
    if (shape === 'v4-bridge') {
      logger.info('[socket:se] self-assess:submit V4 bridge payload received', {
        socketId: socket.id,
        sessionId,
      });
    }

    try {
      await persistSelfAssess(sessionId, submission);
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId,
        module: 'selfAssess',
      });
      ackBoolean(ack, true);
    } catch (err) {
      const message = describeSocketError(err);
      logger.warn('[socket:se] self-assess:submit failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      failSocketRequest(socket, 'self-assess:submit', 'PERSIST_FAILED', message, ack);
    }
  });
}
