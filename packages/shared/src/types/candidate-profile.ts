/**
 * Task B-A12 — CandidateProfile shared type + zod schema.
 *
 * 7-field pre-exam candidate profile collected by the Frontend F-A12 form
 * and persisted to `Session.candidateProfile` (Prisma Json). Admin endpoint
 * GET /admin/sessions/:id/profile reads it back for the report header.
 *
 * Consent flow: the Commit 4 endpoint POST /candidate/profile/submit accepts
 * partial bodies — profile-only, consent-only, or both. The refine() on
 * CandidateProfileSubmitRequestSchema rejects fully-empty submissions so the
 * route can surface a 400 EMPTY_SUBMIT without repeating the check.
 *
 * `primaryAiTool` intentionally includes Chinese-market AI assistants
 * (deepseek / qwen / tongyi_lingma) — the V5 target market is China-first.
 */

import { z } from 'zod';

// ─── currentRole · 7 values ──────────────────────────────────────────
export type CandidateCurrentRole =
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'mobile'
  | 'data'
  | 'devops'
  | 'engineering_manager';

export const CandidateCurrentRoleSchema = z.enum([
  'frontend',
  'backend',
  'fullstack',
  'mobile',
  'data',
  'devops',
  'engineering_manager',
]);

// ─── companySize · 5 values ──────────────────────────────────────────
export type CandidateCompanySize =
  | 'startup' // <20
  | 'small' // 20-100
  | 'medium' // 100-500
  | 'large' // 500-5000
  | 'enterprise'; // 5000+

export const CandidateCompanySizeSchema = z.enum([
  'startup',
  'small',
  'medium',
  'large',
  'enterprise',
]);

// ─── aiToolYears · 0/1/2/3 (3 denotes "3+") ──────────────────────────
export type CandidateAiToolYears = 0 | 1 | 2 | 3;

export const CandidateAiToolYearsSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

// ─── primaryAiTool · 9 values ────────────────────────────────────────
export type CandidatePrimaryAiTool =
  | 'claude_code'
  | 'cursor'
  | 'copilot'
  | 'chatgpt'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'tongyi_lingma'
  | 'other';

export const CandidatePrimaryAiToolSchema = z.enum([
  'claude_code',
  'cursor',
  'copilot',
  'chatgpt',
  'gemini',
  'deepseek',
  'qwen',
  'tongyi_lingma',
  'other',
]);

// ─── dailyAiUsageHours · 4 values ────────────────────────────────────
export type CandidateDailyAiUsageHours = '0_1' | '1_3' | '3_6' | '6_plus';

export const CandidateDailyAiUsageHoursSchema = z.enum([
  '0_1',
  '1_3',
  '3_6',
  '6_plus',
]);

// ─── CandidateProfile · 7 fields ─────────────────────────────────────

export interface CandidateProfile {
  /** Integer 0-50. */
  yearsOfExperience: number;
  currentRole: CandidateCurrentRole;
  /** 2-5 items, each non-empty and ≤ 50 chars. */
  primaryTechStack: string[];
  companySize: CandidateCompanySize;
  aiToolYears: CandidateAiToolYears;
  primaryAiTool: CandidatePrimaryAiTool;
  dailyAiUsageHours: CandidateDailyAiUsageHours;
}

export const CandidateProfileSchema = z.object({
  yearsOfExperience: z.number().int().min(0).max(50),
  currentRole: CandidateCurrentRoleSchema,
  primaryTechStack: z.array(z.string().min(1).max(50)).min(2).max(5),
  companySize: CandidateCompanySizeSchema,
  aiToolYears: CandidateAiToolYearsSchema,
  primaryAiTool: CandidatePrimaryAiToolSchema,
  dailyAiUsageHours: CandidateDailyAiUsageHoursSchema,
});

// ─── Submit request · profile / consent both optional ────────────────

/**
 * Commit 4 endpoint (`POST /candidate/profile/submit`) accepts:
 *   - profile only         — F-A12 form submits profile without consent
 *   - consentAccepted only — standalone Consent dispatch
 *   - both together        — F-A12 submits profile + consent at once
 *
 * Fully empty body → refine fails → route surfaces 400 EMPTY_SUBMIT.
 */
export const CandidateProfileSubmitRequestSchema = z
  .object({
    profile: CandidateProfileSchema.optional(),
    consentAccepted: z.boolean().optional(),
    /**
     * Auth-fallback token consumed by requireCandidate middleware when no JWT
     * is present in the Authorization header. Frontend callers without a JWT
     * include this in the body; handlers can ignore it (middleware consumes).
     */
    sessionToken: z.string().min(1).optional(),
  })
  .refine(
    (data) => data.profile !== undefined || data.consentAccepted !== undefined,
    { message: 'At least one of profile or consentAccepted must be provided' },
  );

export type CandidateProfileSubmitRequest = z.infer<
  typeof CandidateProfileSubmitRequestSchema
>;

export interface CandidateSessionStatusResponse {
  ok: true;
  sessionId: string;
  status: string;
  consentAcceptedAt: string | null;
  profileSubmitted: boolean;
}
