/**
 * Prompt Registry (V5).
 *
 * Versioned prompt store backed by Prisma `PromptVersion`. All callers resolve
 * prompts by key + optional version; the latest active version is returned
 * when the version is omitted. A 5-minute in-memory cache shields Prisma from
 * hot-path re-reads (generator / probe loops).
 *
 * Seeded keys live in {@link ./prompt-keys.ts}. Content is populated by the
 * seed (v1 placeholders) and by Task 9/10/11/14 when real prompts land.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  content: string;
  cachedAt: number;
}

export interface PromptVersionSummary {
  id: string;
  key: string;
  version: number;
  isActive: boolean;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export interface RegisterOptions {
  /** If true, deactivate other versions and mark the new one active. Default false. */
  activate?: boolean;
  metadata?: Record<string, unknown>;
}

export class PromptNotFoundError extends Error {
  constructor(key: string, version?: number) {
    super(
      version === undefined
        ? `No active prompt registered for key "${key}"`
        : `Prompt "${key}" v${version} not found`,
    );
    this.name = 'PromptNotFoundError';
  }
}

function cacheKey(key: string, version?: number): string {
  return version === undefined ? `active:${key}` : `v:${key}:${version}`;
}

export class PromptRegistry {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? CACHE_TTL_MS;
  }

  /**
   * Fetch a prompt by key. With no version, returns the currently active
   * version; with a version, returns that exact version. Throws
   * {@link PromptNotFoundError} when nothing matches.
   */
  async get(key: string, version?: number): Promise<string> {
    const ck = cacheKey(key, version);
    const hit = this.cache.get(ck);
    if (hit && Date.now() - hit.cachedAt < this.ttlMs) {
      return hit.content;
    }

    const row =
      version === undefined
        ? await prisma.promptVersion.findFirst({
            where: { name: key, isActive: true },
            orderBy: { version: 'desc' },
          })
        : await prisma.promptVersion.findUnique({
            where: { name_version: { name: key, version } },
          });

    if (!row) {
      throw new PromptNotFoundError(key, version);
    }

    this.cache.set(ck, { content: row.content, cachedAt: Date.now() });
    return row.content;
  }

  /**
   * Register a new version for a key. Version number auto-increments from the
   * latest existing row. When `activate` is true the new version becomes the
   * sole active one and caches for the key are invalidated.
   */
  async register(key: string, content: string, options: RegisterOptions = {}): Promise<PromptVersionSummary> {
    const { activate = false, metadata } = options;

    const latest = await prisma.promptVersion.findFirst({
      where: { name: key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    if (activate) {
      await prisma.promptVersion.updateMany({
        where: { name: key, isActive: true },
        data: { isActive: false },
      });
    }

    const created = await prisma.promptVersion.create({
      data: {
        name: key,
        version: nextVersion,
        content,
        isActive: activate,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    this.invalidate(key);
    logger.info(`[prompt-registry] registered ${key} v${nextVersion}${activate ? ' (active)' : ''}`);

    return this.toSummary(created);
  }

  /** List all versions for a key, newest first. */
  async list(key: string): Promise<PromptVersionSummary[]> {
    const rows = await prisma.promptVersion.findMany({
      where: { name: key },
      orderBy: { version: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  /**
   * Mark the given version active (and deactivate any other active version
   * for the same key). Throws when the version does not exist.
   */
  async setActive(key: string, version: number): Promise<void> {
    const existing = await prisma.promptVersion.findUnique({
      where: { name_version: { name: key, version } },
      select: { id: true },
    });
    if (!existing) {
      throw new PromptNotFoundError(key, version);
    }

    await prisma.promptVersion.updateMany({
      where: { name: key, isActive: true },
      data: { isActive: false },
    });
    await prisma.promptVersion.update({
      where: { name_version: { name: key, version } },
      data: { isActive: true },
    });

    this.invalidate(key);
    logger.info(`[prompt-registry] activated ${key} v${version}`);
  }

  /** Drop cache entries for a single key. */
  invalidate(key: string): void {
    const prefix1 = `active:${key}`;
    const prefix2 = `v:${key}:`;
    for (const k of this.cache.keys()) {
      if (k === prefix1 || k.startsWith(prefix2)) {
        this.cache.delete(k);
      }
    }
  }

  /** Drop the entire cache (tests, admin endpoints). */
  clearCache(): void {
    this.cache.clear();
  }

  private toSummary(row: {
    id: string;
    name: string;
    version: number;
    isActive: boolean;
    createdAt: Date;
    metadata: unknown;
  }): PromptVersionSummary {
    return {
      id: row.id,
      key: row.name,
      version: row.version,
      isActive: row.isActive,
      createdAt: row.createdAt,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
    };
  }
}

export const promptRegistry = new PromptRegistry();
