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
 * 单个信号的定义。每个信号一个文件，在 `packages/server/src/signals/{module}/s-xxx.ts` 放独立模块。
 *
 * compute 返回 null 表示信号不适用（e.g. MD 信号在 quick_screen 不参与）。
 * fallback 为 LLM 白名单信号的纯规则降级；纯规则信号可以省略。
 */
export interface SignalDefinition {
  id: string;
  dimension: V5Dimension;
  /** 该信号属于哪个模块（V5ModuleType）。 */
  moduleSource: V5ModuleType;
  /** 是否是 LLM 白名单信号（仅 MD 有 3 个）。非白名单信号永远纯规则计算。 */
  isLLMWhitelist: boolean;
  compute: (input: SignalInput) => Promise<number | null>;
  /** 仅 LLM 白名单信号需要：超时/失败时的纯规则降级。 */
  fallback?: (input: SignalInput) => number | null;
}

export type SignalResults = Record<string, number | null>;

export interface SignalRegistry {
  register(def: SignalDefinition): void;
  /** 计算所有已注册信号；未参与模块对应信号直接返回 null。 */
  computeAll(input: SignalInput): Promise<SignalResults>;
  getDimensionSignals(dim: V5Dimension): SignalDefinition[];
  getSignalCount(): number;
  listSignals(): SignalDefinition[];
}
