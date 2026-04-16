import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { signShareToken, verifyShareToken } from '../services/auth.service.js';
import { prisma } from '../config/db.js';
import { scoringService } from '../services/scoring.service.js';
import { reportGenerator } from '../services/report-generator.service.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { NotFoundError } from '../middleware/errorHandler.js';

export const sharedReportRouter = Router();

// Admin: Generate share link for a session report
sharedReportRouter.post('/sessions/:id/share', requireAdmin, async (req, res, next) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) throw new NotFoundError('Session not found');

    const token = signShareToken(session.id);
    const baseUrl = req.headers.origin || `${req.protocol}://${req.get('host')}`;

    res.json({
      shareToken: token,
      shareUrl: `${baseUrl}/shared/${token}`,
      expiresIn: '7 days',
    });
  } catch (error) {
    next(error);
  }
});

// Public: View shared report (no auth required, token-based)
sharedReportRouter.get('/shared-report/:token', apiLimiter, async (req, res, next) => {
  try {
    const sessionId = verifyShareToken(req.params.token);
    if (!sessionId) {
      res.status(401).json({ error: 'Invalid or expired share link' });
      return;
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        candidate: true,
        template: true,
        checkpointResults: { orderBy: { checkpointIndex: 'asc' } },
      },
    });

    if (!session) throw new NotFoundError('Session not found');

    const scoring = await scoringService.getResults(sessionId);

    // Generate narrative if scoring exists
    let narrativeSummary: string | null = null;
    if (scoring) {
      try {
        narrativeSummary = await reportGenerator.generateNarrativeSummary(
          scoring.dimensions as Parameters<typeof reportGenerator.generateNarrativeSummary>[0],
          scoring.weightedTotal,
          scoring.level,
          null,
        );
      } catch { /* non-critical */ }
    }

    // Shared report: scoring + checkpoints + summary (no integrity/events/internal data)
    res.json({
      session: {
        id: session.id,
        status: session.status,
        completedAt: session.completedAt,
        candidate: { name: session.candidate.name },
        template: { name: session.template.name, language: session.template.language },
      },
      checkpoints: session.checkpointResults.map((cp) => ({
        index: cp.checkpointIndex,
        status: cp.status,
        completedAt: cp.completedAt,
      })),
      scoring: scoring ? {
        weightedTotal: scoring.weightedTotal,
        level: scoring.level,
        dimensions: scoring.dimensions.map((d) => ({
          dimension: d.dimension,
          score: d.score,
          maxScore: d.maxScore,
        })),
        radarData: scoring.radarData,
      } : null,
      narrativeSummary,
    });
  } catch (error) {
    next(error);
  }
});
