/**
 * ScoringHydratorService — Task 15a Deliverable B (V5.0 release gate).
 *
 * Production wrapper that the orchestrator's L12-16 file header foresaw:
 * pull the Session row + ExamInstance module specs out of Prisma, pack them
 * into the DB-free `ScoreSessionInput`, delegate to `scoreSession()`, then
 * persist the result to `Session.scoringResult`. Keeps the orchestrator
 * fixture-addressable while still giving the real socket / Admin flows a
 * one-call "hydrate-and-score" entry point.
 *
 * Key design constraints (Phase 1 Q1 / Q2 / Q9):
 * - **Does not modify the orchestrator** — the DB-free contract is
 *   load-bearing for Golden Path fixture tests.
 * - **Reads only metadata top-level namespaces** (`metadata.phase0` /
 *   `metadata.moduleA` / `metadata.mb` / `metadata.moduleD` /
 *   `metadata.selfAssess` / `metadata.moduleC`). The V4 ghost
 *   `metadata.submissions.*` namespace is **not** a fallback — per Phase 1 Q9
 *   it has 0 live production data (cutover-only).
 * - **Graceful degradation**: a missing / malformed namespace logs a warn
 *   and leaves the submissions field undefined; downstream signals then
 *   null-out naturally. The hydrator never throws on missing candidate data.
 *   Session-not-found / ExamInstance-not-found remain hard errors (data
 *   integrity issues that must surface).
 * - **Idempotent**: calling hydrateAndScore twice against the same session
 *   yields deep-equal scoringResult (pure function of session state at call
 *   time; any non-deterministic pieces live inside signal authors, not here).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import type {
  ScoreSessionInput,
  SignalRegistry,
  SuiteId,
  V5MBSubmission,
  V5ModuleASubmission,
  V5ModuleCAnswer,
  V5ModuleDSubmission,
  V5ModuleKey,
  V5ModuleType,
  V5Phase0Submission,
  V5ScoringResult,
  V5SelfAssessSubmission,
  V5Submissions,
} from '@codelens-v5/shared';
import { SUITES, isSuiteId } from '@codelens-v5/shared';

import { prisma as defaultPrisma } from '../config/db.js';
import { logger } from '../lib/logger.js';
import { ExamDataService } from './exam-data.service.js';
import { scoreSession } from './scoring-orchestrator.service.js';

// ────────────────────────── error types ──────────────────────────

export class HydratorSessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Hydrator: session not found: ${sessionId}`);
    this.name = 'HydratorSessionNotFoundError';
  }
}

export class HydratorExamInstanceNotFoundError extends Error {
  constructor(sessionId: string, examInstanceId: string | undefined) {
    super(
      `Hydrator: exam instance not found for session ${sessionId} (examInstanceId=${examInstanceId ?? 'missing'})`,
    );
    this.name = 'HydratorExamInstanceNotFoundError';
  }
}

export class HydratorInvalidMetadataError extends Error {
  constructor(sessionId: string, reason: string) {
    super(`Hydrator: invalid session metadata for ${sessionId}: ${reason}`);
    this.name = 'HydratorInvalidMetadataError';
  }
}

// ────────────────────────── public types ──────────────────────────

export interface HydrateScoreOptions {
  /** Inject a pre-built registry (test hook). Falls back to orchestrator default. */
  registry?: SignalRegistry;
  /** When true, skip the scoringResult write-back — used for dry-run diagnostics. */
  dryRun?: boolean;
  /**
   * When true, ignore cached `Session.scoringResult` and re-hydrate from
   * scratch. Default false: lazy-trigger callers (admin route polling) get a
   * cheap O(1) Prisma read instead of full scoring on every poll. Brief #20
   * C1 — closes ship-gate-#5 polling race where two concurrent hydrate calls
   * raced on `session.update({scoringResult})` and could observe stale state.
   */
  forceRefresh?: boolean;
}

export interface HydrateScoreResult {
  sessionId: string;
  suiteId: SuiteId;
  participatingModules: readonly V5ModuleKey[];
  scoringResult: V5ScoringResult;
  /** Per-namespace read status — useful for debugging degraded sessions. */
  hydrationReport: HydrationReport;
  /** True when scoringResult was returned from `Session.scoringResult` cache. */
  cached?: boolean;
}

export interface HydrationReport {
  phase0: HydrationStatus;
  moduleA: HydrationStatus;
  mb: HydrationStatus;
  moduleD: HydrationStatus;
  selfAssess: HydrationStatus;
  moduleC: HydrationStatus;
  examData: Partial<Record<V5ModuleType, HydrationStatus>>;
}

