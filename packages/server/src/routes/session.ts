/**
 * Brief #13 D17 — GET /api/v5/session/:sessionId
 *
 * Candidate-facing session metadata endpoint. Resolves the sessionId from the
 * shareable URL into the session shape that `useSessionStore.loadSession`
 * expects (id · candidate · suiteId · examInstanceId · status). Closes the
 * "Task 12 Layer 2 swap" TODO that previously left loadSession reading from
 * client-side mock fixtures.
 *
 * Auth · sessionId-as-identifier per the ratified "sessionToken ≡ sessionId"
 * design (Hotfix #12 Path A · Brief #13 C7). The shareable URL already
 * exposes the sessionId, so it is not a secret. The response is narrowed to
 * candidate-facing fields only — grade/composite/scoringResult are NOT
 * included; those flow through `/api/candidate/self-view/:id/:token` which
 * is two-token gated.
 *
 * suiteId + examInstanceId live inside `Session.metadata` JSON (set by admin
 * createSession). We project them out into discrete response fields so the
 * client doesn't need to know the JSON layout.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { prisma } from '../config/db.js';
import { NotFoundError } from '../middleware/errorHandler.js';

interface CandidateSessionResponse {
  id: string;
  candidate: { id: string; name: string; email: string };
  suiteId: string;
  examInstanceId: string;
  status: string;
}

export async function getSessionForCandidate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId } = req.params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        metadata: true,
        candidate: { select: { id: true, name: true, email: true } },
      },
    });

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    const meta = (session.metadata ?? {}) as Record<string, unknown>;
    const suiteId = typeof meta.suiteId === 'string' ? meta.suiteId : '';
    const examInstanceId =
      typeof meta.examInstanceId === 'string' ? meta.examInstanceId : '';

    const body: CandidateSessionResponse = {
      id: session.id,
      candidate: {
        id: session.candidate.id,
        name: session.candidate.name,
        email: session.candidate.email,
      },
      suiteId,
      examInstanceId,
      status: session.status,
    };

    res.status(200).json(body);
  } catch (err) {
    next(err);
  }
}

export const sessionRouter: Router = Router();

sessionRouter.get('/:sessionId', getSessionForCandidate);
