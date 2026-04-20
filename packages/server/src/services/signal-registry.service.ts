/**
 * SignalRegistry — framework for 48 V5 signals (Task A1 raised 47 → 48).
 *
 * Task 4 introduced the framework + Round 3 Part 1 重构 1 return shape
 * (SignalResult with evidence[] / algorithmVersion). Task 8 extends it with:
 *   - 1-retry (500ms backoff) on LLM whitelist failures — errors only,
 *     timeouts go straight to fallback (provider-hung signal, retry unlikely
 *     to help in the immediate window)
 *   - Langfuse trace per LLM signal compute attempt (registry-level trace;
 *     Task 13 can add `generation()` traces inside individual signal compute
 *     bodies when they call the provider directly)
 *   - `registerAllSignals()` scaffold (Task 13 fills the 47 imports)
 *
 * Task 13 plugs in 47 real SignalDefinitions via `registerAllSignals()`.
 */

import type {
  ComputeAllOptions,
  SignalDefinition,
  SignalInput,
  SignalRegistry,
  SignalResult,
  SignalResults,
  V5Dimension,
} from '@codelens-v5/shared';
import { logger } from '../lib/logger.js';
import { getLangfuse } from '../lib/langfuse.js';

const LLM_WHITELIST_TIMEOUT_MS = 30_000;
const LLM_RETRY_DELAY_MS = 500;
const LLM_MAX_RETRIES = 1;

const REGISTRY_FAILURE_VERSION = 'registry@failure';
const REGISTRY_TIMEOUT_VERSION = 'registry@timeout';
const REGISTRY_SKIPPED_VERSION = 'registry@skipped';

type LLMOutcome = 'success' | 'timeout' | 'error';

interface LLMAttemptOutcome {
  kind: LLMOutcome;
  result?: SignalResult;
  error?: unknown;
  durationMs: number;
}

function makeSkippedResult(): SignalResult {
  return {
    value: null,
    evidence: [],
    computedAt: Date.now(),
    algorithmVersion: REGISTRY_SKIPPED_VERSION,
  };
}

function makeFailureResult(algorithmVersion = REGISTRY_FAILURE_VERSION): SignalResult {
  return {
    value: null,
    evidence: [],
    computedAt: Date.now(),
    algorithmVersion,
  };
}

function measureInputSize(input: SignalInput): number {
  try {
    return JSON.stringify({
      submissions: input.submissions,
      examData: input.examData,
      behaviorData: input.behaviorData,
    }).length;
  } catch {
    return -1;
  }
}

