/**
 * SignalRegistry — Task 4 框架(含 Round 3 重构 1 预埋:返回 SignalResult)。
 *
 * 本 Task 不实现任何具体信号,Task 13 负责把 47 个信号落地为 SignalDefinition 注册进来。
 *
 * 职责:
 * - register(def) 存 SignalDefinition
 * - computeAll(input) 调度所有已注册信号,异常/超时/未参与模块统一降级
 * - LLM 白名单信号超时 = SANDBOX/LLM timeout 30s,触发 fallback(纯规则降级)
 * - 普通信号异常时日志 warn,走 fallback 或 null 结果
 *
 * 所有结果按 Round 3 重构 1 契约返回 SignalResult(含 evidence[] + algorithmVersion)。
 */

import type {
  SignalDefinition,
  SignalInput,
  SignalRegistry,
  SignalResult,
  SignalResults,
  V5Dimension,
} from '@codelens-v5/shared';
import { logger } from '../lib/logger.js';

const LLM_WHITELIST_TIMEOUT_MS = 30_000;

const REGISTRY_FAILURE_VERSION = 'registry@failure';
const REGISTRY_TIMEOUT_VERSION = 'registry@timeout';
const REGISTRY_SKIPPED_VERSION = 'registry@skipped';

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

export class SignalRegistryImpl implements SignalRegistry {
  private readonly signals = new Map<string, SignalDefinition>();

  register(def: SignalDefinition): void {
    if (this.signals.has(def.id)) {
      throw new Error(`SignalRegistry: duplicate signal id "${def.id}"`);
    }
    this.signals.set(def.id, def);
  }

  async computeAll(input: SignalInput): Promise<SignalResults> {
    const results: SignalResults = {};
    const participating = new Set<string>(input.participatingModules);

    await Promise.all(
      Array.from(this.signals.values()).map(async (def) => {
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
    const timeoutSentinel = Symbol('timeout');
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<typeof timeoutSentinel>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(timeoutSentinel), LLM_WHITELIST_TIMEOUT_MS);
    });

    try {
      const race = await Promise.race([def.compute(input), timeoutPromise]);
      if (race === timeoutSentinel) {
        logger.warn('signal LLM timeout — falling back', { signalId: def.id });
        if (def.fallback) {
          try {
            return def.fallback(input);
          } catch (fallbackErr) {
            logger.warn('signal fallback failed after timeout', {
              signalId: def.id,
              error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
            });
          }
        }
        return makeFailureResult(REGISTRY_TIMEOUT_VERSION);
      }
      return race;
    } catch (err) {
      logger.warn('signal LLM compute failed', {
        signalId: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (def.fallback) {
        try {
          return def.fallback(input);
        } catch (fallbackErr) {
          logger.warn('signal fallback failed after error', {
            signalId: def.id,
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      }
      return makeFailureResult();
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }
}

/**
 * SignalDefinition.moduleSource 存的是 V5ModuleType(大写),participatingModules 是
 * V5ModuleKey(camelCase)。这里把大写映射回 camelCase 以便参与判定。
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
