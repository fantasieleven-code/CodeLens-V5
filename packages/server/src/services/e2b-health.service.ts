/**
 * AR-7: E2B Health Check Service
 *
 * Periodically checks E2B sandbox availability.
 * Sets degraded mode when E2B is unreachable.
 */

import { Sandbox } from '@e2b/code-interpreter';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { sandboxService } from './sandbox.service.js';

const HEALTH_CHECK_INTERVAL_MS = 60_000;  // 60s
const HEALTH_CHECK_TIMEOUT_MS = 5_000;    // 5s
const ORPHAN_CLEANUP_INTERVAL = 10;       // Run cleanup every N health checks (~10min)

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let healthCheckCount = 0;
const MAX_FAILURES_BEFORE_DEGRADED = 2;

async function checkHealth(): Promise<boolean> {
  if (!env.E2B_API_KEY) {
    return false;
  }

  try {
    // Use Sandbox.list() as a lightweight health probe with timeout
    const result = await Promise.race([
      Sandbox.list({ apiKey: env.E2B_API_KEY }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('E2B health check timeout')), HEALTH_CHECK_TIMEOUT_MS),
      ),
    ]);

    return true;
  } catch (error) {
    logger.warn(`E2B health check failed:`, error);
    return false;
  }
}

export const e2bHealthService = {
  /**
   * Start periodic health checks.
   * Should be called once at server startup.
   */
  start(): void {
    if (healthCheckTimer) return;

    logger.info('E2B health check service started');

    healthCheckTimer = setInterval(async () => {
      const healthy = await checkHealth();
      healthCheckCount++;

      // Periodically clean up orphaned sandboxes (~every 10min)
      if (healthCheckCount % ORPHAN_CLEANUP_INTERVAL === 0) {
        sandboxService.cleanupOrphanedSandboxes().catch((e) =>
          logger.error('Orphan sandbox cleanup failed:', e),
        );
      }

      if (healthy) {
        if (consecutiveFailures > 0) {
          logger.info(`E2B health recovered after ${consecutiveFailures} failures`);
        }
        consecutiveFailures = 0;
        sandboxService.setE2bUnavailable(false);
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_DEGRADED) {
          sandboxService.setE2bUnavailable(true);
          logger.error(`E2B platform marked unavailable after ${consecutiveFailures} consecutive failures`);
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  },

  /**
   * Stop health checks (for graceful shutdown).
   */
  stop(): void {
    if (healthCheckTimer) {
      clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  },

  /** Get current failure count (for monitoring). */
  getConsecutiveFailures(): number {
    return consecutiveFailures;
  },
};
