/**
 * Optional socket session identity for the V5.1 migration.
 *
 * Existing clients still send `payload.sessionId`. New clients may bind the
 * session id once during the Socket.IO handshake via `auth.sessionId` or
 * `query.sessionId`; handlers resolve the bound id first and keep payload
 * fallback until telemetry proves payload ids can be removed.
 */

import { logger } from '../lib/logger.js';

interface SessionHandshake {
  auth?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

interface SessionSocket {
  data?: Record<string, unknown>;
  handshake?: SessionHandshake;
}

interface SessionMiddlewareTarget {
  use: (middleware: (socket: SessionSocket, next: (err?: Error) => void) => void) => unknown;
}

interface SessionPayload {
  sessionId?: unknown;
}

type SessionIdentitySource = 'socket-bound' | 'payload-fallback' | 'missing';

interface SessionIdentityResolution {
  sessionId: string | null;
  source: SessionIdentitySource;
}

interface ResolveSessionOptions {
  event?: string;
  socketId?: string;
}

function coerceSessionId(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function bindSocketSessionIdentity(socket: SessionSocket): string | null {
  const sessionId =
    coerceSessionId(socket.handshake?.auth?.sessionId) ??
    coerceSessionId(socket.handshake?.query?.sessionId);

  if (!sessionId) return null;

  socket.data = { ...(socket.data ?? {}), sessionId };
  return sessionId;
}

export function registerSocketSessionIdentityMiddleware(target: SessionMiddlewareTarget): void {
  target.use((socket, next) => {
    bindSocketSessionIdentity(socket);
    next();
  });
}

export function resolveSocketSessionId(
  socket: SessionSocket,
  payload?: SessionPayload,
  options?: ResolveSessionOptions,
): string | null {
  const resolved = resolveSocketSessionIdentity(socket, payload, options);
  return resolved.sessionId;
}

export function resolveSocketSessionIdentity(
  socket: SessionSocket,
  payload?: SessionPayload,
  options?: ResolveSessionOptions,
): SessionIdentityResolution {
  const socketSessionId = coerceSessionId(socket.data?.sessionId);
  if (socketSessionId) {
    return { sessionId: socketSessionId, source: 'socket-bound' };
  }

  const payloadSessionId = coerceSessionId(payload?.sessionId);
  if (payloadSessionId) {
    if (options?.event) {
      logger.info('[socket:session] payload sessionId fallback used', {
        event: options.event,
        socketId: options.socketId,
        sessionId: payloadSessionId,
      });
    }
    return { sessionId: payloadSessionId, source: 'payload-fallback' };
  }

  return { sessionId: null, source: 'missing' };
}

export function missingSessionMessage(event: string): string {
  return `${event} requires sessionId in socket handshake or payload`;
}
