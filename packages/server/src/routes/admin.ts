/**
 * Admin API routes — Task 15b Deliverable §2 (+ Task B-A12 profile read).
 *
 * 8 endpoints matching `V5Admin*` canonical contract in
 * `packages/shared/src/types/v5-admin-api.ts`. All endpoints are mounted
 * under `requireAdmin` (injects `req.orgId`) at `/api/admin/*` in index.ts.
 * Endpoint 8 (`GET /admin/sessions/:sessionId/profile`) is Task B-A12's
 * admin-side read of `candidateProfile` + `consentAcceptedAt`.
 *
 * Scope conventions:
 *   - orgId scope: every Prisma query filters by `req.orgId` (MEMBER single-
 *     org). OWNER cross-org admin is V5.0.5 scope (brief §10).
 *   - Error shape: handlers throw AppError/ValidationError/NotFoundError so
 *     the global errorHandler middleware emits `{ error: { code, message } }`
 *     uniformly.
 *   - Schema gap on ExamInstance: no `createdAt` column in schema.prisma
 *     (V5.1 exam bank task fills this). Endpoint 5 returns 0 as placeholder
 *     and derives `suiteId` / `titleZh` from relations + businessScenario JSON.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import type { Prisma } from '@prisma/client';
import type {
  V5AdminSession,
  V5AdminSessionList,
  V5AdminSessionCreateRequest,
  V5AdminSessionCreateResponse,
  V5AdminSessionReport,
  V5AdminSessionProfile,
  V5AdminExamInstance,
  V5AdminSuite,
  V5AdminStatsOverview,
  V5AdminSignalViewMeta,
  SuiteId,
  V5Grade,
  V5ScoringResult,
  V5ModuleType,
  V5ModuleKey,
  BusinessScenario,
  CandidateProfile,
  SignalDefinition,
  SignalRegistry,
} from '@codelens-v5/shared';
import {
  SUITES,
  SUITE_IDS,
  isSuiteId,
  V5_GRADE_ORDER,
} from '@codelens-v5/shared';

import { prisma } from '../config/db.js';
import { logger } from '../lib/logger.js';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../middleware/errorHandler.js';
import { scoringHydratorService } from '../services/scoring-hydrator.service.js';
import { SignalRegistryImpl } from '../services/signal-registry.service.js';
import { registerAllSignals } from '../signals/index.js';

// ────────────────────────── module-local helpers ──────────────────────────

/**
 * Local signal registry used to expose `signalDefinitions` on endpoint 4.
 * Populated lazily so test suites that mock env / disable DB don't eagerly
 * trigger signal module-load side effects.
 */
let adminRegistry: SignalRegistry | null = null;
function getAdminRegistry(): SignalRegistry {
  if (!adminRegistry) {
    const reg = new SignalRegistryImpl();
    registerAllSignals(reg);
    adminRegistry = reg;
  }
  return adminRegistry;
}

/** Strip `compute` / `fallback` so definitions survive JSON serialization. */
function toSignalViewMeta(def: SignalDefinition): V5AdminSignalViewMeta {
  return {
    id: def.id,
    dimension: def.dimension,
    moduleSource: def.moduleSource,
    isLLMWhitelist: def.isLLMWhitelist,
  };
}

/** MEMBER tokens must carry orgId; refuse otherwise to prevent unscoped queries. */
function requireOrgScope(req: Request): string {
  if (!req.orgId) {
    throw new AuthorizationError('Admin token missing orgId claim');
  }
  return req.orgId;
}

