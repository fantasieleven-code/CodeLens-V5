/**
 * Socket contract helpers for V5.1 migration.
 *
 * Existing clients consume boolean ack callbacks, so these helpers do not
 * change handler contracts. They only centralize the future typed error frame
 * shape and make omitted/throwing acks safe while handlers migrate one by one.
 */

export type SocketErrorCode = 'VALIDATION_ERROR' | 'PERSIST_FAILED' | 'UNAUTHORIZED';

export interface SocketErrorFrame {
  code: SocketErrorCode;
  message: string;
}

export type BooleanAck = (ok: boolean) => void;

interface ErrorSocket {
  emit(event: string, payload: SocketErrorFrame): void;
}

export function describeSocketError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export function ackBoolean(ack: BooleanAck | undefined, ok: boolean): void {
  if (!ack) return;
  try {
    ack(ok);
  } catch {
    // Socket.IO acks are peer callbacks. A throwing callback must not crash the
    // server-side listener or mask the original persist/validation outcome.
  }
}

export function emitSocketError(
  socket: ErrorSocket,
  event: string,
  code: SocketErrorCode,
  message: string,
): void {
  socket.emit(`${event}:error`, { code, message });
}

export function failSocketRequest(
  socket: ErrorSocket,
  event: string,
  code: SocketErrorCode,
  message: string,
  ack?: BooleanAck,
): void {
  emitSocketError(socket, event, code, message);
  ackBoolean(ack, false);
}
