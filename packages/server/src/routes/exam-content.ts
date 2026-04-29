/**
 * Brief #15 · GET /api/v5/exam/:examInstanceId/module/:moduleType
 *
 * Candidate-facing exam-module content endpoint. Resolves canonical
 * MBModuleSpecific (DB-seeded by `seed-canonical-v5-exam.ts`) into the
 * narrower `MBCandidateView` shape — strips groundTruth (`isViolation`,
 * `violationType`, `explanation`) and instructor-only metadata
 * (`knownIssueLines`, `tests`, `harnessReference`) before sending.
 *
 * Closes the V5.0 architectural gap diagnosed in Brief #14 §E E7 — the
 * `ModuleBPage` previously hydrated from `MB_MOCK_FIXTURE` (Python placeholder)
 * because no HTTP layer exposed canonical module content. The data layer
 * (`ExamDataService.getMBData`) and DB seed already existed; this endpoint
 * is the missing wire.
 *
 * Auth · examInstanceId is not a secret (admin createSession returns it in
 * the session metadata, candidate sees it via `GET /api/v5/session/:id`).
 * No further gate — same pattern as the D17 session endpoint.
 *
 * Per-module scope · only `mb` is implemented in Brief #15. Other module
 * types return 501 (Not Implemented) with a clear message · subsequent
 * briefs (P0 / MA / MC / MD / SE Layer 2 swaps) will register their own
 * branches when those swaps land.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { examDataService } from '../services/exam-data.service.js';
import { sessionService, SessionNotFoundError } from '../services/session.service.js';
import { persistPhase0Submission } from '../services/modules/p0.service.js';
import { persistModuleASubmission } from '../services/modules/ma.service.js';
import { persistModuleDSubmission } from '../services/modules/md.service.js';
import {
  persistMbSubmission,
  appendAiCompletionEvents,
  appendChatEvents,
  appendDiffEvents,
  appendFileNavigation,
  appendEditSessions,
  appendVisibilityEvent,
  appendTestRuns,
  persistFinalTestRun,
  type AiCompletionEvent,
  type ChatEvent,
  type DiffEvent,
  type FileNavEvent,
  type EditSessionEvent,
  type TestRunEvent,
} from '../services/modules/mb.service.js';
import { persistSelfAssess } from '../services/modules/se.service.js';
import { saveRoundAnswer } from '../services/modules/mc.service.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import type {
  V5Phase0Submission,
  V5ModuleASubmission,
  V5ModuleDSubmission,
  V5MBSubmission,
  V5SelfAssessSubmission,
} from '@codelens-v5/shared';

const VALID_MODULE_TYPES = new Set(['p0', 'ma', 'mb', 'mc', 'md', 'se']);

export async function getExamModuleContent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { examInstanceId, moduleType } = req.params;
    const normalized = moduleType.toLowerCase();

    if (!VALID_MODULE_TYPES.has(normalized)) {
      throw new ValidationError(
        `Invalid moduleType '${moduleType}' · expected one of p0|ma|mb|mc|md|se`,
      );
    }

    if (normalized !== 'mb') {
      res.status(501).json({
        error: `Module '${normalized}' Layer 2 swap not yet implemented · Brief #15 covers 'mb' only`,
        code: 'NOT_IMPLEMENTED',
      });
      return;
    }

    const data = await examDataService.getMBDataCandidateSafe(examInstanceId);
    if (!data) {
      throw new NotFoundError(
        `MB module not found for examInstance '${examInstanceId}'`,
      );
    }

    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * Brief #18 D38 (σ) · POST /api/v5/exam/:sessionId/complete
 *
 * HTTP fallback for the missing socket `session:end` handler. ModuleCPage
 * `finishAndAdvance` calls this after the final MC round to transition the
 * session to status='COMPLETED', which makes admin.ts:379 lazy-trigger
 * `scoringHydratorService.hydrateAndScore` on the next admin report fetch.
 *
 * Idempotent · `sessionService.endSession` is safe to call repeatedly:
 * each call sets status='COMPLETED' + completedAt=now, no state machine
 * guard blocks re-completion.
 */
export async function completeExamSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    await sessionService.endSession(sessionId);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

