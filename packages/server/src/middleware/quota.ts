import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { getPlan } from '../config/plans.js';

/**
 * Check interview quota before creating a session.
 * Returns 402 Payment Required when quota exceeded.
 * Skips check if no orgId (legacy single-tenant mode).
 */
export async function checkQuota(req: Request, res: Response, next: NextFunction) {
  const orgId = req.orgId;
  if (!orgId) {
    // Legacy mode: no org, no quota
    return next();
  }

  try {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }

    const plan = getPlan(org.plan);
    if (org.interviewCount >= plan.maxInterviewsPerMonth) {
      res.status(402).json({
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `Monthly interview quota exceeded (${org.interviewCount}/${plan.maxInterviewsPerMonth}). Please upgrade your plan.`,
          current: org.interviewCount,
          limit: plan.maxInterviewsPerMonth,
          plan: org.plan,
        },
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}
