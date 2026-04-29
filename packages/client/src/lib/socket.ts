import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@codelens-v5/shared';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

function createSocket(autoConnect: boolean): TypedSocket {
  return io('/interview', {
    // V5 module pages emit directly through getSocket(); no root socket hook
    // mount is required for final-submit and behavior telemetry writes.
    autoConnect,
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 120_000,
  });
}

export function getSocket(): TypedSocket {
  if (!socket) {
    socket = createSocket(true);
  }
  return socket;
}

export function connectSocket(token: string): TypedSocket {
  const s = socket ?? createSocket(false);
  socket = s;
  s.auth = { token };
  s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