/**
 * Brief #19 · 5 σ-pattern HTTP fallback endpoints for module submission
 * persistence. Mirrors Brief #18 D38 σ — the candidate-side socket emits
 * (`phase0:submit` / `moduleA:submit` / `v5:mb:submit` / `self-assess:submit`
 * / `v5:modulec:answer`) silent-drop because `useSocket()` is defined but
 * never called from any component. These endpoints provide a guaranteed
 * persist path until V5.0.1 wires the root socket connection.
 *
 * 404 semantics · sessionService.getSession returns null when the session
 * is missing, surfaced as NotFoundError (handled by errorHandler middleware
 * → 400/404 with code='NOT_FOUND'). Persist functions themselves silently
 * no-op on missing sessions, so the explicit existence check is what
 * differentiates "no such session" from "persisted successfully".
 *
 * 500 semantics · uncaught errors from the persist functions (e.g. Prisma
 * write failure) are forwarded to next() unchanged.
 *
 * All 5 endpoints are idempotent · Brief #19 Phase 1 audit Q2 verified.
 */

async function ensureSessionOrThrow(sessionId: string): Promise<void> {
  const session = await sessionService.getSession(sessionId);
  if (!session) throw new SessionNotFoundError(sessionId);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export async function submitPhase0(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const submission = req.body?.submission as V5Phase0Submission | undefined;
    if (!submission) throw new ValidationError('submission body field required');
    await ensureSessionOrThrow(sessionId);
    await persistPhase0Submission(sessionId, submission);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export async function submitModuleA(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const submission = req.body?.submission as V5ModuleASubmission | undefined;
    if (!submission) throw new ValidationError('submission body field required');
    await ensureSessionOrThrow(sessionId);
    await persistModuleASubmission(sessionId, submission);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export async function submitMb(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const submission = req.body?.submission as V5MBSubmission | undefined;
    if (!submission) throw new ValidationError('submission body field required');
    await ensureSessionOrThrow(sessionId);
    await persistMbSubmission(sessionId, submission);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export async function submitModuleD(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const submission = req.body?.submission as V5ModuleDSubmission | undefined;
    if (!submission) throw new ValidationError('submission body field required');
    await ensureSessionOrThrow(sessionId);
    await persistModuleDSubmission(sessionId, submission);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export async function submitSelfAssess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { selfConfidence, selfIdentifiedRisk, responseTimeMs, reviewedDecisions } =
      req.body ?? {};
    if (typeof selfConfidence !== 'number' || typeof responseTimeMs !== 'number') {
      throw new ValidationError(
        'selfConfidence (number) and responseTimeMs (number) body fields required',
      );
    }
    await ensureSessionOrThrow(sessionId);
    // Match the socket-handler normalization (self-assess-handlers.ts:56-61):
    // selfConfidence is 0..100 percentage; persistSelfAssess wants 0..1 confidence.
    // Brief #20 C2 · accept reviewedDecisions (V5SelfAssessSubmission optional
    // field powering sMetacognition calibration). Only attach when the
    // candidate-side UI actually collected a non-empty array.
    const submission: V5SelfAssessSubmission = {
      confidence: clamp01(selfConfidence / 100),
      reasoning:
        typeof selfIdentifiedRisk === 'string' ? selfIdentifiedRisk : '',
      ...(Array.isArray(reviewedDecisions) &&
      reviewedDecisions.every((s: unknown) => typeof s === 'string')
        ? { reviewedDecisions: reviewedDecisions as string[] }
        : {}),
    };
    await persistSelfAssess(sessionId, submission);
    void responseTimeMs;
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

/**
 * Brief #20 C2 · POST /api/v5/exam/:sessionId/mb/editor-behavior
 *
 * MB editorBehavior bulk submit · driver-side bypass for the e2e suite.
 * ModuleBPage.tsx hardcodes empty editorBehavior arrays at L232-239 and
 * persistMbSubmission STRIPS that field anyway (Pattern H v2.2 — see
 * mb.service.ts:208-215). Real candidate sessions populate these arrays
 * incrementally via socket `behavior:batch`; the e2e driver doesn't replay
 * those events, so this endpoint accepts a fixture-shaped editorBehavior
 * payload and dispatches each non-empty slice to the existing append*
 * functions (which dedup + spread-merge against current metadata.mb.editorBehavior).
 *
 * V5.0.5 housekeeping · once useSocket() is wired (Brief #19 obs#168 entry #5),
 * this endpoint stays as the e2e bypass; production traffic continues over
 * the socket pipeline.
 */
export async function submitMbEditorBehavior(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const eb = req.body ?? {};
    await ensureSessionOrThrow(sessionId);
    if (Array.isArray(eb.aiCompletionEvents) && eb.aiCompletionEvents.length > 0) {
      await appendAiCompletionEvents(sessionId, eb.aiCompletionEvents as AiCompletionEvent[]);
    }
    if (Array.isArray(eb.chatEvents) && eb.chatEvents.length > 0) {
      await appendChatEvents(sessionId, eb.chatEvents as ChatEvent[]);
    }
    if (Array.isArray(eb.diffEvents) && eb.diffEvents.length > 0) {
      await appendDiffEvents(sessionId, eb.diffEvents as DiffEvent[]);
    }
    if (Array.isArray(eb.fileNavigationHistory) && eb.fileNavigationHistory.length > 0) {
      await appendFileNavigation(sessionId, eb.fileNavigationHistory as FileNavEvent[]);
    }
    if (Array.isArray(eb.editSessions) && eb.editSessions.length > 0) {
      await appendEditSessions(sessionId, eb.editSessions as EditSessionEvent[]);
    }
    // Brief #20 sub-cycle · testRuns dispatch · closes the C2/C3 self-
    // introduced regression where this endpoint's body schema accepted
    // testRuns but the dispatcher dropped the array · sVerifyDiscipline
    // flipped sign across fixtures (Liam -0.40 / Steve -0.46 / Max +0.32).
    if (Array.isArray(eb.testRuns) && eb.testRuns.length > 0) {
      await appendTestRuns(sessionId, eb.testRuns as TestRunEvent[]);
    }
    if (Array.isArray(eb.documentVisibilityEvents)) {
      for (const ev of eb.documentVisibilityEvents) {
        if (
          ev &&
          typeof (ev as { timestamp?: unknown }).timestamp === 'number' &&
          typeof (ev as { hidden?: unknown }).hidden === 'boolean'
        ) {
          await appendVisibilityEvent(
            sessionId,
            ev as { timestamp: number; hidden: boolean },
          );
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

/**
 * Brief #20 C2 · POST /api/v5/exam/:sessionId/mb/test-result
 *
 * MB final test run · driver-side bypass. ModuleBPage doesn't currently
 * write metadata.mb.finalTestPassRate (the driver's path-execute / build
 * step doesn't run pytest), so the e2e suite always observes
 * finalTestPassRate=0 in scoring — penalizing sIterationEfficiency +
 * sChallengeComplete. This endpoint reuses persistFinalTestRun (which both
 * appends to editorBehavior.testRuns AND sets finalTestPassRate).
 */
export async function submitMbTestResult(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { passRate, duration, timestamp } = req.body ?? {};
    if (typeof passRate !== 'number' || typeof duration !== 'number') {
      throw new ValidationError(
        'passRate (number) and duration (number) body fields required',
      );
    }
    await ensureSessionOrThrow(sessionId);
    await persistFinalTestRun(sessionId, {
      passRate,
      duration,
      ...(typeof timestamp === 'number' ? { timestamp } : {}),
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export async function submitModuleCRound(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId, roundIdx } = req.params;
    const round = Number.parseInt(roundIdx, 10);
    if (!Number.isInteger(round) || round < 0) {
      throw new ValidationError(`Invalid roundIdx '${roundIdx}' · expected non-negative integer`);
    }
    const { answer, question, probeStrategy } = req.body ?? {};
    if (typeof answer !== 'string' || typeof question !== 'string' || typeof probeStrategy !== 'string') {
      throw new ValidationError(
        'answer (string), question (string), probeStrategy (string) body fields required',
      );
    }
    await ensureSessionOrThrow(sessionId);
    await saveRoundAnswer(sessionId, round, answer, question, probeStrategy);
    res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      next(new NotFoundError(`Session not found: ${req.params.sessionId}`));
      return;
    }
    next(err);
  }
}

export const examContentRouter: Router = Router();

examContentRouter.get(
  '/:examInstanceId/module/:moduleType',
  getExamModuleContent,
);

examContentRouter.post('/:sessionId/complete', completeExamSession);
examContentRouter.post('/:sessionId/phase0/submit', submitPhase0);
examContentRouter.post('/:sessionId/modulea/submit', submitModuleA);
examContentRouter.post('/:sessionId/mb/submit', submitMb);
examContentRouter.post('/:sessionId/moduled/submit', submitModuleD);
examContentRouter.post('/:sessionId/selfassess/submit', submitSelfAssess);
examContentRouter.post('/:sessionId/modulec/round/:roundIdx', submitModuleCRound);
examContentRouter.post('/:sessionId/mb/editor-behavior', submitMbEditorBehavior);
examContentRouter.post('/:sessionId/mb/test-result', submitMbTestResult);
