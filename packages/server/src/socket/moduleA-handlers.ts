/**
 * Module A (MA) socket handler — Task 26 / Cluster C-MA.
 *
 * Closes the ModuleAPage → server persist gap. The Task 9 client persists
 * locally via setModuleSubmissionLocal (`ModuleAPage.tsx:174-222`) but never
 * round-trips to the server, so all 10 MA signals (TJ ×7 + CQ ×3) score
 * null at the orchestrator. This handler accepts the V5ModuleASubmission
 * shape directly (no V4 bridge — Phase 1 Q6(a) confirmed) and writes
 * `metadata.moduleA.*`.
 *
 * Naming `moduleA:submit` (lowercase-hyphen) matches `phase0:submit`
 * (Task 25) and `self-assess:submit` (Task 24); see ws.ts client→server
 * declaration for the rationale (no `v5:` prefix because there is a single
 * event, not a per-module multi-event namespace).
 *
 * Zod 4-round nested schema: validates round1 (schemeId enum A/B/C +
 * structuredForm + required challengeResponse), round2 (markedDefects
 * with commentType enum `bug|suggestion|question|nit` — `style` is V5.2+
 * scope, NOT in V5.0 enum), round3 (correctVersionChoice enum +
 * required diff/diagnosis), round4 (response + submittedAt + timeSpentSec
 * — added Round 3 Part 3 调整 2, see `v5-submissions.ts:84-89`).
 *
 * Ack contract: `(ok: boolean) => void`. `ok=false` is reserved for explicit
 * server failures (validation, persist throw); the client treats absence /
 * timeout as recoverable and falls back to local-only persist.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { V5ModuleASubmission } from '@codelens-v5/shared';
import { V5Event } from '@codelens-v5/shared';
import { z } from 'zod';

import { logger } from '../lib/logger.js';
import { eventBus } from '../services/event-bus.service.js';
import { persistModuleASubmission } from '../services/modules/ma.service.js';

const round1Schema = z.object({
  schemeId: z.enum(['A', 'B', 'C']),
  reasoning: z.string(),
  structuredForm: z.object({
    scenario: z.string(),
    tradeoff: z.string(),
    decision: z.string(),
    verification: z.string(),
  }),
  challengeResponse: z.string(),
});

const markedDefectSchema = z.object({
  defectId: z.string(),
  line: z.number().optional(),
  commentType: z.enum(['bug', 'suggestion', 'question', 'nit']),
  comment: z.string(),
  fixSuggestion: z.string().optional(),
});

const round2Schema = z.object({
  markedDefects: z.array(markedDefectSchema),
  inputBehavior: z.record(z.unknown()).optional(),
});

const round3Schema = z.object({
  correctVersionChoice: z.enum(['success', 'failed']),
  diffAnalysis: z.string(),
  diagnosisText: z.string(),
});

const round4Schema = z.object({
  response: z.string(),
  submittedAt: z.number(),
  timeSpentSec: z.number(),
});

const submissionSchema = z.object({
  round1: round1Schema,
  round2: round2Schema,
  round3: round3Schema,
  round4: round4Schema,
});

const payloadSchema = z.object({
  sessionId: z.string().min(1),
  submission: submissionSchema,
});

export function registerModuleAHandlers(_io: SocketIOServer, socket: Socket): void {
  socket.on('moduleA:submit', async (raw: unknown, ack?: (ok: boolean) => void) => {
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn('[socket:ma] moduleA:submit schema invalid', {
        socketId: socket.id,
        error: parsed.error.message,
      });
      ack?.(false);
      return;
    }
    const { sessionId, submission } = parsed.data;
    try {
      await persistModuleASubmission(sessionId, submission as V5ModuleASubmission);
      await eventBus.emit(V5Event.MODULE_SUBMITTED, {
        sessionId,
        module: 'moduleA',
      });
      ack?.(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('[socket:ma] moduleA:submit failed', {
        socketId: socket.id,
        sessionId,
        error: message,
      });
      ack?.(false);
    }
  });
}
