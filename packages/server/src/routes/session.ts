import { Router } from 'express';
import { requireCandidate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sessionCreateSchema } from '@codelens-v5/shared';
import { sessionService } from '../services/session.service.js';
import { checkpointService } from '../services/checkpoint.service.js';
import { scoringService } from '../services/scoring.service.js';
import { signCandidateToken } from '../services/auth.service.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { testRunnerService } from '../services/test-runner.service.js';
import { NotFoundError } from '../middleware/errorHandler.js';

export const sessionRouter = Router();

sessionRouter.use(apiLimiter);

// Create session (admin creates, returns candidate token)
sessionRouter.post('/', requireAdmin, validate(sessionCreateSchema), async (req, res, next) => {
  try {
    const { candidateId, templateId, durationMinutes } = req.body;
    const session = await sessionService.create(
      candidateId,
      templateId,
      durationMinutes ? durationMinutes * 60 * 1000 : undefined,
    );
    const token = signCandidateToken(candidateId, session.id);
    res.status(201).json({ session, token });
  } catch (error) {
    next(error);
  }
});

// Start session (candidate triggers sandbox creation)
sessionRouter.post('/:id/start', requireCandidate, async (req, res, next) => {
  try {
    const session = await sessionService.startSession(req.params.id);
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

// End session
sessionRouter.post('/:id/end', requireCandidate, async (req, res, next) => {
  try {
    const session = await sessionService.endSession(req.params.id);
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

// Get session
sessionRouter.get('/:id', requireCandidate, async (req, res, next) => {
  try {
    const session = await sessionService.getSession(req.params.id);
    res.json({ session });
  } catch (error) {
    next(error);
  }
});

// Get timer state
sessionRouter.get('/:id/timer', requireCandidate, async (req, res, next) => {
  try {
    const timerState = await checkpointService.getTimerState(req.params.id);
    res.json({ timer: timerState });
  } catch (error) {
    next(error);
  }
});

// Get checkpoint results
sessionRouter.get('/:id/checkpoints', requireCandidate, async (req, res, next) => {
  try {
    const results = await checkpointService.getResults(req.params.id);
    res.json({ checkpoints: results });
  } catch (error) {
    next(error);
  }
});

// Candidate-visible simplified report (no internal evidence/integrity details)
sessionRouter.get('/:id/report', requireCandidate, async (req, res, next) => {
  try {
    const session = await sessionService.getSession(req.params.id);
    if (!session) throw new NotFoundError('Session not found');
    if (session.status !== 'COMPLETED' && session.status !== 'EXPIRED') {
      return res.status(400).json({ error: { code: 'SESSION_NOT_COMPLETE', message: 'Report is only available after the session is completed.' } });
    }

    const scoring = await scoringService.getResults(req.params.id);

    res.json({
      sessionId: session.id,
      completedAt: session.completedAt,
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
      compliance: 'This assessment was conducted with AI-assisted evaluation. Results should be considered alongside other evaluation methods such as human interviews, reference checks, and practical assessments. AI scoring provides an objective behavioral analysis but does not replace comprehensive human judgment.',
    });
  } catch (error) {
    next(error);
  }
});

// Admin: advance checkpoint manually
sessionRouter.post('/:id/checkpoint/advance', requireAdmin, async (req, res, next) => {
  try {
    const result = await checkpointService.advanceCheckpoint(req.params.id, 'manual');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Admin: run hidden tests in candidate's sandbox
sessionRouter.post('/:id/run-hidden-tests', requireAdmin, async (req, res, next) => {
  try {
    const results = await testRunnerService.runHiddenTests(req.params.id);
    const passed = results.filter((r) => r.passed).length;
    res.json({
      results,
      summary: { total: results.length, passed, failed: results.length - passed },
    });
  } catch (error) {
    next(error);
  }
});
