/**
 * MB (Cursor mode) submissions persistence.
 *
 * Writes planning / standards / audit slices under session.metadata.mb, matching
 * V5Submissions.mb in `@codelens-v5/shared`. Other metadata keys (moduleC /
 * moduleA / signalResults / fileSnapshot) stay intact via spread-merge.
 *
 * appendVisibilityEvent tracks Round 2 Part 3 调整 4 tab visibility transitions
 * (v5-design-clarifications.md L550-588) into editorBehavior.documentVisibilityEvents
 * so backend can later compute visible-time slices for sDecisionLatencyQuality.
 *
 * appendAiCompletionEvents (Task 22 / Cluster A) ingests behavior:batch-derived
 * inline-completion records into editorBehavior.aiCompletionEvents so
 * sDecisionLatencyQuality + sAiCompletionAcceptRate (and partial reads from
 * sBlockSelectivity / sChatVsDirectRatio / sModifyQuality / sVerifyDiscipline)
 * can move from null → score.
 */

import type { Prisma } from '@prisma/client';
import type { V5MBAudit, V5MBEditorBehavior, V5MBPlanning, V5MBStandards } from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

export type AiCompletionEvent = V5MBEditorBehavior['aiCompletionEvents'][number];

type MBSlice = {
  planning?: V5MBPlanning;
  standards?: V5MBStandards;
  audit?: V5MBAudit;
};

async function readSessionMeta(sessionId: string): Promise<Record<string, unknown> | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { metadata: true },
  });
  if (!session) {
    logger.warn('[mb] session not found', { sessionId });
    return null;
  }
  return (session.metadata ?? {}) as Record<string, unknown>;
}

async function writeMbSlice(sessionId: string, slice: MBSlice): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const nextMb = { ...currentMb, ...slice };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

export async function persistPlanning(sessionId: string, payload: V5MBPlanning): Promise<void> {
  await writeMbSlice(sessionId, { planning: payload });
}

export async function persistStandards(sessionId: string, payload: V5MBStandards): Promise<void> {
  await writeMbSlice(sessionId, { standards: payload });
}

export async function persistAudit(sessionId: string, payload: V5MBAudit): Promise<void> {
  await writeMbSlice(sessionId, { audit: payload });
}

/**
 * Append a single `{ timestamp, hidden }` transition to
 * metadata.mb.editorBehavior.documentVisibilityEvents. Low-frequency event
 * (user tab hide/show), so per-event DB write is acceptable.
 */
export async function appendVisibilityEvent(
  sessionId: string,
  event: { timestamp: number; hidden: boolean },
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const currentEvents = Array.isArray(currentBehavior.documentVisibilityEvents)
    ? (currentBehavior.documentVisibilityEvents as Array<{ timestamp: number; hidden: boolean }>)
    : [];
  const nextBehavior = {
    ...currentBehavior,
    documentVisibilityEvents: [...currentEvents, event],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Append behavior:batch-derived inline completion events into
 * metadata.mb.editorBehavior.aiCompletionEvents. Dedups against
 * existing entries by (lineNumber, shownAt, respondedAt) tuple so socket
 * reconnect / re-flush doesn't double-count the same user interaction.
 *
 * Empty input → no DB write (cheap idempotent no-op).
 */
export async function appendAiCompletionEvents(
  sessionId: string,
  events: AiCompletionEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const currentEvents: AiCompletionEvent[] = Array.isArray(currentBehavior.aiCompletionEvents)
    ? (currentBehavior.aiCompletionEvents as AiCompletionEvent[])
    : [];
  const seen = new Set(currentEvents.map(dedupKey));
  const additions = events.filter((e) => {
    const k = dedupKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (additions.length === 0) return;
  const nextBehavior = {
    ...currentBehavior,
    aiCompletionEvents: [...currentEvents, ...additions],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

function dedupKey(e: AiCompletionEvent): string {
  return `${e.lineNumber}|${e.shownAt ?? 'x'}|${e.respondedAt ?? 'x'}`;
}

/** Parse pytest "N passed, M failed" summary. Returns passed/(passed+failed) in [0,1]. */
export function calculatePassRate(stdout: string): number {
  const match = stdout.match(/(\d+)\s+passed(?:,\s*(\d+)\s+failed)?/i);
  if (!match) return 0;
  const passed = Number.parseInt(match[1], 10);
  const failed = match[2] ? Number.parseInt(match[2], 10) : 0;
  const total = passed + failed;
  return total === 0 ? 0 : passed / total;
}
