/**
 * E2B health check worker.
 *
 * Polls the E2B platform every 60s and pushes the observed state into
 * SandboxFactory so new create() calls fall through to Docker / Static
 * without waiting for the next probe tick.
 */

import { Sandbox } from '@e2b/code-interpreter';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sandboxFactory } from './sandbox/index.js';

const HEALTH_CHECK_INTERVAL_MS = 60_000;
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const MAX_FAILURES_BEFORE_DEGRADED = 2;

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;

async function checkHealth(): Promise<boolean> {
  if (!env.E2B_API_KEY) return false;
  try {
    await Promise.race([
      Sandbox.list({ apiKey: env.E2B_API_KEY }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('E2B health check timeout')), HEALTH_CHECK_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch (error) {
    logger.warn('E2B health check failed:', error);
    return false;
  }
}

export const e2bHealthService = {
  start(): void {
    if (healthCheckTimer) return;
    logger.info('E2B health check service started');

    healthCheckTimer = setInterval(async () => {
      const healthy = await checkHealth();
      if (healthy) {
        if (consecutiveFailures > 0) {
          logger.info(`E2B health recovered after ${consecutiveFailures} failures`);
        }
        consecutiveFailures = 0;
        sandboxFactory.setE2bHealthy(true);
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_DEGRADED) {
          sandboxFactory.setE2bHealthy(false);
          logger.error(
            `E2B platform marked unavailable after ${consecutiveFailures} consecutive failures`,
          );
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  },

  stop(): void {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  },

  getConsecutiveFailures(): number {
    return consecutiveFailures;
  },
};
