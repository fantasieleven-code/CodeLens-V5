/**
 * FileSnapshotService — in-memory file state for Cursor-mode MB.
 *
 * Tracks the latest content and mutation history for every file a candidate
 * edits during a session. Backed by `Session.metadata.fileSnapshot` so we can
 * restore state after a server restart.
 *
 * Source tag semantics:
 *   manual_edit     — candidate typed in the Monaco editor
 *   ai_chat         — AI Chat panel applied a patch
 *   ai_completion   — Inline Completion accepted suggestion
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';
import type { FileEntry } from './sandbox/sandbox-provider.js';

export type ChangeSource = 'manual_edit' | 'ai_chat' | 'ai_completion';

export interface ChangeEntry {
  content: string;
  source: ChangeSource;
  timestamp: string;
}

interface FileState {
  current: string;
  history: ChangeEntry[];
}

type SessionFiles = Map<string, FileState>;

class FileSnapshotServiceImpl {
  private snapshots = new Map<string, SessionFiles>();

  setFileContent(
    sessionId: string,
    filePath: string,
    content: string,
    source: ChangeSource,
  ): void {
    let session = this.snapshots.get(sessionId);
    if (!session) {
      session = new Map();
      this.snapshots.set(sessionId, session);
    }
    const entry: ChangeEntry = { content, source, timestamp: new Date().toISOString() };
    const existing = session.get(filePath);
    if (existing) {
      existing.current = content;
      existing.history.push(entry);
    } else {
      session.set(filePath, { current: content, history: [entry] });
    }
  }

  getSnapshot(sessionId: string): FileEntry[] {
    const session = this.snapshots.get(sessionId);
    if (!session) return [];
    return [...session.entries()].map(([path, state]) => ({ path, content: state.current }));
  }

  getFileHistory(sessionId: string, filePath: string): ChangeEntry[] {
    return this.snapshots.get(sessionId)?.get(filePath)?.history.slice() ?? [];
  }

  clear(sessionId: string): void {
    this.snapshots.delete(sessionId);
  }

  /** Persist the in-memory snapshot into Session.metadata.fileSnapshot. */
  async persistToMetadata(sessionId: string): Promise<void> {
    const session = this.snapshots.get(sessionId);
    if (!session) return;
    const fileSnapshot: Record<string, FileState> = {};
    for (const [path, state] of session.entries()) {
      fileSnapshot[path] = { current: state.current, history: state.history.slice() };
    }
    const existing = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    const currentMeta =
      (existing?.metadata as Record<string, unknown> | null | undefined) ?? {};
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        metadata: { ...currentMeta, fileSnapshot } as unknown as Prisma.InputJsonValue,
      },
    });
    logger.debug(`[file-snapshot] persisted ${session.size} file(s) for ${sessionId}`);
  }

  /** Rehydrate from Session.metadata.fileSnapshot. */
  restoreFromMetadata(sessionId: string, metadata: Record<string, unknown> | null): void {
    const snapshot = metadata?.fileSnapshot as Record<string, FileState> | undefined;
    if (!snapshot) return;
    const session: SessionFiles = new Map();
    for (const [path, state] of Object.entries(snapshot)) {
      session.set(path, { current: state.current, history: state.history?.slice() ?? [] });
    }
    this.snapshots.set(sessionId, session);
    logger.debug(`[file-snapshot] restored ${session.size} file(s) for ${sessionId}`);
  }

  /** Test seam. */
  __resetAllForTests(): void {
    this.snapshots.clear();
  }
}

export const fileSnapshotService = new FileSnapshotServiceImpl();
export type FileSnapshotService = FileSnapshotServiceImpl;
