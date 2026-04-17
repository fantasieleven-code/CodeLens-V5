/**
 * V5 server entrypoint.
 *
 * Task 5.5 scope: minimal Express + Socket.IO bootstrap so `npm run dev` works
 * and /health returns a real status. Module-specific routes and socket handlers
 * land in later tasks (MC=Task 11, MB=Task 12, Admin=Task 15).
 *
 * Routes intentionally NOT registered — still in TYPECHECK_EXCLUDES.md:
 *   - routes/session.ts       (Task 11, MC backend rewrite)
 *   - routes/shared-report.ts (Task 15, Admin API / Prisma V5 fields)
 *   - config/job-models/*     (Task 6, not a route — noted for completeness)
 */

import 'dotenv/config';
import { env } from './config/env.js';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import { prisma } from './config/db.js';
import { redis } from './config/redis.js';
import { logger } from './lib/logger.js';

import { securityMiddleware } from './middleware/security.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import { eventBus } from './services/event-bus.service.js';
import { sandboxFactory } from './services/sandbox/index.js';
import { healthRouter } from './routes/health.js';

const app = express();

securityMiddleware(app);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestIdMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    (req.log ?? logger).info(`${req.method} ${req.originalUrl} ${res.statusCode}`, {
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.use('/health', healthRouter);
app.use('/api', apiLimiter);

app.use(errorHandler);

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: env.CORS_ORIGIN, credentials: true },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  logger.info('[socket] connected', { socketId: socket.id });
  socket.on('disconnect', (reason) => {
    logger.info('[socket] disconnected', { socketId: socket.id, reason });
  });
});

eventBus.start();

const server = httpServer.listen(env.PORT, () => {
  logger.info(`[server] listening on :${env.PORT}`, {
    env: env.NODE_ENV,
    cors: env.CORS_ORIGIN,
    sandboxTiers: sandboxFactory.getHealthReport(),
  });
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`[server] ${signal} received, shutting down`);
  server.close();
  io.close();
  try {
    await eventBus.stop();
  } catch (err) {
    logger.warn('[server] eventBus.stop error', err as Error);
  }
  try {
    await prisma.$disconnect();
  } catch (err) {
    logger.warn('[server] prisma.$disconnect error', err as Error);
  }
  try {
    redis.disconnect();
  } catch (err) {
    logger.warn('[server] redis.disconnect error', err as Error);
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('[server] unhandledRejection', reason as Error);
});
process.on('uncaughtException', (err) => {
  logger.error('[server] uncaughtException', err);
  process.exit(1);
});

export { app, io, server };
