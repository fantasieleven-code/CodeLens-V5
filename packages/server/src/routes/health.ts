import { Router } from 'express';
import { Sandbox } from '@e2b/code-interpreter';
import { prisma } from '../config/db.js';
import { redis } from '../config/redis.js';
import { aiRouter } from '../services/ai-router.service.js';
import { eventBus } from '../services/event-bus.service.js';
import { sandboxService } from '../services/sandbox.service.js';
import { env } from '../config/env.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks: Record<string, string> = {};

  // Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  // Redis
  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'error';
  } catch {
    checks.redis = 'error';
  }

  // AR-7: E2B — actual health probe via Sandbox.list() with 5s timeout
  if (!env.E2B_API_KEY) {
    checks.e2b = 'not_configured';
  } else {
    try {
      await Promise.race([
        Sandbox.list({ apiKey: env.E2B_API_KEY }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
      checks.e2b = sandboxService.isDegraded() ? 'degraded' : 'ok';
    } catch {
      checks.e2b = 'error';
    }
  }

  // AI
  const aiStatus = aiRouter.getStatus();
  checks.ai = aiStatus.length > 0 ? 'ok' : 'no_providers';

  // Event bus buffer
  let eventBufferStats = { eventBufferSize: 0, signalBufferSize: 0 };
  try {
    eventBufferStats = await eventBus.getBufferStats();
  } catch {
    // Redis/EventBus may be unavailable in dev/offline mode; leave defaults.
  }

  const allOk = checks.db === 'ok' && checks.redis === 'ok';
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    services: checks,
    aiProviders: aiStatus,
    eventBuffer: eventBufferStats,
  });
});
