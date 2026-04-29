/**
 * MC submission persistence — Brief #19 C1 extraction.
 *
 * Writes Module C round answers under `session.metadata.moduleC`, matching
 * the existing voice-webhook persist path that's been in mc-voice-chat.ts
 * since Task 11. Extracted into a shared service so the new HTTP fallback
 * endpoint (`POST /api/v5/exam/:sessionId/modulec/round/:roundIdx`, Brief
 * #19 C2) and the existing voice webhook (`mc-voice-chat.ts:208`) share
 * one persist implementation.
 *
 * Idempotent · re-submitting the same round filters the existing entry by
 * `round` index and pushes the new payload, so retries / late HTTP
 * fallback after a successful socket emit cannot double-write.
 *
 * Read path · `scoring-hydrator.service.ts` reads `metadata.moduleC` as
 * an array of `V5ModuleCAnswer`-shaped entries. The 5-round MC fixture
 * matrix expects entries in `{ round, question, answer, probeStrategy }`
 * shape, which `saveRoundAnswer` matches exactly.
 */

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';
import type { Prisma } from '@prisma/client';

export async function saveRoundAnswer(
  sessionId: string,
  round: number,
  answer: string,
  emmaQuestion: string,
  strategyKey: string,
): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session) return;

    const meta = (session.metadata || {}) as Record<string, unknown>;
    const existing = Array.isArray(meta.moduleC)
      ? (meta.moduleC as Array<Record<string, unknown>>)
      : [];

    const filtered = existing.filter((r) => r.round !== round);
    filtered.push({
      round,
      question: emmaQuestion,
      answer,
      probeStrategy: strategyKey,
    });

    await prisma.session.update({
      where: { id: sessionId },
      data: { metadata: { ...meta, moduleC: filtered } as unknown as Prisma.InputJsonValue },
    });
  } catch (err) {
    logger.warn('[mc-service] saveRoundAnswer failed:', err);
  }
}
