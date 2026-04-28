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
import { persistMbSubmission } from '../services/modules/mb.service.js';
import { persistSelfAssess } from '../services/modules/se.service.js';
import { saveRoundAnswer } from '../services/modules/mc.service.js';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import type {
  V5Phase0Submission,
  V5ModuleASubmission,
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

export async function submitSelfAssess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;
    const { selfConfidence, selfIdentifiedRisk, responseTimeMs } = req.body ?? {};
    if (typeof selfConfidence !== 'number' || typeof responseTimeMs !== 'number') {
      throw new ValidationError(
        'selfConfidence (number) and responseTimeMs (number) body fields required',
      );
    }
    await ensureSessionOrThrow(sessionId);
    // Match the socket-handler normalization (self-assess-handlers.ts:56-61):
    // selfConfidence is 0..100 percentage; persistSelfAssess wants 0..1 confidence.
    const submission: V5SelfAssessSubmission = {
      confidence: clamp01(selfConfidence / 100),
      reasoning:
        typeof selfIdentifiedRisk === 'string' ? selfIdentifiedRisk : '',
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
examContentRouter.post('/:sessionId/selfassess/submit', submitSelfAssess);
examContentRouter.post('/:sessionId/modulec/round/:roundIdx', submitModuleCRound);
