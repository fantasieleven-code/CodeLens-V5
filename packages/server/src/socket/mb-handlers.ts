/**
 * MB (Cursor mode) socket handlers.
 *
 * Scaffolded in Task 12 Step 3 so downstream steps add listeners without
 * touching src/index.ts. Step 4 wires the 8 event names per
 * docs/v5-planning/backend-agent-tasks.md §Task 12 L1201-1296:
 *   - v5:mb:planning:submit
 *   - v5:mb:chat_generate
 *   - v5:mb:completion_request
 *   - v5:mb:run_test
 *   - v5:mb:file_change
 *   - v5:mb:visibility_change  (Round 2 Part 3 调整 4)
 *   - v5:mb:standards:submit
 *   - v5:mb:audit:submit
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';

export function registerMBHandlers(_io: SocketIOServer, _socket: Socket): void {
  // Intentionally empty — Step 4 fills in listeners.
}
