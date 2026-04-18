/**
 * Admin API contract shapes — Frontend Task 10 mock basis + Backend Task 15
 * implementation contract.
 *
 * Aligned with Steve's Admin API spec (8 endpoints). Where @codelens-v5/shared
 * already defines a canonical type, we reuse it; otherwise we define a local
 * shim that Task 12 will migrate once the shared type lands.
 */

import type {
  SuiteId,
  SessionStatus,
  V5TechStack,
  V5Domain,
  V5ChallengePattern,
  V5ArchStyle,
  V5Level,
  V5Grade,
  GradeDecision,
} from '@codelens-v5/shared';
import type { ReportViewModel } from '../report/types.js';

// ── Shared position shape ─────────────────────────────────────────────

export interface AdminPosition {
  id: string;
  titleZh: string;
  techStack: V5TechStack;
  domain: V5Domain;
  challengePattern: V5ChallengePattern;
  archStyle?: V5ArchStyle;
  /** Short one-line blurb for Step 1 card preview. */
  summary: string;
}

// ── /admin/stats/overview ─────────────────────────────────────────────

export interface AdminStatsOverview {
  totalSessions: number;
  completedSessions: number;
  /** Percentage 0..1. */
  completionRate: number;
  averageComposite: number;
  gradeDistribution: Record<V5Grade, number>;
  suiteDistribution: Record<SuiteId, number>;
}

// ── /admin/exam-instances ─────────────────────────────────────────────

export interface AdminExamInstance {
  id: string;
  suiteId: SuiteId;
  techStack: V5TechStack;
  domain: V5Domain;
  challengePattern: V5ChallengePattern;
  archStyle?: V5ArchStyle;
  level: V5Level;
  titleZh: string;
  createdAt: number;
  usedCount: number;
  /** 0-100. Null when usedCount is too small to be meaningful. */
  avgCompositeScore: number | null;
  /** 0-1 (how well the exam discriminates grades). Null until sampled. */
  discriminationScore: number | null;
}

// ── /admin/suites ─────────────────────────────────────────────────────

export interface AdminSuiteSummary {
  id: SuiteId;
  nameZh: string;
  nameEn: string;
  estimatedMinutes: number;
  gradeCap: V5Grade;
  modules: readonly string[];
}

// ── /admin/sessions ───────────────────────────────────────────────────

export interface AdminCandidateSnapshot {
  id: string;
  name: string;
  email: string;
}

export interface AdminSessionSummary {
  id: string;
  suiteId: SuiteId;
  examInstanceId: string;
  candidate: AdminCandidateSnapshot;
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

export interface ListSessionsParams {
  suiteId?: SuiteId;
  status?: SessionStatus;
  orgId?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedSessions {
  items: AdminSessionSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ── /admin/sessions/create ────────────────────────────────────────────

export interface CreateSessionRequest {
  suiteId: SuiteId;
  examInstanceId: string;
  candidate: {
    name: string;
    email: string;
  };
  orgId?: string;
}

export interface CreateSessionResponse {
  session: AdminSessionSummary;
  shareableLink: string;
}

// ── /admin/sessions/:sessionId/report ────────────────────────────────

/**
 * Task 10 mock returns the same ReportViewModel shape used by ReportViewPage.
 * Task 12 will point this at the real Backend Task 15 endpoint which returns
 * the canonical server scoring output.
 */
export type AdminSessionReport = ReportViewModel;

// ── Suite recommendation (client-side UX, not a server endpoint) ─────

export interface SuiteRecommendation {
  primary: SuiteId;
  alternates: readonly SuiteId[];
  reasoning: string;
}

// ── Wizard draft shape kept on the Create page ──────────────────────

export interface CreateWizardDraft {
  position: AdminPosition | null;
  level: V5Level | null;
  suiteId: SuiteId | null;
  examInstanceId: string | null;
  candidateName: string;
  candidateEmail: string;
}

// ── Re-export for convenience ───────────────────────────────────────

export type { SuiteId, SessionStatus, V5Grade, V5Level, GradeDecision };
