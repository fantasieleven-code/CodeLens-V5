/**
 * Module D (MD) submission persistence — Task 27 / Cluster C-MD (final cluster).
 *
 * Writes V5ModuleDSubmission under session.metadata.moduleD so the 4 MD
 * signals (sAiOrchestrationQuality AE, sConstraintIdentification /
 * sDesignDecomposition / sTradeoffArticulation SD ×3) can read non-null at
 * scoring time. Other top-level metadata keys (mb / phase0 / selfAssess /
 * moduleA / moduleC / fileSnapshot / etc.) stay intact via spread-merge.
 *
 * Strict field pick (Task 23/24/25/26 lineage continuation): explicitly
 * destructure the V5ModuleDSubmission's 6 fields rather than spreading the
 * entire submission. The shape today is fixed but explicit picking is the
 * cheap defense for future schema widening — if V5ModuleDSubmission later
 * gains the design-doc-mentioned `challengeResponse` / `designRevision`
 * fields, this writer won't silently start ingesting them without a deliberate
 * extension.
 *
 * Live shape (Phase 1 D3): 6 required fields. The design doc mentions
 * `challengeResponse` and `designRevision` but those never shipped; Task 27
 * mirrors the live shape, not the doc (Pattern D-2 lineage from Task 26's
 * round4 precedent). When/if the doc fields land, add them here as siblings.
 *
 * Top-level namespace `metadata.moduleD` (not `metadata.submissions.moduleD`)
 * matches the Task 22-26 convention. The pre-Task 22 D-2 namespace
 * `metadata.submissions.moduleD.*` is only referenced by archived V4
 * `mc-probe-engine.ts`; Task 15 Admin API hydration must read from the
 * top-level path written here.
 */

import type { Prisma } from '@prisma/client';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

async function readSessionMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) {
    logger.warn('[md] session not found', { sessionId });
    return null;
  }
  return (session.metadata ?? {}) as Record<string, unknown>;
}

export async function persistModuleDSubmission(
  sessionId: string,
  submission: V5ModuleDSubmission,
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;

  const {
    subModules,
    interfaceDefinitions,
    dataFlowDescription,
    constraintsSelected,
    tradeoffText,
    aiOrchestrationPrompts,
  } = submission;

  const persistable: V5ModuleDSubmission = {
    subModules: subModules.map((sm) => ({
      name: sm.name,
      responsibility: sm.responsibility,
      ...(sm.interfaces !== undefined ? { interfaces: sm.interfaces } : {}),
    })),
    interfaceDefinitions,
    dataFlowDescription,
    constraintsSelected,
    tradeoffText,
    aiOrchestrationPrompts,
  };

  const currentModuleD = (meta.moduleD ?? {}) as Record<string, unknown>;
  const nextModuleD = { ...currentModuleD, ...persistable };

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      metadata: { ...meta, moduleD: nextModuleD } as unknown as Prisma.InputJsonValue,
    },
  });
}
