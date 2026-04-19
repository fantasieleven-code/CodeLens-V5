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
import type {
  V5MBAudit,
  V5MBEditorBehavior,
  V5MBFinalFile,
  V5MBPlanning,
  V5MBStandards,
  V5MBSubmission,
} from '@codelens-v5/shared';

import { prisma } from '../../config/db.js';
import { logger } from '../../lib/logger.js';

export type AiCompletionEvent = V5MBEditorBehavior['aiCompletionEvents'][number];
export type TestRunEvent = V5MBEditorBehavior['testRuns'][number];
export type ChatEvent = V5MBEditorBehavior['chatEvents'][number];
export type DiffEvent = V5MBEditorBehavior['diffEvents'][number];
export type FileNavEvent = V5MBEditorBehavior['fileNavigationHistory'][number];
export type EditSessionEvent = V5MBEditorBehavior['editSessions'][number];

type MBSlice = {
  planning?: V5MBPlanning;
  standards?: V5MBStandards;
  audit?: V5MBAudit;
  finalFiles?: V5MBFinalFile[];
  finalTestPassRate?: number;
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

/**
 * Task 23 — persist a single test run.
 *
 * Cluster B unblock: writes `metadata.mb.finalTestPassRate` (latest run, used
 * by sIterationEfficiency + sChallengeComplete) AND appends to
 * `editorBehavior.testRuns[]` (run-count factor in both signals). Spread-merge
 * preserves all other editorBehavior keys (Task 22 aiCompletionEvents,
 * documentVisibilityEvents, etc).
 */
export async function persistFinalTestRun(
  sessionId: string,
  opts: { passRate: number; duration: number; timestamp?: number },
): Promise<void> {
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const currentRuns: TestRunEvent[] = Array.isArray(currentBehavior.testRuns)
    ? (currentBehavior.testRuns as TestRunEvent[])
    : [];
  const nextRun: TestRunEvent = {
    timestamp: opts.timestamp ?? Date.now(),
    passRate: opts.passRate,
    duration: opts.duration,
  };
  const nextBehavior = { ...currentBehavior, testRuns: [...currentRuns, nextRun] };
  const nextMb = {
    ...currentMb,
    editorBehavior: nextBehavior,
    finalTestPassRate: opts.passRate,
  };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Task 23 — persist V5MBSubmission, EXCLUDING editorBehavior.
 *
 * Pattern H v2.2 cross-Task regression defense: ModuleBPage.tsx builds the
 * submission with hardcoded EMPTY editorBehavior arrays (intentional — that
 * pipeline is owned by `behavior:batch` / Task 22). Spreading the full
 * submission into `metadata.mb` would silently clobber Task 22's persisted
 * aiCompletionEvents / documentVisibilityEvents / testRuns. We destructure
 * editorBehavior + agentExecutions + rounds out and merge only the closer
 * fields (planning, standards, audit, finalFiles, finalTestPassRate).
 *
 * `agentExecutions` is V5.2 reserved (per type comment) and `rounds` is V4
 * legacy — neither is in scope for V5.0 persist.
 */
export async function persistMbSubmission(
  sessionId: string,
  submission: V5MBSubmission,
): Promise<void> {
  const {
    editorBehavior: _editorBehavior,
    agentExecutions: _agentExecutions,
    rounds: _rounds,
    ...persistable
  } = submission;
  void _editorBehavior;
  void _agentExecutions;
  void _rounds;
  await writeMbSlice(sessionId, persistable);
}

/**
 * Task 30a — append chat events into editorBehavior.chatEvents.
 * Dedup by (timestamp, prompt prefix) so socket reconnect / re-flush doesn't
 * double-count. Spread-merge preserves all sibling editorBehavior keys
 * (Task 22 aiCompletionEvents, Task 23 testRuns, etc.).
 */
export async function appendChatEvents(
  sessionId: string,
  events: ChatEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const existing: ChatEvent[] = Array.isArray(currentBehavior.chatEvents)
    ? (currentBehavior.chatEvents as ChatEvent[])
    : [];
  const seen = new Set(existing.map(chatKey));
  const additions = events.filter((e) => {
    const k = chatKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (additions.length === 0) return;
  const nextBehavior = {
    ...currentBehavior,
    chatEvents: [...existing, ...additions],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

function chatKey(e: ChatEvent): string {
  return `${e.timestamp}|${(e.prompt ?? '').slice(0, 32)}`;
}

/**
 * Task 30a — append diff events into editorBehavior.diffEvents.
 * Dedup by (timestamp, accepted, linesAdded, linesRemoved).
 */
export async function appendDiffEvents(
  sessionId: string,
  events: DiffEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const existing: DiffEvent[] = Array.isArray(currentBehavior.diffEvents)
    ? (currentBehavior.diffEvents as DiffEvent[])
    : [];
  const seen = new Set(existing.map(diffKey));
  const additions = events.filter((e) => {
    const k = diffKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (additions.length === 0) return;
  const nextBehavior = {
    ...currentBehavior,
    diffEvents: [...existing, ...additions],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

function diffKey(e: DiffEvent): string {
  return `${e.timestamp}|${e.accepted}|${e.linesAdded}|${e.linesRemoved}`;
}

/**
 * Task 30a — append file-navigation events into
 * editorBehavior.fileNavigationHistory. Dedup by (timestamp, filePath, action).
 */
export async function appendFileNavigation(
  sessionId: string,
  events: FileNavEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const existing: FileNavEvent[] = Array.isArray(currentBehavior.fileNavigationHistory)
    ? (currentBehavior.fileNavigationHistory as FileNavEvent[])
    : [];
  const seen = new Set(existing.map(fileNavKey));
  const additions = events.filter((e) => {
    const k = fileNavKey(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (additions.length === 0) return;
  const nextBehavior = {
    ...currentBehavior,
    fileNavigationHistory: [...existing, ...additions],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

function fileNavKey(e: FileNavEvent): string {
  return `${e.timestamp}|${e.filePath}|${e.action}`;
}

/**
 * Task 30a — append edit sessions into editorBehavior.editSessions.
 * Dedup by (filePath, startTime, endTime). Task 30b will wire the
 * client-side `edit_session_completed` emit; until then this method is
 * exercised by mocked events in the Pattern H 7th gate integration test.
 */
export async function appendEditSessions(
  sessionId: string,
  sessions: EditSessionEvent[],
): Promise<void> {
  if (sessions.length === 0) return;
  const meta = await readSessionMeta(sessionId);
  if (!meta) return;
  const currentMb = (meta.mb ?? {}) as Record<string, unknown>;
  const currentBehavior = (currentMb.editorBehavior ?? {}) as Record<string, unknown>;
  const existing: EditSessionEvent[] = Array.isArray(currentBehavior.editSessions)
    ? (currentBehavior.editSessions as EditSessionEvent[])
    : [];
  const seen = new Set(existing.map(editSessionKey));
  const additions = sessions.filter((s) => {
    const k = editSessionKey(s);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (additions.length === 0) return;
  const nextBehavior = {
    ...currentBehavior,
    editSessions: [...existing, ...additions],
  };
  const nextMb = { ...currentMb, editorBehavior: nextBehavior };
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: { ...meta, mb: nextMb } as unknown as Prisma.InputJsonValue },
  });
}

function editSessionKey(e: EditSessionEvent): string {
  return `${e.filePath}|${e.startTime}|${e.endTime}`;
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
