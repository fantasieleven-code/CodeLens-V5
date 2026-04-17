/**
 * V5 ModelProvider contract (Task 6).
 *
 * Replaces V4 `AIProvider` / `AIRole` / `ROLE_PROVIDER_MAP` with an explicit
 * 4-provider lineup (DeepSeek / Claude / GLM / Qwen) and role-based routing.
 *
 * V4 types (`AIProvider`, `AIRole`, `AIRequest`, `AIResponse`, `AIStreamChunk`)
 * remain exported for archived V4 code compatibility (see
 * `packages/server/src/services/archive/v4/ai-router.service.ts`).
 */

export type ModelProviderId = 'deepseek' | 'claude' | 'glm' | 'qwen';

/**
 * Capability-oriented routing dimension. Callers request a role, ModelFactory
 * resolves the role to a primary ModelProvider with an explicit fallback chain.
 *
 *  - runtime      : low-latency agent turn (< 2s target) — primary DeepSeek
 *  - generation   : strong-instruction generation w/ CO-STAR — primary Claude
 *  - scoring      : structured output / rubric scoring — primary GLM
 *  - coding_agent : MB1 multi-file coding agent — primary Qwen (qwen3-coder-plus)
 */
export type ModelRole = 'runtime' | 'generation' | 'scoring' | 'coding_agent';

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionParams {
  messages: CompletionMessage[];
  /** Optional session id propagated to tracing (Langfuse). */
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional per-call model override; defaults to provider's `defaultModel`. */
  model?: string;
}

export interface CompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  content: string;
  providerId: ModelProviderId;
  model: string;
  usage?: CompletionUsage;
  latencyMs: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  providerId?: ModelProviderId;
  /** Present on the final chunk when the upstream API returned usage. */
  usage?: CompletionUsage;
}

export interface ModelProvider {
  readonly id: ModelProviderId;
  readonly defaultModel: string;
  /** True when the provider has credentials wired up (API key present). */
  isAvailable(): boolean;
  generate(params: CompletionParams): Promise<CompletionResult>;
  stream(params: CompletionParams): AsyncIterable<StreamChunk>;
}

export interface ModelRoleConfig {
  primary: ModelProviderId;
  fallback: ModelProviderId[];
}

/**
 * Role → primary + fallback chain. Fallback order is tried sequentially when
 * the primary provider is unavailable or fails after retry exhaustion.
 *
 * Scope: MB coding_agent and MD scoring stay on their specialist providers;
 * runtime and generation swap as each other's fallback so an outage on either
 * still produces a working turn.
 */
export const MODEL_ROLE_ROUTING: Record<ModelRole, ModelRoleConfig> = {
  runtime:      { primary: 'deepseek', fallback: ['claude'] },
  generation:   { primary: 'claude',   fallback: ['deepseek'] },
  scoring:      { primary: 'glm',      fallback: ['claude'] },
  coding_agent: { primary: 'qwen',     fallback: ['claude'] },
};

/** Per-provider health snapshot returned by ModelFactory.getStatus(). */
export interface ProviderStatus {
  id: ModelProviderId;
  model: string;
  available: boolean;
  inflight: number;
  circuitOpen?: boolean;
}
