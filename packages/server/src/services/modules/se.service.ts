/**
 * SelfAssess (SE) submission persistence — Task 24 / Cluster D.
 *
 * Writes V5SelfAssessSubmission under session.metadata.selfAssess so
 * sMetaCognition (the only SE signal, METACOGNITION dimension) can read
 * non-null at scoring time. Other top-level metadata keys (mb / moduleC /
 * fileSnapshot / etc.) stay intact via spread-merge.
 *
 * Strict field pick (Task 23 pattern continuation): we explicitly destructure
 * the V5 fields rather than spreading the entire submission. The SelfAssess
 * shape is small today and has no Task 22/23-style sibling pipeline to
 * clobber, but explicit picking is the cheap defense for future schema
 * widening — if V5SelfAssessSubmission later gains an `editorBehavior`-like
 * sibling, this writer won't silently start ingesting it.
 */

import type { Prisma } from '@prisma/client';
import type { V5SelfAssessSubmission } from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

async function readSessionMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) {
    logger.warn('[se] session not found', { sessionId });
    return null;
  }
  return (session.metadata ?? {}) as Record<string, unknown>;
}

export async function persistSelfAssess(
  sessionId: string,
  submission: V5SelfAssessSubmission,
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;

  const { confidence, reasoning, reviewedDecisions } = submission;
  const persistable: V5SelfAssessSubmission = {
    confidence,
    reasoning,
    ...(reviewedDecisions !== undefined ? { reviewedDecisions } : {}),
  };

  const currentSelfAssess = (meta.selfAssess ?? {}) as Record<string, unknown>;
  const nextSelfAssess = { ...currentSelfAssess, ...persistable };

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      metadata: { ...meta, selfAssess: nextSelfAssess } as unknown as Prisma.InputJsonValue,
    },
  });
}
