/**
 * SelfAssess (SE) socket handler — Task 24 / Cluster D.
 *
 * Wires the V4-legacy `self-assess:submit` event (Frontend PR #58 emits this
 * verbatim, V5 prefix would break that contract — Pattern C #4 lesson).
 *
 * Dual-shape bridge: Frontend emits a V4-flavored envelope
 *   { sessionId, selfConfidence (0-100), selfIdentifiedRisk?, responseTimeMs }
 * but the V5 sMetaCognition signal reads V5SelfAssessSubmission shape
 *   { confidence (0-1, peak 0.6), reasoning, reviewedDecisions? }
 * Server normalizes V4 → V5 here before persist so the signal sees the
 * fields it expects. The bridge is V5.0.5 cleanup — long-term, Frontend
 * should emit V5 shape directly and this handler can drop the mapping.
 *
 * Mapping rationale:
 *   - selfConfidence (0-100) → confidence (0-1) via division by 100, then
 *     clamp01 (defensive — Frontend slider is 0-100 so the input range is
 *     trusted, but a malformed payload shouldn't crash scoring).
 *   - selfIdentifiedRisk → reasoning (rename only, semantic identity).
 *   - reviewedDecisions → undefined: the V4 payload has no equivalent
 *     field; sMetaCognition's reviewScore degrades to 0 (target ≥3 never
 *     met). V5.0.5 candidate to plumb through Frontend.
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

const payloadSchema = z.object({
  sessionId: z.string().min(1),
  selfConfidence: z.number(),
  selfIdentifiedRisk: z.string().optional(),
  responseTimeMs: z.number(),
});

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalize(payload: z.infer<typeof payloadSchema>): V5SelfAssessSubmission {
  return {
    confidence: clamp01(payload.selfConfidence / 100),
    reasoning: payload.selfIdentifiedRisk ?? '',
  };
}

export function registerSelfAssessHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('self-assess:submit', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:se] self-assess:submit schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      ack?.(false);
      return;
    }
    const { sessionId } = parsed.data;
    try {
      const normalized = normalize(parsed.data);
      await persistSelfAssess(sessionId, normalized);
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId,
        module: 'selfAssess',
      });
      ack?.(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[socket:se] self-assess:submit failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      ack?.(false);
    }
  });
}
