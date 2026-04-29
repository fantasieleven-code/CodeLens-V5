/**
 * Module C socket handler.
 *
 * Closes the remaining MC socket gap after the /interview namespace hardening:
 * the client emits `v5:modulec:answer`, while HTTP fallback already persists
 * the same round payload through mc.service. The socket payload carries
 * sessionId in the envelope because V5 sockets still have no session middleware.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { saveRoundAnswer } from '../services/modules/mc.service.js';

const answerPayloadSchema = z.object({
  sessionId: z.string().min(1),
  round: z.number().int().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  probeStrategy: z.enum(['baseline', 'contradiction', 'weakness', 'escalation', 'transfer']),
});

export function registerModuleCHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('v5:modulec:answer', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = answerPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:mc] v5:modulec:answer schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      ack?.(false);
      return;
    }

    const { sessionId, round, answer, question, probeStrategy } = parsed.data;
    try {
      await saveRoundAnswer(sessionId, round, answer, question, probeStrategy);
      ack?.(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[socket:mc] v5:modulec:answer failed', {
        socketId: socket.id,
        sessionId,
        round,
        error: message,
      });
      ack?.(false);
    }
  });
}
