/**
 * AR-10: Prompt Version Registry
 *
 * Manages versioned prompts in the database with in-memory caching.
 * Falls back to hardcoded constants when no DB version exists.
 */

import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';

// In-memory cache: name → { content, version, cachedAt }
interface CacheEntry {
  content: string;
  version: number;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const promptRegistryService = {
  /**
   * Get the active prompt for a given name.
   * Uses 5-minute in-memory cache. Falls back to provided default if no DB entry.
   */
  async getActivePrompt(name: string, fallback?: string): Promise<{ content: string; version: string }> {
    // Check cache
    const cached = cache.get(name);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return { content: cached.content, version: `${name}:v${cached.version}` };
    }

    // Query DB
    try {
      const prompt = await prisma.promptVersion.findFirst({
        where: { name, isActive: true },
        orderBy: { version: 'desc' },
      });

      if (prompt) {
        cache.set(name, {
          content: prompt.content,
          version: prompt.version,
          cachedAt: Date.now(),
        });
        return { content: prompt.content, version: `${name}:v${prompt.version}` };
      }
    } catch (error) {
      logger.warn(`Failed to fetch prompt "${name}" from DB, using fallback`, error);
    }

    // Fallback to hardcoded
    if (fallback !== undefined) {
      return { content: fallback, version: `${name}:hardcoded` };
    }

    return { content: '', version: `${name}:empty` };
  },

  /**
   * Create a new version of a prompt.
   */
  async createVersion(name: string, content: string, metadata?: Record<string, unknown>): Promise<{ id: string; version: number }> {
    // Get latest version number
    const latest = await prisma.promptVersion.findFirst({
      where: { name },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const newVersion = (latest?.version ?? 0) + 1;

    const created = await prisma.promptVersion.create({
      data: {
        name,
        version: newVersion,
        content,
        isActive: false,
        metadata: (metadata ?? {}) as Record<string, string | number | boolean>,
      },
    });

    logger.info(`Created prompt version: ${name} v${newVersion}`);
    return { id: created.id, version: newVersion };
  },

  /**
   * Activate a specific version (deactivates others for the same name).
   */
  async activateVersion(name: string, version: number): Promise<void> {
    // Deactivate all versions for this name
    await prisma.promptVersion.updateMany({
      where: { name, isActive: true },
      data: { isActive: false },
    });

    // Activate the specified version
    await prisma.promptVersion.update({
      where: { name_version: { name, version } },
      data: { isActive: true },
    });

    // Invalidate cache
    cache.delete(name);
    logger.info(`Activated prompt: ${name} v${version}`);
  },

  /**
   * List all versions for a prompt name.
   */
  async listVersions(name: string) {
    return prisma.promptVersion.findMany({
      where: { name },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        name: true,
        version: true,
        isActive: true,
        createdAt: true,
      },
    });
  },

  /**
   * List all unique prompt names.
   */
  async listNames() {
    const results = await prisma.promptVersion.findMany({
      distinct: ['name'],
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return results.map((r) => r.name);
  },

  /** Clear the in-memory cache (for testing). */
  clearCache(): void {
    cache.clear();
  },
};
