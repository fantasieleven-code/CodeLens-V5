/**
 * V5 Admin API shared contract types — Task 15a.
 *
 * Migrated verbatim from `packages/client/src/services/adminApi.types.ts`
 * Frontend Task 10 shim. Backend Task 15b and Frontend Task 12 Layer 2 both
 * import from here as the single source of truth for the admin endpoints.
 *
 * Endpoints covered (Phase 1 Q3 locked, Steve adjudicated option c):
 *   1. POST /admin/sessions/create         → V5AdminSessionCreateResponse
 *   2. GET  /admin/sessions                → V5AdminSessionList
 *   3. GET  /admin/sessions/:sessionId     → V5AdminSession
 *   4. GET  /admin/sessions/:id/report     → V5AdminSessionReport
 *   5. GET  /admin/exam-instances          → V5AdminExamInstance[]
 *   6. GET  /admin/suites                  → V5AdminSuite[]
 *   7. GET  /admin/stats/overview          → V5AdminStatsOverview
 *   8. GET  /admin/sessions/:id/profile    → V5AdminSessionProfile
 *   9. GET  /admin/sessions/:id/links      → V5AdminSessionLinksResponse
 *
 * Field shapes are frozen against the Frontend shim (Pattern F defense —
 * no rename, no "improve"). Task 12 Layer 2 migrates Frontend imports from
 * the local shim to this module without touching any field name.
 *
 * Client-only shim type NOT migrated:
 *   - CreateWizardDraft    (wizard page state)
 */

import type { SessionStatus } from './session.js';
import type { SuiteId } from './v5-suite.js';
import type { V5Grade, V5DimensionScores } from './v5-dimensions.js';
import type { GradeDecision } from './v5-grade.js';
import type { CapabilityProfile } from './v5-capability-profile.js';
import type { SignalDefinition, SignalResults } from './v5-signals.js';
import type { V5ModuleKey } from '../constants/module-keys.js';
import type { V5Submissions } from './v5-submissions.js';
import type { CursorBehaviorLabel } from './v5-scoring.js';
import type { CandidateProfile } from './candidate-profile.js';
import type {
  V5ArchStyle,
  V5ChallengePattern,
  V5Domain,
  V5TechStack,
} from './v5-business-scenario.js';

// ── Admin create-session UX contracts ───────────────────────────────

export interface V5AdminPosition {
  id: string;
  titleZh: string;
  techStack: V5TechStack;
  domain: V5Domain;
  challengePattern: V5ChallengePattern;
  archStyle?: V5ArchStyle;
  /** Short one-line blurb for the create-session Step 1 card preview. */
  summary: string;
}

export interface V5AdminSuiteRecommendation {
  primary: SuiteId;
  alternates: readonly SuiteId[];
  reasoning: string;
}

// ── /admin/stats/overview ────────────────────────────────────────────

export interface V5AdminStatsOverview {
  totalSessions: number;
  completedSessions: number;
  /** Percentage 0..1. */
  completionRate: number;
  averageComposite: number;
  gradeDistribution: Record<V5Grade, number>;
  suiteDistribution: Record<SuiteId, number>;
}

// ── /admin/exam-instances ────────────────────────────────────────────

export interface V5AdminExamInstance {
  id: string;
  suiteId: SuiteId;
  techStack: string;
  domain: string;
  challengePattern: string;
  archStyle?: string;
  level: string;
  titleZh: string;
  createdAt: number;
  usedCount: number;
  /** 0-100. Null when usedCount is too small to be meaningful. */
  avgCompositeScore: number | null;
  /** 0-1 (how well the exam discriminates grades). Null until sampled. */
  discriminationScore: number | null;
}

export interface V5AdminExamInstanceListParams {
  suiteId?: string;
  techStack?: string;
  domain?: string;
  level?: string;
}

// ── /admin/suites ────────────────────────────────────────────────────

export interface V5AdminSuite {
  id: SuiteId;
  nameZh: string;
  nameEn: string;
  estimatedMinutes: number;
  gradeCap: V5Grade;
  modules: readonly string[];
}

// ── /admin/sessions ──────────────────────────────────────────────────

export interface V5AdminCandidateSnapshot {
  id: string;
  name: string;
  email: string;
}

export interface V5AdminSession {
  id: string;
  suiteId: SuiteId;
  examInstanceId: string;
  candidate: V5AdminCandidateSnapshot;
  status: SessionStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  /** Only present once scored (status = COMPLETED). */
  grade: V5Grade | null;
  composite: number | null;
  shareableLink: string | null;
  orgId?: string;
}

