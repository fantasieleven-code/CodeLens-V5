/**
 * SandboxFactory — resolves the current SandboxProvider with 3-tier fallback.
 *
 * Health probe results are cached for 5 minutes to avoid hammering E2B/Docker
 * on every create() call. Tests can override the providers via setProviders()
 * and clear the cache with resetCache().
 *
 * Tier order (Round 2 Part 4 adj 3): E2B → Docker → Static.
 */

import { logger } from '../../lib/logger.js';
import { DockerSandboxProvider } from './docker-provider.js';
import { E2BSandboxProvider } from './e2b-provider.js';
import { type ProviderKind, type SandboxProvider } from './sandbox-provider.js';
import { StaticCheckProvider } from './static-provider.js';

const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;

interface HealthEntry {
  ok: boolean;
  checkedAt: number;
}

export class SandboxFactory {
  private providers: readonly SandboxProvider[];
  private healthCache = new Map<ProviderKind, HealthEntry>();
  /** Operator override: when true, skip E2B probes and fall straight to Docker / Static. */
  private e2bForceUnhealthy = false;

  constructor(providers?: readonly SandboxProvider[]) {
    this.providers = providers ?? [
      new E2BSandboxProvider(),
      new DockerSandboxProvider(),
      new StaticCheckProvider(),
    ];
  }

  /** Walk the provider list in order and return the first healthy one. */
  async getProvider(): Promise<SandboxProvider> {
    for (const p of this.providers) {
      if (p.kind === 'e2b' && this.e2bForceUnhealthy) continue;
      const healthy = await this.checkHealth(p);
      if (healthy) {
        return p;
      }
    }
    // Should never happen — StaticCheckProvider.isAvailable() returns true.
    throw new Error('No sandbox provider available (static fallback failed)');
  }

  /** True iff current provider is NOT E2B (i.e. we're in a degraded tier). */
  async isDegraded(): Promise<boolean> {
    const p = await this.getProvider();
    return p.kind !== 'e2b';
  }

  /**
   * Explicitly mark E2B as healthy/unhealthy. Used by the periodic health check
   * worker (formerly e2b-health.service.ts) to push observed state into the
   * cache without waiting for the next create() call.
   */
  setE2bHealthy(healthy: boolean): void {
    this.e2bForceUnhealthy = !healthy;
    this.healthCache.set('e2b', { ok: healthy, checkedAt: Date.now() });
  }

  getHealthReport(): Record<ProviderKind, { ok: boolean; ageMs: number } | 'unknown'> {
    const now = Date.now();
    const report: Partial<Record<ProviderKind, { ok: boolean; ageMs: number } | 'unknown'>> = {};
    for (const p of this.providers) {
      const entry = this.healthCache.get(p.kind);
      report[p.kind] = entry ? { ok: entry.ok, ageMs: now - entry.checkedAt } : 'unknown';
    }
    return report as Record<ProviderKind, { ok: boolean; ageMs: number } | 'unknown'>;
  }

  /** Test seam: replace the provider list (e.g. with mocks). */
  setProviders(providers: readonly SandboxProvider[]): void {
    this.providers = providers;
    this.healthCache.clear();
    this.e2bForceUnhealthy = false;
  }

  resetCache(): void {
    this.healthCache.clear();
    this.e2bForceUnhealthy = false;
  }

  private async checkHealth(provider: SandboxProvider): Promise<boolean> {
    const now = Date.now();
    const cached = this.healthCache.get(provider.kind);
    if (cached && now - cached.checkedAt < HEALTH_CACHE_TTL_MS) {
      return cached.ok;
    }
    const ok = await provider.isAvailable().catch((err) => {
      logger.warn(`[sandbox:factory] ${provider.kind} probe threw:`, err);
      return false;
    });
    this.healthCache.set(provider.kind, { ok, checkedAt: now });
    if (!ok) {
      logger.warn(`[sandbox:factory] ${provider.kind} unavailable, falling back`);
    }
    return ok;
  }
}

export const sandboxFactory = new SandboxFactory();
