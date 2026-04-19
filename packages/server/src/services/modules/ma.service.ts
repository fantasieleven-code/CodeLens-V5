/**
 * Module A (MA) submission persistence — Task 26 / Cluster C-MA.
 *
 * Writes V5ModuleASubmission under session.metadata.moduleA so the 10 MA
 * signals (sArgumentResilience / sContextQuality / sCriticalThinking /
 * sDiagnosisAccuracy / sPrincipleAbstraction / sReasoningDepth /
 * sSchemeJudgment TJ ×7, plus sCodeReviewQuality / sHiddenBugFound /
 * sReviewPrioritization CQ ×3) can read non-null at scoring time.
 * Other top-level metadata keys (mb / phase0 / selfAssess / moduleC /
 * fileSnapshot / etc.) stay intact via spread-merge.
 *
 * Strict field pick (Task 23/24/25 pattern continuation): explicitly
 * destructure the V5ModuleASubmission rounds rather than spreading the
 * entire submission. The shape today is fixed (round1 + round2 + round3 +
 * round4) but explicit picking is the cheap defense for future schema
 * widening — if V5ModuleASubmission later gains a sibling pipeline (e.g.
 * a behavior-batch-style telemetry channel), this writer won't silently
 * start ingesting it.
 *
 * round4 was added per Round 3 Part 3 调整 2 (see
 * `ModuleAPage.test.tsx:313-314` and `v5-submissions.ts:84-89`); the live
 * shape diverges from the original 3-round design doc. round4 is
 * required, not optional.
 *
 * Top-level namespace `metadata.moduleA` (not `metadata.submissions.moduleA`)
 * matches the Task 22/23/24/25 convention. The pre-Task 22 D-2 namespace
 * `metadata.submissions.moduleA.*` is only referenced by archived V4
 * `mc-probe-engine.ts`; Task 15 Admin API hydration must read from the
 * top-level path written here.
 */

import type { Prisma } from '@prisma/client';
import type { V5ModuleASubmission } from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

async function readSessionMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) {
    logger.warn('[ma] session not found', { sessionId });
    return null;
  }
  return (session.metadata ?? {}) as Record<string, unknown>;
}

export async function persistModuleASubmission(
  sessionId: string,
  submission: V5ModuleASubmission,
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;

  const { round1, round2, round3, round4 } = submission;
  const persistable: V5ModuleASubmission = {
    round1: {
      schemeId: round1.schemeId,
      reasoning: round1.reasoning,
      structuredForm: round1.structuredForm,
      challengeResponse: round1.challengeResponse,
    },
    round2: {
      markedDefects: round2.markedDefects,
      ...(round2.inputBehavior !== undefined ? { inputBehavior: round2.inputBehavior } : {}),
    },
    round3: {
      correctVersionChoice: round3.correctVersionChoice,
      diffAnalysis: round3.diffAnalysis,
      diagnosisText: round3.diagnosisText,
    },
    round4: {
      response: round4.response,
      submittedAt: round4.submittedAt,
      timeSpentSec: round4.timeSpentSec,
    },
  };

  const currentModuleA = (meta.moduleA ?? {}) as Record<string, unknown>;
  const nextModuleA = { ...currentModuleA, ...persistable };

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      metadata: { ...meta, moduleA: nextModuleA } as unknown as Prisma.InputJsonValue,
    },
  });
}
