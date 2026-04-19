/**
 * Phase 0 (P0) submission persistence — Task 25 / Cluster C-P0.
 *
 * Writes V5Phase0Submission under session.metadata.phase0 so the 5 P0 signals
 * (sBaselineReading TJ, sTechProfile / sDecisionStyle / sAiCalibration
 * METACOGNITION, sAiClaimDetection TJ) can read non-null at scoring time.
 * Other top-level metadata keys (mb / moduleC / selfAssess / fileSnapshot /
 * etc.) stay intact via spread-merge.
 *
 * Strict field pick (Task 23/24 pattern continuation): explicitly destructure
 * the V5Phase0Submission fields rather than spreading the entire submission.
 * The shape is fixed today (codeReading + aiOutputJudgment + aiClaimVerification
 * + decision + optional inputBehavior) and has no Task 22-style sibling
 * pipeline to clobber, but explicit picking is the cheap defense for future
 * schema widening — if V5Phase0Submission later gains a behavior-batch-style
 * sibling, this writer won't silently start ingesting it.
 *
 * Top-level namespace `metadata.phase0` (not `metadata.submissions.phase0`)
 * matches the Task 22/23/24 convention. SessionService's
 * `metadata.submissions.{key}` shape from Task 6 is superseded for these
 * write paths; the live signals all read from top-level.
 */

import type { Prisma } from '@prisma/client';
import type { V5Phase0Submission } from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

async function readSessionMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) {
    logger.warn('[p0] session not found', { sessionId });
    return null;
  }
  return (session.metadata ?? {}) as Record<string, unknown>;
}

export async function persistPhase0Submission(
  sessionId: string,
  submission: V5Phase0Submission,
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;

  const { codeReading, aiOutputJudgment, aiClaimVerification, decision, inputBehavior } = submission;
  const persistable: V5Phase0Submission = {
    codeReading,
    aiOutputJudgment,
    aiClaimVerification,
    decision,
    ...(inputBehavior !== undefined ? { inputBehavior } : {}),
  };

  const currentPhase0 = (meta.phase0 ?? {}) as Record<string, unknown>;
  const nextPhase0 = { ...currentPhase0, ...persistable };

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      metadata: { ...meta, phase0: nextPhase0 } as unknown as Prisma.InputJsonValue,
    },
  });
}
