/**
 * V5 scoring result — Task 17 (V5.0 release gate).
 *
 * V5 自成体系的 scoring result shape; V3/V4 legacy `ScoringResult` in
 * `scoring.ts` 保持不动以兼容 archived reports. This file is the
 * end-to-end return type of `scoreSession()` orchestrator and the
 * frontend consumption surface for scoring data.
 *
 * Gap #4 (Task 17): Option β — additive new type alongside legacy.
 * Gap #5 (Task 17): `CursorBehaviorLabel` migrated from
 *   `packages/client/src/report/types.ts` to here so server +
 *   client share the same definition. Actual `computeCursorBehaviorLabel`
 *   remains V5.1 backlog per `v5-design-clarifications.md` L640-700.
 */

import { z } from 'zod';

import type { CapabilityProfile } from './v5-capability-profile.js';
import type { V5DimensionScores, V5Grade } from './v5-dimensions.js';
import type {
  GradeBoundaryAnalysis,
  GradeConfidence,
  GradeDangerFlag,
} from './v5-grade.js';
import type { SignalResults } from './v5-signals.js';
import type { V5ModuleKey } from '../constants/module-keys.js';
import type { V5ModuleType } from '../constants/module-keys.js';
import type { SuiteId } from './v5-suite.js';
import type { V5Submissions } from './v5-submissions.js';

/**
 * Cursor-mode behavior label surfaced on full_stack / ai_engineer /
 * deep_dive reports (Round 3 调整 5). Moved from
 * `packages/client/src/report/types.ts` to shared so `V5ScoringResult`
 * can reference it without crossing the workspace boundary.
 */
export type CursorBehaviorLabelId =
  | '深思熟虑型'
  | '熟练接受型'
  | '快速粘贴型'
  | '无序混乱型';

export interface CursorBehaviorLabel {
  label: CursorBehaviorLabelId;
  summary: string;
  evidenceSignals: string[];
}

/**
 * Flat input to the orchestrator — Task 17 Gap #3 (Option γ).
 *
 * Keeps the orchestrator DB-free so the Golden Path can instantiate it
 * directly from a fixture bundle. A production wrapper (`scoreSessionById`
 * — future Task 15 owner) hydrates this from `SessionService` +
 * `ExamDataService` then delegates here.
 */
export interface ScoreSessionInput {
  sessionId: string;
  suiteId: SuiteId;
  submissions: V5Submissions;
  examData: Partial<Record<V5ModuleType, Record<string, unknown>>>;
  participatingModules: readonly V5ModuleKey[];
  behaviorData?: Record<string, unknown>;
}

/**
 * End-to-end scoring result.
 *
 * - `composite` / `dimensions` are 0-100 (signals upstream stay 0-1;
 *   conversion lives at `computeDimensions` boundary).
 * - `signals` is the raw per-signal SignalResult map (Round 3 重构 1
 *   shape: value / evidence / computedAt / algorithmVersion).
 * - `cursorBehaviorLabel` is optional — V5.0 returns undefined pending
 *   V5.1 implementation of `computeCursorBehaviorLabel`.
 */
export interface V5ScoringResult {
  grade: V5Grade;
  composite: number;
  dimensions: V5DimensionScores;
  confidence: GradeConfidence;
  boundaryAnalysis: GradeBoundaryAnalysis;
  reasoning: string;
  dangerFlag?: GradeDangerFlag;
  signals: SignalResults;
  capabilityProfiles: CapabilityProfile[];
  cursorBehaviorLabel?: CursorBehaviorLabel;
}

/**
 * V5ScoringResult runtime zod schema — Task B-A10-lite β ratified.
 *
 * Consumer-facing drift defense for `Session.scoringResult` Json reads.
 * Strict at top level so cached JSON cannot silently grow new report-facing
 * fields without an explicit shared contract update. Nested signal /
 * boundary-analysis payloads remain passthrough because they carry
 * algorithm-specific evidence details and consumers read their stable shells.
 *
 * V5.0.5 cleanup note: Admin report now parses this schema before response
 * assembly; scoring-hydrator cached-result reads are the remaining boundary.
 */
export const V5ScoringResultSchema = z.object({
  grade: z.enum(['D', 'C', 'B', 'B+', 'A', 'S', 'S+']),
  composite: z.number(),
  dimensions: z.record(z.string(), z.number().nullable()),
  confidence: z.enum(['high', 'medium', 'low']),
  boundaryAnalysis: z.object({}).passthrough(),
  reasoning: z.string(),
  dangerFlag: z.object({}).passthrough().optional(),
  signals: z.record(z.string(), z.object({}).passthrough()),
  capabilityProfiles: z.array(
    z.object({
      id: z.enum([
        'independent_delivery',
        'ai_collaboration',
        'system_thinking',
        'learning_agility',
      ]),
      nameZh: z.string(),
      nameEn: z.string(),
      score: z.number(),
      label: z.enum(['自主', '熟练', '有潜力', '待发展']),
      dimensionBreakdown: z.record(z.string(), z.number()),
      evidenceSignals: z.array(z.string()),
      description: z.string(),
    }),
  ),
  cursorBehaviorLabel: z.object({}).passthrough().optional(),
}).strict();
