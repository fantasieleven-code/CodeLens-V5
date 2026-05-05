/**
 * Admin API client-only shim types — Task 12 Layer 2 slim-down.
 *
 * The server-contract types (V5AdminStatsOverview, V5AdminExamInstance,
 * V5AdminSuite, V5AdminSession, V5AdminListSessionsParams, V5AdminSessionList,
 * V5AdminSessionCreateRequest, V5AdminSessionCreateResponse, V5AdminSessionLinksResponse,
 * V5AdminSessionReport, V5AdminCandidateSnapshot, V5AdminPosition,
 * V5AdminSuiteRecommendation) live in
 * `packages/shared/src/types/v5-admin-api.ts` under Backend Task 15a and are
 * imported directly from `@codelens-v5/shared` by Frontend admin code.
 *
 * What remains here is the create-session wizard draft state. Position and
 * suite-recommendation contracts live in shared as `V5AdminPosition` and
 * `V5AdminSuiteRecommendation`.
 */

import type { SuiteId, V5AdminPosition, V5Level } from '@codelens-v5/shared';

// ── Wizard draft shape kept on the Create page ──────────────────────

export interface CreateWizardDraft {
  position: V5AdminPosition | null;
  level: V5Level | null;
  suiteId: SuiteId | null;
  examInstanceId: string | null;
  candidateName: string;
  candidateEmail: string;
}