export interface SignalRegistryOptions {
  /** Override for tests (fake timers); defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

export class SignalRegistryImpl implements SignalRegistry {
  private readonly signals = new Map<string, SignalDefinition>();
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: SignalRegistryOptions = {}) {
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  register(def: SignalDefinition): void {
    if (this.signals.has(def.id)) {
      throw new Error(`SignalRegistry: duplicate signal id "${def.id}"`);
    }
    this.signals.set(def.id, def);
  }

  async computeAll(input: SignalInput, options?: ComputeAllOptions): Promise<SignalResults> {
    const results: SignalResults = {};
    const participating = new Set<string>(input.participatingModules);
    const excluded = options?.excludeIds ? new Set<string>(options.excludeIds) : null;

    await Promise.all(
      Array.from(this.signals.values()).map(async (def) => {
        if (excluded?.has(def.id)) return;

        if (!this.isParticipating(def, participating)) {
          results[def.id] = makeSkippedResult();
          return;
        }

        if (def.isLLMWhitelist) {
          results[def.id] = await this.runLLMSignal(def, input);
        } else {
          results[def.id] = await this.runPureRuleSignal(def, input);
        }
      }),
    );

    return results;
  }

  getDimensionSignals(dim: V5Dimension): SignalDefinition[] {
    return Array.from(this.signals.values()).filter((s) => s.dimension === dim);
  }

  getSignalCount(): number {
    return this.signals.size;
  }

  listSignals(): SignalDefinition[] {
    return Array.from(this.signals.values());
  }

  private isParticipating(def: SignalDefinition, participating: Set<string>): boolean {
    return participating.has(moduleKeyFromType(def.moduleSource));
  }

  private async runPureRuleSignal(
    def: SignalDefinition,
    input: SignalInput,
  ): Promise<SignalResult> {
    try {
      return await def.compute(input);
    } catch (err) {
      logger.warn('signal compute failed', {
        signalId: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (def.fallback) {
        try {
          return def.fallback(input);
        } catch (fallbackErr) {
          logger.warn('signal fallback failed', {
            signalId: def.id,
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      }
      return makeFailureResult();
    }
  }

  private async runLLMSignal(def: SignalDefinition, input: SignalInput): Promise<SignalResult> {
    const inputSize = measureInputSize(input);

    for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
      const outcome = await this.runLLMAttempt(def, input);
      await this.traceLLMAttempt(def, input, outcome, attempt, inputSize);

      if (outcome.kind === 'success') {
        return outcome.result!;
      }

      if (outcome.kind === 'timeout') {
        // Timeout: no retry (provider hung); go straight to fallback.
        return this.llmFallback(def, input, REGISTRY_TIMEOUT_VERSION);
      }

      // Error: retry once, then fall back.
      if (attempt < LLM_MAX_RETRIES) {
        await this.sleep(LLM_RETRY_DELAY_MS);
      }
    }

    return this.llmFallback(def, input, REGISTRY_FAILURE_VERSION);
  }

  private async runLLMAttempt(
    def: SignalDefinition,
    input: SignalInput,
  ): Promise<LLMAttemptOutcome> {
    const timeoutSentinel = Symbol('timeout');
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(timeoutSentinel), LLM_WHITELIST_TIMEOUT_MS);
    });
    const start = Date.now();

    try {
      const race = await Promise.race([def.compute(input), timeoutPromise]);
      const durationMs = Date.now() - start;
      if (race === timeoutSentinel) {
        logger.warn('signal LLM timeout', { signalId: def.id, durationMs });
        return { kind: 'timeout', durationMs };
      }
      return { kind: 'success', result: race, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      logger.warn('signal LLM compute failed', {
        signalId: def.id,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      });
      return { kind: 'error', error: err, durationMs };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  private async traceLLMAttempt(
    def: SignalDefinition,
    input: SignalInput,
    outcome: LLMAttemptOutcome,
    attempt: number,
    inputSize: number,
  ): Promise<void> {
    try {
      const langfuse = await getLangfuse();
      langfuse.trace({
        name: `signal.${def.id}`,
        sessionId: input.sessionId,
        input: {
          signalId: def.id,
          moduleSource: def.moduleSource,
          dimension: def.dimension,
          inputSize,
        },
        output: {
          value: outcome.result?.value ?? null,
          algorithmVersion: outcome.result?.algorithmVersion,
          outcome: outcome.kind,
          retries: attempt,
        },
        metadata: {
          durationMs: outcome.durationMs,
          isLLMWhitelist: true,
          errorMessage:
            outcome.kind === 'error' && outcome.error instanceof Error
              ? outcome.error.message
              : undefined,
        },
      });
    } catch (err) {
      // Tracing must never break computation.
      logger.debug('langfuse trace failed', {
        signalId: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private llmFallback(
    def: SignalDefinition,
    input: SignalInput,
    failureVersion: string,
  ): SignalResult {
    if (def.fallback) {
      try {
        return def.fallback(input);
      } catch (fallbackErr) {
        logger.warn('signal fallback failed', {
          signalId: def.id,
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
      }
    }
    return makeFailureResult(failureVersion);
  }
}

/**
 * V5ModuleType (uppercase) → V5ModuleKey (camelCase). participatingModules
 * uses camelCase; SignalDefinition.moduleSource uses uppercase. Bridge here.
 */
function moduleKeyFromType(t: string): string {
  switch (t) {
    case 'P0':
      return 'phase0';
    case 'MA':
      return 'moduleA';
    case 'MB':
      return 'mb';
    case 'MC':
      return 'moduleC';
    case 'MD':
      return 'moduleD';
    case 'SE':
      return 'selfAssess';
    default:
      return t;
  }
}

export const signalRegistry: SignalRegistry = new SignalRegistryImpl();
