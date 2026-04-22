import type { V5Dimension } from './v5-dimensions.js';
import type { SuiteId } from './v5-suite.js';
import type { V5ModuleKey, V5ModuleType } from '../constants/module-keys.js';
import type { V5AgentExecution, V5Submissions } from './v5-submissions.js';

/**
 * Signal 计算的输入上下文。
 *
 * 多 Agent 预留 5：agentExecutions 字段 V5.0 恒为 undefined，V5.2 加 4 个新信号（sAgentDiversity /
 * sContextChaining / sReviewDelegation / sOrchestratorPattern）时才会使用；V5.2 启用时
 * 只需 register 4 个新 SignalDefinition，不改 registry 架构。
 */
export interface SignalInput {
  sessionId: string;
  suiteId: SuiteId;
  submissions: V5Submissions;
  /** 按 V5ModuleType 索引的 ExamModule.moduleSpecific 数据（e.g. examData.MA.schemes）。 */
  examData: Partial<Record<V5ModuleType, Record<string, unknown>>>;
  behaviorData?: Record<string, unknown>;
  /** 当前 session 参与的模块 key 列表（决定未参与模块的信号返回 null）。 */
  participatingModules: readonly V5ModuleKey[];
  /** V5.2 多 Agent 预留：V5.0 恒为 undefined。 */
  agentExecutions?: V5AgentExecution[];
}

/**
 * 单条证据——Round 3 重构 1(Evidence Trace)。
 * compute 命中的每条规则生成一条 evidence;一个 SignalResult 最多保留 5 条。
 */
export interface SignalEvidence {
  /** 证据来源路径,如 'submissions.moduleA.round1.reasoning' / 'submissions.mb.editorBehavior.aiCompletionEvents[3]'。 */
  source: string;
  /** 原文片段或事件摘要,长度 > 200 字符时截断并加省略号。 */
  excerpt: string;
  /** 该证据对 value 的贡献分量,可正可负。 */
  contribution: number;
  /** 命中的规则名,如 'has_quantitative_marker' / 'stance_maintained'。 */
  triggeredRule?: string;
  /** V5.0 A1 · meta-signal 专用方向标注(sCalibration);V5.1 A8 potentialJunior pattern consumer。 */
  direction?: 'overconfident' | 'underconfident';
}

/**
 * 单个信号的计算结果——Round 3 重构 1(Evidence Trace)。
 *
 * value 为 null 表示信号不适用(e.g. MD 信号在 quick_screen 不参与),此时 evidence 允许为空。
 * 非 null 的 value 必须伴随 >= 1 条 evidence,上限 5 条。
 */
export interface SignalResult {
  value: number | null;
  evidence: SignalEvidence[];
  /** epoch ms,computeAll 写入。 */
  computedAt: number;
  /** 算法版本,如 'sArgumentResilience@v1'。 */
  algorithmVersion: string;
}

/**
 * 单个信号的定义。每个信号一个文件，在 `packages/server/src/signals/{module}/s-xxx.ts` 放独立模块。
 *
 * compute 的 SignalResult.value === null 表示信号不适用（e.g. MD 信号在 quick_screen 不参与）。
 * fallback 为 LLM 白名单信号的纯规则降级；纯规则信号可以省略。
 */
export interface SignalDefinition {
  id: string;
  dimension: V5Dimension;
  /** 该信号属于哪个模块（V5ModuleType）。 */
  moduleSource: V5ModuleType;
  /** 是否是 LLM 白名单信号（仅 MD 有 3 个）。非白名单信号永远纯规则计算。 */
  isLLMWhitelist: boolean;
  /**
   * V5.0 A1 · signature widened with optional `partialComposite` (0-100) to
   * support meta-signals that read the 47-signal pass-1 composite. 47 普通
   * signals 仍按 1-arg 实装 — TS 允许 narrower function assignable to wider
   * type. 仅 META_SIGNAL_IDS 里的 signal 读第 2 arg(sCalibration 起)。
   */
  compute: (input: SignalInput, partialComposite?: number) => Promise<SignalResult>;
  /** 仅 LLM 白名单信号需要：超时/失败时的纯规则降级。 */
  fallback?: (input: SignalInput) => SignalResult;
}

export type SignalResults = Record<string, SignalResult>;

/** V5.0 A1 · `computeAll` 可选过滤 · 给 orchestrator two-pass excludeIds meta-signal。 */
export interface ComputeAllOptions {
  /** 跳过这些 signal id(不 compute · 不出现在 SignalResults 结果里)。 */
  excludeIds?: readonly string[];
}

export interface SignalRegistry {
  register(def: SignalDefinition): void;
  /**
   * 计算所有已注册信号；未参与模块对应信号直接返回 value === null。
   *
   * V5.0 A1 · `options.excludeIds` 让 orchestrator pass-1 跳过 meta-signals
   * (e.g. sCalibration)· pass-2 由 `computeMetaSignals` seam 单独调度。
   * 未知 id 被静默忽略(不 throw)· 与 participatingModules skip 语义对齐。
   */
  computeAll(input: SignalInput, options?: ComputeAllOptions): Promise<SignalResults>;
  getDimensionSignals(dim: V5Dimension): SignalDefinition[];
  getSignalCount(): number;
  listSignals(): SignalDefinition[];
}

/** 证据上限——Round 3 重构 1。 */
export const SIGNAL_EVIDENCE_LIMIT = 5;

/**
 * Task A14a · Non-deterministic signal ids — LLM whitelist (3 signals, all MD).
 *
 * These signals call an external model and therefore tolerate variance between
 * runs; the A14a pure-rule reliability suite skips them. The remaining 45
 * registered signals (48 total − 3 LLM) MUST return deep-equal results on
 * repeated calls given identical input — enforced by
 * `packages/server/src/__tests__/reliability/pure-rule-signals.test.ts`.
 *
 * Adding a new LLM-whitelist signal requires updating this set AND the
 * matching size assertion in `v5-signals.test.ts` — the hard-coded count is
 * an intentional tripwire against silent drift. V5.0.5 Task A14b will layer
 * variance monitoring on top of this set.
 */
export const NON_DETERMINISTIC_SIGNAL_IDS = new Set([
  'sAiOrchestrationQuality',
  'sDesignDecomposition',
  'sTradeoffArticulation',
] as const);

export type NonDeterministicSignalId =
  typeof NON_DETERMINISTIC_SIGNAL_IDS extends Set<infer T> ? T : never;