export type HydrationStatus = 'present' | 'absent' | 'malformed';

// ────────────────────────── service ──────────────────────────

export class ScoringHydratorService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly examData: ExamDataService = new ExamDataService(prisma),
  ) {}

  /**
   * One-call hydrate-and-score entry point.
   *
   * Order of operations:
   *   1. Load `Session` row via Prisma.
   *   2. Narrow `session.metadata` → pull top-level module namespaces.
   *   3. Load per-module `ExamModule.moduleSpecific` via ExamDataService.
   *   4. Pack `ScoreSessionInput` and delegate to `scoreSession()`.
   *   5. Persist `result` to `Session.scoringResult` (unless dryRun).
   */
  async hydrateAndScore(
    sessionId: string,
    options: HydrateScoreOptions = {},
  ): Promise<HydrateScoreResult> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw new HydratorSessionNotFoundError(sessionId);
    }

    const meta = (session.metadata ?? {}) as Record<string, unknown>;

    const suiteIdRaw = meta.suiteId;
    if (typeof suiteIdRaw !== 'string' || !isSuiteId(suiteIdRaw)) {
      throw new HydratorInvalidMetadataError(
        sessionId,
        `metadata.suiteId missing or invalid (got ${String(suiteIdRaw)})`,
      );
    }
    const suiteId: SuiteId = suiteIdRaw;

    const examInstanceId =
      typeof meta.examInstanceId === 'string' ? meta.examInstanceId : undefined;
    if (!examInstanceId) {
      throw new HydratorExamInstanceNotFoundError(sessionId, examInstanceId);
    }

    const participatingModules = this.resolveParticipatingModules(meta, suiteId);

    // Brief #20 C1 · polling race short-circuit. When admin.ts:378-379 lazy-
    // triggers hydrateAndScore on every /admin/sessions/:id GET, the first
    // hydrate writes scoringResult and subsequent polls should observe that
    // cache rather than re-running the full pipeline (and racing the same
    // session.update). forceRefresh=true is reserved for explicit re-score
    // (e.g. when fixture/spec changes invalidate cached output).
    const cached = (session as { scoringResult?: unknown }).scoringResult;
    if (!options.forceRefresh && cached && typeof cached === 'object') {
      logger.info('[hydrator] hydrateAndScore cache hit', {
        sessionId,
        suiteId,
      });
      return {
        sessionId,
        suiteId,
        participatingModules,
        scoringResult: cached as V5ScoringResult,
        hydrationReport: {
          phase0: 'present',
          moduleA: 'present',
          mb: 'present',
          moduleD: 'present',
          selfAssess: 'present',
          moduleC: 'present',
          examData: {},
        },
        cached: true,
      };
    }

    const { submissions, hydrationReport: subReport } = this.readSubmissions(
      sessionId,
      meta,
    );

    const { examData, report: examDataReport } = await this.readExamData(
      sessionId,
      examInstanceId,
      participatingModules,
    );

    const scoreInput: ScoreSessionInput = {
      sessionId,
      suiteId,
      submissions,
      examData,
      participatingModules,
    };

    const scoringResult = await scoreSession(scoreInput, {
      registry: options.registry,
    });

    if (!options.dryRun) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          scoringResult: scoringResult as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const hydrationReport: HydrationReport = {
      ...subReport,
      examData: examDataReport,
    };
    logger.info('[hydrator] hydrateAndScore complete', {
      sessionId,
      suiteId,
      grade: scoringResult.grade,
      composite: scoringResult.composite,
      hydrationReport,
      dryRun: options.dryRun ?? false,
    });

    return {
      sessionId,
      suiteId,
      participatingModules,
      scoringResult,
      hydrationReport,
    };
  }

  /**
   * Pick `participatingModules` from `metadata.moduleOrder` (written by
   * SessionService.createSession) when present, else derive from SUITES.
   * The two should always agree; we prefer the persisted order in case a
   * session was created before a SUITES definition tweak.
   */
  private resolveParticipatingModules(
    meta: Record<string, unknown>,
    suiteId: SuiteId,
  ): readonly V5ModuleKey[] {
    const raw = meta.moduleOrder;
    if (Array.isArray(raw) && raw.every((v) => typeof v === 'string')) {
      return raw as V5ModuleKey[];
    }
    return SUITES[suiteId].modules;
  }

  /**
   * Read per-module candidate submissions from metadata top-level namespaces.
   *
   * Each slot is optional + defensively narrowed; a missing or malformed
   * namespace sets the field to undefined and records the status in the
   * hydration report so callers can surface degraded-data warnings.
   */
  private readSubmissions(
    sessionId: string,
    meta: Record<string, unknown>,
  ): {
    submissions: V5Submissions;
    hydrationReport: Omit<HydrationReport, 'examData'>;
  } {
    const phase0 = readNamespace<V5Phase0Submission>(meta, 'phase0');
    const moduleA = readNamespace<V5ModuleASubmission>(meta, 'moduleA');
    const mb = readMbNamespace(meta);
    const moduleD = readNamespace<V5ModuleDSubmission>(meta, 'moduleD');
    const selfAssess = readNamespace<V5SelfAssessSubmission>(meta, 'selfAssess');
    const moduleC = readModuleCNamespace(meta);

    if (phase0.status === 'malformed') {
      logger.warn('[hydrator] metadata.phase0 malformed', { sessionId });
    }
    if (moduleA.status === 'malformed') {
      logger.warn('[hydrator] metadata.moduleA malformed', { sessionId });
    }
    if (mb.status === 'malformed') {
      logger.warn('[hydrator] metadata.mb malformed', { sessionId });
    }
    if (moduleD.status === 'malformed') {
      logger.warn('[hydrator] metadata.moduleD malformed', { sessionId });
    }
    if (selfAssess.status === 'malformed') {
      logger.warn('[hydrator] metadata.selfAssess malformed', { sessionId });
    }
    if (moduleC.status === 'malformed') {
      logger.warn('[hydrator] metadata.moduleC malformed', { sessionId });
    }

    const submissions: V5Submissions = {};
    if (phase0.value !== undefined) submissions.phase0 = phase0.value;
    if (moduleA.value !== undefined) submissions.moduleA = moduleA.value;
    if (mb.value !== undefined) submissions.mb = mb.value;
    if (moduleD.value !== undefined) submissions.moduleD = moduleD.value;
    if (selfAssess.value !== undefined) submissions.selfAssess = selfAssess.value;
    if (moduleC.value !== undefined) submissions.moduleC = moduleC.value;

    return {
      submissions,
      hydrationReport: {
        phase0: phase0.status,
        moduleA: moduleA.status,
        mb: mb.status,
        moduleD: moduleD.status,
        selfAssess: selfAssess.status,
        moduleC: moduleC.status,
      },
    };
  }

  /**
   * Read per-module exam specs (ExamModule.moduleSpecific rows) for the
   * modules that actually participate. Missing rows are tolerated — signals
   * that require examData null-out rather than the scoring pipeline failing.
   */
  private async readExamData(
    sessionId: string,
    examInstanceId: string,
    participatingModules: readonly V5ModuleKey[],
  ): Promise<{
    examData: Partial<Record<V5ModuleType, Record<string, unknown>>>;
    report: Partial<Record<V5ModuleType, HydrationStatus>>;
  }> {
    const examData: Partial<Record<V5ModuleType, Record<string, unknown>>> = {};
    const report: Partial<Record<V5ModuleType, HydrationStatus>> = {};

    for (const moduleKey of participatingModules) {
      const moduleType = MODULE_KEY_TO_TYPE[moduleKey];
      if (!moduleType) continue;
      try {
        const data = await this.fetchModuleData(moduleType, examInstanceId);
        if (data) {
          examData[moduleType] = data as Record<string, unknown>;
          report[moduleType] = 'present';
        } else {
          report[moduleType] = 'absent';
          logger.warn('[hydrator] examData missing', {
            sessionId,
            examInstanceId,
            moduleType,
          });
        }
      } catch (err) {
        report[moduleType] = 'malformed';
        logger.warn('[hydrator] examData read failed', {
          sessionId,
          examInstanceId,
          moduleType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { examData, report };
  }

  private fetchModuleData(
    moduleType: V5ModuleType,
    examInstanceId: string,
  ): Promise<unknown> {
    switch (moduleType) {
      case 'P0':
        return this.examData.getP0Data(examInstanceId);
      case 'MA':
        return this.examData.getMAData(examInstanceId);
      case 'MB':
        return this.examData.getMBData(examInstanceId);
      case 'MD':
        return this.examData.getMDData(examInstanceId);
      case 'SE':
        return this.examData.getSEData(examInstanceId);
      case 'MC':
        return this.examData.getMCData(examInstanceId);
      default:
        return Promise.resolve(null);
    }
  }
}

// ────────────────────────── helpers ──────────────────────────

const MODULE_KEY_TO_TYPE: Record<V5ModuleKey, V5ModuleType> = {
  phase0: 'P0',
  moduleA: 'MA',
  mb: 'MB',
  moduleD: 'MD',
  selfAssess: 'SE',
  moduleC: 'MC',
};

interface NamespaceRead<T> {
  value: T | undefined;
  status: HydrationStatus;
}

function readNamespace<T>(
  meta: Record<string, unknown>,
  key: string,
): NamespaceRead<T> {
  const raw = meta[key];
  if (raw === undefined || raw === null) {
    return { value: undefined, status: 'absent' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: undefined, status: 'malformed' };
  }
  return { value: raw as T, status: 'present' };
}

/**
 * MB is special-cased: the signal pipeline reads `submissions.mb.editorBehavior`
 * + sibling slices. We accept the namespace as-is (already written by
 * mb.service.ts), defaulting the 5 required editorBehavior arrays and
 * `finalTestPassRate` to empty/zero when the candidate never reached MB.
 * This keeps MB signals null-ing cleanly on degraded sessions rather than
 * crashing on missing `.aiCompletionEvents.length`.
 */
function readMbNamespace(meta: Record<string, unknown>): NamespaceRead<V5MBSubmission> {
  const raw = meta.mb;
  if (raw === undefined || raw === null) {
    return { value: undefined, status: 'absent' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { value: undefined, status: 'malformed' };
  }
  const obj = raw as Record<string, unknown>;
  const eb = (obj.editorBehavior ?? {}) as Record<string, unknown>;
  const finalFiles = Array.isArray(obj.finalFiles)
    ? (obj.finalFiles as V5MBSubmission['finalFiles'])
    : [];
  const finalTestPassRate =
    typeof obj.finalTestPassRate === 'number' ? obj.finalTestPassRate : 0;
  const value: V5MBSubmission = {
    ...(obj.planning ? { planning: obj.planning as V5MBSubmission['planning'] } : {}),
    ...(obj.rounds ? { rounds: obj.rounds as V5MBSubmission['rounds'] } : {}),
    editorBehavior: {
      aiCompletionEvents: Array.isArray(eb.aiCompletionEvents)
        ? (eb.aiCompletionEvents as V5MBSubmission['editorBehavior']['aiCompletionEvents'])
        : [],
      chatEvents: Array.isArray(eb.chatEvents)
        ? (eb.chatEvents as V5MBSubmission['editorBehavior']['chatEvents'])
        : [],
      diffEvents: Array.isArray(eb.diffEvents)
        ? (eb.diffEvents as V5MBSubmission['editorBehavior']['diffEvents'])
        : [],
      fileNavigationHistory: Array.isArray(eb.fileNavigationHistory)
        ? (eb.fileNavigationHistory as V5MBSubmission['editorBehavior']['fileNavigationHistory'])
        : [],
      editSessions: Array.isArray(eb.editSessions)
        ? (eb.editSessions as V5MBSubmission['editorBehavior']['editSessions'])
        : [],
      testRuns: Array.isArray(eb.testRuns)
        ? (eb.testRuns as V5MBSubmission['editorBehavior']['testRuns'])
        : [],
      ...(Array.isArray(eb.documentVisibilityEvents)
        ? {
            documentVisibilityEvents:
              eb.documentVisibilityEvents as V5MBSubmission['editorBehavior']['documentVisibilityEvents'],
          }
        : {}),
    },
    finalFiles,
    finalTestPassRate,
    ...(obj.standards
      ? { standards: obj.standards as V5MBSubmission['standards'] }
      : {}),
    ...(obj.audit ? { audit: obj.audit as V5MBSubmission['audit'] } : {}),
    ...(obj.agentExecutions
      ? { agentExecutions: obj.agentExecutions as V5MBSubmission['agentExecutions'] }
      : {}),
  };
  return { value, status: 'present' };
}

/** ModuleC is array-shaped, so the generic object-narrowing helper doesn't fit. */
function readModuleCNamespace(
  meta: Record<string, unknown>,
): NamespaceRead<V5ModuleCAnswer[]> {
  const raw = meta.moduleC;
  if (raw === undefined || raw === null) {
    return { value: undefined, status: 'absent' };
  }
  if (!Array.isArray(raw)) {
    return { value: undefined, status: 'malformed' };
  }
  return { value: raw as V5ModuleCAnswer[], status: 'present' };
}

// ────────────────────────── singletons ──────────────────────────

/**
 * Default singleton used by production route handlers (Task 15b). Tests
 * should instantiate `new ScoringHydratorService(prisma, examDataService)`
 * directly so they can inject a test Prisma + registry.
 */
export const scoringHydratorService = new ScoringHydratorService(defaultPrisma);