function parsePositiveInt(value: unknown, fallback: number, max = 200): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function shareableUrl(req: Request, sessionId: string): string {
  // sessionToken ≡ sessionId per CandidateGuard / ConsentPage ratified design
  // (Phase 1 [B]). The signShareToken/verifyShareToken indirection in
  // auth.service.ts is currently dead code — no /shared/:token route handler
  // exists on either side — so emitting `/shared/<token>` produced links that
  // 404'd everywhere. Match the actual route graph: `/exam/:sessionId`.
  const origin =
    (typeof req.headers.origin === 'string' && req.headers.origin) ||
    `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  return `${origin}/exam/${sessionId}`;
}

function readSuiteIdFromMetadata(metadata: unknown): SuiteId | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).suiteId;
  return typeof raw === 'string' && isSuiteId(raw) ? raw : null;
}

function readCompositeFromScoring(scoring: unknown): number | null {
  if (!scoring || typeof scoring !== 'object') return null;
  const v = (scoring as Record<string, unknown>).composite;
  return typeof v === 'number' ? v : null;
}

function readGradeFromScoring(scoring: unknown): V5Grade | null {
  if (!scoring || typeof scoring !== 'object') return null;
  const v = (scoring as Record<string, unknown>).grade;
  return typeof v === 'string' && (V5_GRADE_ORDER as readonly string[]).includes(v)
    ? (v as V5Grade)
    : null;
}

const MODULE_TYPE_TO_KEY: Record<V5ModuleType, V5ModuleKey> = {
  P0: 'phase0',
  MA: 'moduleA',
  MB: 'mb',
  MD: 'moduleD',
  SE: 'selfAssess',
  MC: 'moduleC',
};

/** Pick the SUITE whose module set matches the instance's ExamModule types. */
function deriveSuiteIdFromModules(moduleTypes: readonly V5ModuleType[]): SuiteId {
  const keys = new Set<V5ModuleKey>(
    moduleTypes.map((t) => MODULE_TYPE_TO_KEY[t]).filter((k): k is V5ModuleKey => !!k),
  );
  for (const id of SUITE_IDS) {
    const target = SUITES[id].modules;
    if (target.length !== keys.size) continue;
    if (target.every((m) => keys.has(m))) return id;
  }
  return 'full_stack';
}

type SessionRow = Prisma.SessionGetPayload<{ include: { candidate: true } }>;

function toAdminSession(row: SessionRow): V5AdminSession {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const suiteIdRaw = meta.suiteId;
  const suiteId: SuiteId =
    typeof suiteIdRaw === 'string' && isSuiteId(suiteIdRaw) ? suiteIdRaw : 'full_stack';
  const examInstanceId =
    typeof meta.examInstanceId === 'string' ? meta.examInstanceId : '';
  const session: V5AdminSession = {
    id: row.id,
    suiteId,
    examInstanceId,
    candidate: {
      id: row.candidate.id,
      name: row.candidate.name,
      email: row.candidate.email,
    },
    status: row.status as V5AdminSession['status'],
    createdAt: row.createdAt.getTime(),
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
    completedAt: row.completedAt ? row.completedAt.getTime() : null,
    grade: readGradeFromScoring(row.scoringResult),
    composite: readCompositeFromScoring(row.scoringResult),
    shareableLink: null,
  };
  if (row.orgId) session.orgId = row.orgId;
  return session;
}

// ────────────────────────── handlers ──────────────────────────

/** POST /admin/sessions/create — endpoint 1. */
export async function createAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const body = req.body as Partial<V5AdminSessionCreateRequest>;

    if (!body || typeof body !== 'object') {
      throw new ValidationError('Request body required');
    }
    const { suiteId, examInstanceId, candidate } = body;
    if (typeof suiteId !== 'string' || !isSuiteId(suiteId)) {
      throw new ValidationError(`Invalid suiteId: ${String(suiteId)}`);
    }
    if (typeof examInstanceId !== 'string' || examInstanceId.length === 0) {
      throw new ValidationError('examInstanceId required');
    }
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.email !== 'string' ||
      candidate.name.length === 0 ||
      candidate.email.length === 0
    ) {
      throw new ValidationError('candidate.name + candidate.email required');
    }

    const examInstance = await prisma.examInstance.findUnique({
      where: { id: examInstanceId },
    });
    if (!examInstance) {
      throw new NotFoundError(`ExamInstance not found: ${examInstanceId}`);
    }
    if (examInstance.orgId && examInstance.orgId !== orgId) {
      throw new AuthorizationError('ExamInstance belongs to a different org');
    }

    const candidateRow = await prisma.candidate.upsert({
      where: { email: candidate.email },
      create: { name: candidate.name, email: candidate.email, orgId },
      update: { name: candidate.name, orgId },
    });

    const suite = SUITES[suiteId];
    const durationMs = suite.estimatedMinutes * 60 * 1000;
    const metadata: Record<string, unknown> = {
      suiteId,
      moduleOrder: [...suite.modules],
      examInstanceId,
      schemaVersion: 5,
      submissions: {},
      assessmentQuality: 'full',
    };

    // Task B-A12 auth-fallback: mint opaque Session-scoped token for the
    // body-token path of requireCandidate. 32 bytes → 43 base64url chars.
    const candidateToken = randomBytes(32).toString('base64url');
    // Task B-A10-lite: second token authorizes the candidate self-view
    // endpoint. Separate from candidateToken so the admin-visible exam-token
    // can't impersonate the candidate's post-completion self-view.
    const candidateSelfViewToken = randomBytes(32).toString('base64url');

    const sessionRow = await prisma.session.create({
      data: {
        candidateId: candidateRow.id,
        orgId,
        schemaVersion: 5,
        status: 'CREATED',
        expiresAt: new Date(Date.now() + durationMs),
        metadata: metadata as unknown as Prisma.InputJsonValue,
        candidateToken,
        candidateSelfViewToken,
      },
      include: { candidate: true },
    });

    const shareableLink = shareableUrl(req, sessionRow.id);
    const origin =
      (typeof req.headers.origin === 'string' && req.headers.origin) ||
      `${req.protocol}://${req.get('host') ?? 'localhost'}`;
    const selfViewUrl = `${origin}/candidate/self-view/${sessionRow.id}/${candidateSelfViewToken}`;
    const session = toAdminSession(sessionRow);
    session.shareableLink = shareableLink;

    const response: V5AdminSessionCreateResponse = {
      session,
      shareableLink,
      candidateToken,
      candidateSelfViewToken,
      selfViewUrl,
    };
    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/sessions — endpoint 2. */
export async function listAdminSessions(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const { suiteId, status } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);

    const where: Prisma.SessionWhereInput = { orgId };
    if (typeof status === 'string' && status.length > 0) {
      where.status = status;
    }
    // suiteId lives in metadata JSON; Prisma supports JSON path filters on pg.
    if (typeof suiteId === 'string' && isSuiteId(suiteId)) {
      where.metadata = { path: ['suiteId'], equals: suiteId };
    }

    const [total, rows] = await Promise.all([
      prisma.session.count({ where }),
      prisma.session.findMany({
        where,
        include: { candidate: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const response: V5AdminSessionList = {
      items: rows.map(toAdminSession),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/sessions/:sessionId — endpoint 3. */
export async function getAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const row = await prisma.session.findUnique({
      where: { id: req.params.sessionId },
      include: { candidate: true },
    });
    if (!row) throw new NotFoundError('Session not found');
    if (row.orgId !== orgId) throw new AuthorizationError('Session belongs to a different org');
    res.json(toAdminSession(row));
  } catch (err) {
    next(err);
  }
}

/** GET /admin/sessions/:sessionId/report — endpoint 4. */
export async function getAdminSessionReport(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const sessionId = req.params.sessionId;

    const row = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { candidate: true },
    });
    if (!row) throw new NotFoundError('Session not found');
    if (row.orgId !== orgId) throw new AuthorizationError('Session belongs to a different org');
    if (row.status !== 'COMPLETED') {
      throw new ValidationError('Report available only for completed sessions');
    }

    const { scoringResult, participatingModules, suiteId, submissions } =
      await scoringHydratorService.hydrateAndScore(sessionId);

    const signalDefinitions: V5AdminSignalViewMeta[] = getAdminRegistry()
      .listSignals()
      .map(toSignalViewMeta);

    const scoring = scoringResult as V5ScoringResult;
    const report: V5AdminSessionReport = {
      sessionId,
      candidateName: row.candidate.name,
      completedAt: row.completedAt?.getTime(),
      suite: toAdminSuite(suiteId),
      participatingModules,
      gradeDecision: {
        grade: scoring.grade,
        composite: scoring.composite,
        dimensions: scoring.dimensions,
        confidence: scoring.confidence,
        boundaryAnalysis: scoring.boundaryAnalysis,
        reasoning: scoring.reasoning,
        ...(scoring.dangerFlag ? { dangerFlag: scoring.dangerFlag } : {}),
      },
      capabilityProfiles: scoring.capabilityProfiles,
      dimensions: scoring.dimensions,
      signalResults: scoring.signals,
      signalDefinitions,
      submissions,
      ...(scoring.cursorBehaviorLabel
        ? { cursorBehaviorLabel: scoring.cursorBehaviorLabel }
        : {}),
    };

    res.json(report);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/sessions/:sessionId/profile — endpoint 8 (Task B-A12). */
export async function getAdminSessionProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const row = await prisma.session.findUnique({
      where: { id: req.params.sessionId },
      select: {
        id: true,
        orgId: true,
        candidateProfile: true,
        consentAcceptedAt: true,
      },
    });
    if (!row) throw new NotFoundError('Session not found');
    if (row.orgId !== orgId) {
      throw new AuthorizationError('Session belongs to a different org');
    }
    const response: V5AdminSessionProfile = {
      sessionId: row.id,
      candidateProfile:
        (row.candidateProfile ?? null) as CandidateProfile | null,
      consentAcceptedAt: row.consentAcceptedAt
        ? row.consentAcceptedAt.toISOString()
        : null,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/exam-instances — endpoint 5. */
export async function listAdminExamInstances(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);
    const { suiteId, techStack, domain, level } = req.query;

    const where: Prisma.ExamInstanceWhereInput = {
      OR: [{ orgId }, { orgId: null }],
    };
    if (typeof techStack === 'string') where.techStack = techStack;
    if (typeof domain === 'string') where.domain = domain;
    if (typeof level === 'string') where.level = level;

    const rows = await prisma.examInstance.findMany({
      where,
      include: { modules: { select: { moduleType: true } } },
      orderBy: { usedCount: 'desc' },
    });

    let items: V5AdminExamInstance[] = rows.map((r) => {
      const moduleTypes = r.modules.map((m) => m.moduleType as V5ModuleType);
      const bs = (r.businessScenario ?? {}) as Partial<BusinessScenario>;
      const item: V5AdminExamInstance = {
        id: r.id,
        suiteId: deriveSuiteIdFromModules(moduleTypes),
        techStack: r.techStack,
        domain: r.domain,
        challengePattern: r.challengePattern,
        level: r.level,
        titleZh: typeof bs.systemName === 'string' ? bs.systemName : '',
        // Schema gap: ExamInstance has no createdAt column (V5.1 exam bank
        // task adds it). Use lastUsedAt as a best-effort stand-in, else 0.
        createdAt: r.lastUsedAt ? r.lastUsedAt.getTime() : 0,
        usedCount: r.usedCount,
        avgCompositeScore: r.avgCompositeScore,
        discriminationScore: r.discriminationScore,
      };
      if (r.archStyle) item.archStyle = r.archStyle;
      return item;
    });

    if (typeof suiteId === 'string' && isSuiteId(suiteId)) {
      items = items.filter((it) => it.suiteId === suiteId);
    }

    res.json(items);
  } catch (err) {
    next(err);
  }
}

/** GET /admin/suites — endpoint 6. */
export function listAdminSuites(_req: Request, res: Response): void {
  const items: V5AdminSuite[] = SUITE_IDS.map((id) => toAdminSuite(id));
  res.json(items);
}

function toAdminSuite(id: SuiteId): V5AdminSuite {
  const s = SUITES[id];
  return {
    id: s.id,
    nameZh: s.nameZh,
    nameEn: s.nameEn,
    estimatedMinutes: s.estimatedMinutes,
    gradeCap: s.gradeCap,
    modules: s.modules,
  };
}

/** GET /admin/stats/overview — endpoint 7. */
export async function getAdminStatsOverview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const orgId = requireOrgScope(req);

    const rows = await prisma.session.findMany({
      where: { orgId },
      select: {
        status: true,
        metadata: true,
        scoringResult: true,
      },
    });

    const totalSessions = rows.length;
    let completedSessions = 0;
    let compositeSum = 0;
    let compositeCount = 0;
    const gradeDistribution: Record<V5Grade, number> = {
      D: 0,
      C: 0,
      B: 0,
      'B+': 0,
      A: 0,
      S: 0,
      'S+': 0,
    };
    const suiteDistribution: Record<SuiteId, number> = {
      full_stack: 0,
      architect: 0,
      ai_engineer: 0,
      quick_screen: 0,
      deep_dive: 0,
    };

    for (const r of rows) {
      if (r.status === 'COMPLETED') completedSessions += 1;
      const composite = readCompositeFromScoring(r.scoringResult);
      if (composite !== null) {
        compositeSum += composite;
        compositeCount += 1;
      }
      const grade = readGradeFromScoring(r.scoringResult);
      if (grade !== null) gradeDistribution[grade] += 1;
      const suite = readSuiteIdFromMetadata(r.metadata);
      if (suite !== null) suiteDistribution[suite] += 1;
    }

    const response: V5AdminStatsOverview = {
      totalSessions,
      completedSessions,
      completionRate: totalSessions === 0 ? 0 : completedSessions / totalSessions,
      averageComposite: compositeCount === 0 ? 0 : compositeSum / compositeCount,
      gradeDistribution,
      suiteDistribution,
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
}

// ────────────────────────── router ──────────────────────────

export const adminRouter = Router();

adminRouter.post('/sessions/create', createAdminSession);
adminRouter.get('/sessions', listAdminSessions);
adminRouter.get('/sessions/:sessionId', getAdminSession);
adminRouter.get('/sessions/:sessionId/report', getAdminSessionReport);
adminRouter.get('/sessions/:sessionId/profile', getAdminSessionProfile);
adminRouter.get('/exam-instances', listAdminExamInstances);
adminRouter.get('/suites', listAdminSuites);
adminRouter.get('/stats/overview', getAdminStatsOverview);

logger.debug('[admin] routes wired (8 endpoints)');