export interface V5AdminListSessionsParams {
  suiteId?: SuiteId;
  status?: SessionStatus;
  orgId?: string;
  page?: number;
  pageSize?: number;
}

export interface V5AdminSessionList {
  items: V5AdminSession[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ── /admin/sessions/create ───────────────────────────────────────────

export interface V5AdminSessionCreateRequest {
  suiteId: SuiteId;
  examInstanceId: string;
  candidate: {
    name: string;
    email: string;
  };
  orgId?: string;
}

export interface V5AdminSessionCreateResponse {
  session: V5AdminSession;
  shareableLink: string;
  /**
   * Opaque Session-scoped token minted at create time. Consumed by the
   * requireCandidate middleware body-token fallback when the candidate has
   * no JWT in the Authorization header. Admin embeds this in the shareable
   * link; never returned by the list or get endpoints.
   */
  candidateToken: string;
  /**
   * Task B-A10-lite — second opaque Session-scoped token minted alongside
   * candidateToken. Authorizes the candidate self-view endpoint
   * (GET /api/candidate/self-view/:sessionId/:privateToken) which is not
   * behind JWT. Distinct from candidateToken to enforce two-token separation
   * (admin-visible exam-token cannot impersonate the candidate's self-view).
   */
  candidateSelfViewToken: string;
  /**
   * Task B-A10-lite — pre-rendered self-view URL the admin can share
   * directly with the candidate post-completion (format:
   * `${origin}/candidate/self-view/${sessionId}/${candidateSelfViewToken}`).
   * Returned alongside `shareableLink`; the two links are intentionally
   * separate because they authorize different audiences.
   */
  selfViewUrl: string;
}

// ── /admin/sessions/:sessionId/links ────────────────────────────────

/**
 * Idempotent read-side for links minted by `POST /admin/sessions/create`.
 * This endpoint never re-mints tokens; missing token columns indicate legacy
 * or corrupted session data and should fail closed server-side.
 */
export interface V5AdminSessionLinksResponse {
  sessionId: string;
  shareableLink: string;
  candidateToken: string;
  candidateSelfViewToken: string;
  selfViewUrl: string;
}

// ── /admin/sessions/:sessionId/report ────────────────────────────────

/**
 * Canonical admin report payload. Mirrors the Frontend `ReportViewModel`
 * (`packages/client/src/report/types.ts:40`) field-for-field so Task 12
 * Layer 2 can alias `AdminSessionReport = V5AdminSessionReport` without
 * shape drift. All component types are already shared.
 */
export interface V5AdminSessionReport {
  sessionId: string;
  candidateName?: string;
  completedAt?: number;
  suite: V5AdminSuite;
  participatingModules: readonly V5ModuleKey[];

  gradeDecision: GradeDecision;
  capabilityProfiles: readonly CapabilityProfile[];
  dimensions: V5DimensionScores;

  signalResults: SignalResults;
  signalDefinitions: readonly V5AdminSignalViewMeta[];

  submissions: Partial<V5Submissions>;

  /** Round 3 调整 5 — only populated for suites that include MB. */
  cursorBehaviorLabel?: CursorBehaviorLabel;
}

/**
 * Frontend-safe signal metadata — `compute` / `fallback` function refs are
 * stripped because they do not survive JSON serialization. Equivalent to
 * `Omit<SignalDefinition, 'compute' | 'fallback'>` and matches the existing
 * Frontend `SignalViewMeta` alias.
 */
export type V5AdminSignalViewMeta = Omit<SignalDefinition, 'compute' | 'fallback'>;

// ── /admin/sessions/:sessionId/profile ───────────────────────────────

/**
 * Task B-A12 — read-side for the candidate pre-exam profile. Consumed by
 * the Frontend Admin report header to surface the candidate's self-reported
 * context (role, tech stack, AI-tool experience) alongside the scoring
 * payload. `consentAcceptedAt` is ISO-8601; `null` means the candidate has
 * not accepted the data-use consent.
 */
export interface V5AdminSessionProfile {
  sessionId: string;
  candidateProfile: CandidateProfile | null;
  consentAcceptedAt: string | null;
}

// ── Generic pagination envelope ─────────────────────────────────────

/**
 * Shared pagination envelope. `V5AdminSessionList` is the concrete
 * instantiation for endpoint 2; other future admin list endpoints reuse
 * this shape.
 */
export interface V5PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
