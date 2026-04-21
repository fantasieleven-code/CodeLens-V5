/**
 * Task B-A10-lite — GET /api/candidate/self-view/:sessionId/:privateToken
 *
 * Candidate-private self-view endpoint. The URL token IS the auth (no JWT, no
 * requireCandidate middleware): the router is mounted BEFORE /api/candidate so
 * Express matches this prefix first and skips the candidate auth layer. Uniform
 * 404 on session-missing OR token-mismatch (防 enumeration attack · attacker
 * cannot distinguish wrong sessionId vs wrong token).
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';

import { V5ScoringResultSchema, type V5ScoringResult } from '@codelens-v5/shared';

import { prisma } from '../config/db.js';
import {
  AppError,
  NotFoundError,
} from '../middleware/errorHandler.js';
import { transformToCandidateSelfView } from '../services/candidate-self-view.service.js';

async function getCandidateSelfView(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { sessionId, privateToken } = req.params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        candidateSelfViewToken: true,
        completedAt: true,
        status: true,
        scoringResult: true,
      },
    });

    if (!session || session.candidateSelfViewToken !== privateToken) {
      throw new NotFoundError('Session not found');
    }

    if (session.status !== 'COMPLETED' || session.scoringResult === null) {
      throw new AppError(
        400,
        'Session not yet completed',
        'SESSION_INCOMPLETE',
      );
    }

    // Schema runtime-validates drift-sensitive fields (capabilityProfiles,
    // dimensions, grade) that the transform reads; passthrough fields
    // (boundaryAnalysis, signals, cursorBehaviorLabel) are narrower in the
    // inferred type than V5ScoringResult but unused by the transform, so
    // cast back to the interface for the transform signature.
    const scoringResult = V5ScoringResultSchema.parse(
      session.scoringResult,
    ) as unknown as V5ScoringResult;
    const view = transformToCandidateSelfView(
      { id: session.id, completedAt: session.completedAt },
      scoringResult,
    );

    res.status(200).json(view);
  } catch (err) {
    next(err);
  }
}

export const candidateSelfViewRouter: Router = Router();

candidateSelfViewRouter.get('/:sessionId/:privateToken', getCandidateSelfView);

export { getCandidateSelfView };
