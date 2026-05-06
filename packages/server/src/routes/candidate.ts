/**
 * Candidate routes — Task B-A12.
 *
 * Candidate-authenticated endpoints. Mounted at `/api/candidate` with the
 * existing `requireCandidate` middleware (auth.ts:37) applied at router
 * level. `requireCandidate` already scopes the JWT to a specific
 * `payload.sessionId`, so handlers source the session id from `req.auth`
 * rather than the request body (a body-level sessionToken would bypass the
 * horizontal-privilege check).
 *
 * Endpoints:
 *   1. POST /profile/submit — persist candidate profile and/or consent
 *      acceptance. Accepts partial bodies (profile-only / consent-only /
 *      both); empty body → 400.
 *   2. POST /session/status — read candidate session state from the server
 *      so frontend guards do not treat localStorage as authorization truth.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CandidateProfileSubmitRequestSchema,
  type CandidateProfile,
  type CandidateSessionStatusResponse,
} from '@codelens-v5/shared';

import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from '../middleware/errorHandler.js';

interface CandidateProfileSubmitResponse {
  ok: true;
  sessionId: string;
  profile: CandidateProfile | null;
  consentAcceptedAt: string | null;
}

/** POST /candidate/session/status */
export async function getCandidateSessionStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sessionId = req.auth?.sessionId;
    if (!sessionId) {
      throw new AuthenticationError('Candidate token missing sessionId claim');
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        candidateProfile: true,
        consentAcceptedAt: true,
      },
    });
    if (!session) {
      throw new NotFoundError(`Session not found: ${sessionId}`);
    }

    const response: CandidateSessionStatusResponse = {
      ok: true,
      sessionId: session.id,
      status: session.status,
      consentAcceptedAt: session.consentAcceptedAt
        ? session.consentAcceptedAt.toISOString()
        : null,
      profileSubmitted: session.candidateProfile !== null,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

/** POST /candidate/profile/submit */
export async function submitCandidateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const sessionId = req.auth?.sessionId;
    if (!sessionId) {
      throw new AuthenticationError('Candidate token missing sessionId claim');
    }

    const parsed = CandidateProfileSubmitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? 'Invalid candidate profile submission',
        parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      );
    }

    const { profile, consentAccepted } = parsed.data;

    const data: Prisma.SessionUpdateInput = {};
    if (profile !== undefined) {
      data.candidateProfile = profile as unknown as Prisma.InputJsonValue;
    }
    if (consentAccepted !== undefined) {
      data.consentAcceptedAt = consentAccepted ? new Date() : null;
    }

    let updated;
    try {
      updated = await prisma.session.update({
        where: { id: sessionId },
        data,
        select: {
          id: true,
          candidateProfile: true,
          consentAcceptedAt: true,
        },
      });
    } catch (err) {
      // Prisma raises P2025 ("record to update not found") — surface as 404.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: unknown }).code === 'P2025'
      ) {
        throw new NotFoundError(`Session not found: ${sessionId}`);
      }
      throw err;
    }

    const response: CandidateProfileSubmitResponse = {
      ok: true,
      sessionId: updated.id,
      profile: (updated.candidateProfile ?? null) as CandidateProfile | null,
      consentAcceptedAt: updated.consentAcceptedAt
        ? updated.consentAcceptedAt.toISOString()
        : null,
    };
    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
}

export const candidateRouter = Router();

candidateRouter.post('/session/status', getCandidateSessionStatus);
candidateRouter.post('/profile/submit', submitCandidateProfile);

logger.debug('[candidate] routes wired (2 endpoints)');
