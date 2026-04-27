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
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';

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

export const examContentRouter: Router = Router();

examContentRouter.get(
  '/:examInstanceId/module/:moduleType',
  getExamModuleContent,
);
