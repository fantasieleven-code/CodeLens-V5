/**
 * Socket.IO connection router.
 *
 * Owns base connection/disconnection lifecycle and delegates module-specific
 * wiring to per-module registrars:
 *   - registerMBHandlers (Task 12, MB Cursor endpoints)
 *   - registerMCHandlers (Task 11, MC voice chat) — not yet extracted
 *   - registerAdminHandlers (Task 15) — not yet extracted
 *
 * Called once at startup from src/index.ts.
 */

import type { Server as SocketIOServer } from 'socket.io';

import { logger } from '../lib/logger.js';
import { registerBehaviorHandlers } from './behavior-handlers.js';
import { registerMBHandlers } from './mb-handlers.js';
import { registerModuleAHandlers } from './moduleA-handlers.js';
import { registerModuleDHandlers } from './moduleD-handlers.js';
import { registerPhase0Handlers } from './phase0-handlers.js';
import { registerSelfAssessHandlers } from './self-assess-handlers.js';

export function registerSocketHandlers(io: SocketIOServer): void {
  io.on('connection', (socket) => {
    logger.info('[socket] connected', { socketId: socket.id });

    registerMBHandlers(io, socket);
    registerBehaviorHandlers(io, socket);
    registerSelfAssessHandlers(io, socket);
    registerPhase0Handlers(io, socket);
    registerModuleAHandlers(io, socket);
    registerModuleDHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info('[socket] disconnected', { socketId: socket.id, reason });
    });
  });
}
