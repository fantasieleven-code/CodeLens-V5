import { Router } from 'express';
import { prisma } from '../config/db.js';
import { redis } from '../config/redis.js';
import { modelFactory } from '../services/model/index.js';
import { eventBus } from '../services/event-bus.service.js';
import { sandboxFactory } from '../services/sandbox/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const checks: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  try {
    const pong = await redis.ping();
    checks.redis = pong === 'PONG' ? 'ok' : 'error';
  } catch {
    checks.redis = 'error';
  }

  const sandboxReport = sandboxFactory.getHealthReport();
  const degraded = await sandboxFactory.isDegraded().catch(() => true);
  if (sandboxReport.e2b === 'unknown') {
    checks.sandbox = degraded ? 'degraded' : 'ok';
  } else {
    checks.sandbox = degraded ? 'degraded' : sandboxReport.e2b.ok ? 'ok' : 'degraded';
  }

  const modelStatus = modelFactory.getStatus();
  checks.ai = modelStatus.some((p) => p.available) ? 'ok' : 'no_providers';

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
    sandbox: sandboxReport,
    modelProviders: modelStatus,
    eventBuffer: eventBufferStats,
  });
});
