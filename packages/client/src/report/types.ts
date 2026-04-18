import type {
  CapabilityProfile,
  CursorBehaviorLabel,
  GradeDecision,
  SignalDefinition,
  SignalResults,
  SuiteDefinition,
  V5DimensionScores,
  V5ModuleKey,
  V5Submissions,
} from '@codelens-v5/shared';

/**
 * Round 3 调整 5 的 Cursor 行为标签(Layer 1 段内结论）— full_stack /
 * ai_engineer / deep_dive 套件才有此字段;architect / quick_screen
 * 的 reportSections 不含 cursor-behavior-label。
 *
 * Task 17 Gap #5: `CursorBehaviorLabel` 类型本体已迁到
 * `@codelens-v5/shared/types/v5-scoring.ts`;此处仅 re-export 保持
 * 现有 client 代码的 import path 不破坏。
 */
export type { CursorBehaviorLabel, CursorBehaviorLabelId } from '@codelens-v5/shared';

/**
 * 信号元数据(前端只读副本）。Server 侧的 SignalDefinition 带 compute/fallback
 * 函数无法序列化给 client，因此 Backend Task 15 的 summary API 会返回精简版，
 * 等价于 `Omit<SignalDefinition, 'compute' | 'fallback'>`。
 */
export type SignalViewMeta = Omit<SignalDefinition, 'compute' | 'fallback'>;

export type ReportLayer = 'summary' | 'detail';

/**
 * 完整的报告视图模型。
 *
 * Task 2 期间由 `__fixtures__/` 下 3 档 fixture 构造；Backend Task 15
 * Admin API(`GET /admin/reports/:sessionId/summary`)就位后由 API 返回。
 * 字段形状必须保持和 shared types / scoring.service 的输出一致。
 */
export interface ReportViewModel {
  sessionId: string;
  candidateName?: string;
  completedAt?: number;
  suite: SuiteDefinition;
  participatingModules: readonly V5ModuleKey[];

  gradeDecision: GradeDecision;
  capabilityProfiles: readonly CapabilityProfile[];
  dimensions: V5DimensionScores;

  signalResults: SignalResults;
  signalDefinitions: readonly SignalViewMeta[];

  submissions: Partial<V5Submissions>;

  /** Round 3 调整 5，仅参与了 MB 的套件才有；其他情况为 undefined。 */
  cursorBehaviorLabel?: CursorBehaviorLabel;
}
