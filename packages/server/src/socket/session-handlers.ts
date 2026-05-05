/**
 * Candidate session lifecycle socket handlers.
 *
 * V5 module pages do not mount the legacy authenticated useSocket() hook; they
 * emit directly through getSocket() and carry sessionId in each payload. Keep
 * session completion on the same explicit-envelope contract as module submits.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { sessionService } from '../services/session.service.js';
import { ackBoolean, describeSocketError, failSocketRequest } from './socket-contract.js';

const sessionEndPayloadSchema = z.object({
  sessionId: z.string().min(1),
});

export function registerSessionHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('session:end', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = sessionEndPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:session] session:end schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      failSocketRequest(socket, 'session:end', 'VALIDATION_ERROR', parsed.error.message, ack);
      return;
    }

    const { sessionId } = parsed.data;
    try {
      await sessionService.endSession(sessionId);
      ackBoolean(ack, true);
    } catch (err) {
      const message = describeSocketError(err);
      logger.warn('[socket:session] session:end failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      failSocketRequest(socket, 'session:end', 'PERSIST_FAILED', message, ack);
    }
  });
}
