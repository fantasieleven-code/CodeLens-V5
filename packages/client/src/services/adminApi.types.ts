/**
 * Admin API client-only shim types — Task 12 Layer 2 slim-down.
 *
 * The server-contract types (V5AdminStatsOverview, V5AdminExamInstance,
 * V5AdminSuite, V5AdminSession, V5AdminListSessionsParams, V5AdminSessionList,
 * V5AdminSessionCreateRequest, V5AdminSessionCreateResponse, V5AdminSessionLinksResponse,
 * V5AdminSessionReport, V5AdminCandidateSnapshot) live in
 * `packages/shared/src/types/v5-admin-api.ts` under Backend Task 15a and are
 * imported directly from `@codelens-v5/shared` by Frontend admin code.
 *
 * What remains here are 3 client-only UX helpers that the server doesn't know
 * about: the Step 1 wizard card shape, the suite recommendation result, and
 * the wizard draft state.
 */

import type {
  SuiteId,
  V5TechStack,
  V5Domain,
  V5ChallengePattern,
  V5ArchStyle,
  V5Level,
} from '@codelens-v5/shared';

// ── Wizard Step 1 position card ──────────────────────────────────────

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
