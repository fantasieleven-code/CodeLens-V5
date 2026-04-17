import pLimit from 'p-limit';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { DeepSeekProvider } from './deepseek.provider.js';
import { ClaudeProvider } from './claude.provider.js';
import { GLMProvider } from './glm.provider.js';
import { QwenProvider } from './qwen.provider.js';
import type {
  CompletionParams,
  CompletionResult,
  ModelProvider,
  ModelProviderId,
  ModelRole,
  ProviderStatus,
  StreamChunk,
} from '@codelens-v5/shared';
import { MODEL_ROLE_ROUTING } from '@codelens-v5/shared';

/** Backoff schedule between retry attempts (3 retries total after initial). */
export const RETRY_BACKOFF_MS = [500, 1500, 4500] as const;

type Limiter = ReturnType<typeof pLimit>;

export type ProviderOverrides = Partial<Record<ModelProviderId, ModelProvider>>;


export interface ModelFactoryOptions {
  providers?: ProviderOverrides;
  concurrencyPerProvider?: number;
  /** Override for tests (fake timers); defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/** Only retry transient server/network errors — not 4xx client errors. */
export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    return status >= 500;
  }
  const code = (err as { code?: string }).code;
  if (typeof code === 'string' && /^(ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|EPIPE|ENETUNREACH|ENOTFOUND)$/.test(code)) {
    return true;
  }
  const message = (err as Error).message ?? '';
  return /timeout|fetch failed|socket hang up|network/i.test(message);
}

/** Strip API keys / bearer tokens from error messages before logging. */
export function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/(?:api[_-]?key|token|authorization|bearer|secret|password|credential)[=: ]*["']?[A-Za-z0-9_\-./+]{16,}["']?/gi, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED]');
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    const message = (err as { message?: string }).message;
    if (message) return status ? `${status} ${message}` : message;
    if (status) return `status=${status}`;
  }
  return String(err);
}

/**
 * ModelFactory orchestrates 4 OpenAI-compatible providers behind a role-based
 * routing layer. Each role has a primary provider and a fallback chain; on
 * primary exhaustion the factory walks fallbacks in order. Per-provider rate
 * limiting prevents upstream API overload; retries cover transient errors.
 *
 *   - runtime       → DeepSeek (fallback: Claude)
 *   - generation    → Claude   (fallback: DeepSeek)
 *   - scoring       → GLM      (fallback: Claude)
 *   - coding_agent  → Qwen     (fallback: Claude)
 *
 * Retry: 3 retries with backoff [500, 1500, 4500] ms, only for 5xx + network
 * errors. 4xx errors are surfaced immediately.
 *
 * Streams: no in-provider retry (partial content can't be replayed). On
 * pre-iteration failure the factory falls through to the next provider; on
 * mid-stream failure the error is re-thrown so the caller sees truncation.
 */
export class ModelFactory {
  private readonly providers: Map<ModelProviderId, ModelProvider>;
  private readonly limiters: Map<ModelProviderId, Limiter>;
  private readonly inflight: Map<ModelProviderId, number>;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ModelFactoryOptions = {}) {
    const concurrency = options.concurrencyPerProvider ?? env.AI_CONCURRENCY_LIMIT;
    const overrides = options.providers ?? {};
    this.providers = new Map<ModelProviderId, ModelProvider>([
      ['deepseek', overrides.deepseek ?? new DeepSeekProvider()],
      ['claude', overrides.claude ?? new ClaudeProvider()],
      ['glm', overrides.glm ?? new GLMProvider()],
      ['qwen', overrides.qwen ?? new QwenProvider()],
    ]);
    this.limiters = new Map();
    this.inflight = new Map();
    for (const id of this.providers.keys()) {
      this.limiters.set(id, pLimit(concurrency));
      this.inflight.set(id, 0);
    }
    this.sleep = options.sleep ?? defaultSleep;
  }

  async generate(role: ModelRole, params: CompletionParams): Promise<CompletionResult> {
    const chain = this.resolveChain(role);
    let lastError: unknown = null;
    let hadError = false;
    for (const provider of chain) {
      try {
        return await this.runWithRetry(provider, (p) => p.generate(params));
      } catch (err) {
        lastError = err;
        hadError = true;
        logger.warn(
          `[model] ${provider.id} exhausted for role=${role}: ${sanitizeErrorMessage(describeError(err))}`,
        );
      }
    }
    if (hadError) throw lastError;
    throw new Error(`No available provider for role '${role}'`);
  }

  async *stream(role: ModelRole, params: CompletionParams): AsyncIterable<StreamChunk> {
    const chain = this.resolveChain(role);
    let lastError: unknown = null;
    let hadError = false;
    for (const provider of chain) {
      this.incInflight(provider.id);
      let yielded = false;
      try {
        for await (const chunk of provider.stream(params)) {
          yielded = true;
          yield chunk;
        }
        return;
      } catch (err) {
        lastError = err;
        hadError = true;
        logger.warn(
          `[model] ${provider.id} stream failed: ${sanitizeErrorMessage(describeError(err))}`,
        );
        if (yielded) {
          throw err;
        }
      } finally {
        this.decInflight(provider.id);
      }
    }
    if (hadError) throw lastError;
    throw new Error(`No available provider for role '${role}'`);
  }

  getStatus(): ProviderStatus[] {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      model: p.defaultModel,
      available: p.isAvailable(),
      inflight: this.inflight.get(p.id) ?? 0,
    }));
  }

  private resolveChain(role: ModelRole): ModelProvider[] {
    const config = MODEL_ROLE_ROUTING[role];
    const order: ModelProviderId[] = [config.primary, ...config.fallback];
    const chain: ModelProvider[] = [];
    for (const id of order) {
      const provider = this.providers.get(id);
      if (provider && provider.isAvailable()) {
        chain.push(provider);
      }
    }
    return chain;
  }

  private async runWithRetry<T>(
    provider: ModelProvider,
    op: (p: ModelProvider) => Promise<T>,
  ): Promise<T> {
    const limiter = this.limiters.get(provider.id);
    if (!limiter) {
      throw new Error(`No limiter for provider ${provider.id}`);
    }
    return limiter(async () => {
      this.incInflight(provider.id);
      try {
        let lastErr: unknown = null;
        for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
          try {
            return await op(provider);
          } catch (err) {
            lastErr = err;
            if (attempt === RETRY_BACKOFF_MS.length) break;
            if (!isRetryableError(err)) break;
            const backoff = RETRY_BACKOFF_MS[attempt];
            logger.debug(
              `[model] ${provider.id} retry in ${backoff}ms (attempt ${attempt + 1}/${RETRY_BACKOFF_MS.length})`,
            );
            await this.sleep(backoff);
          }
        }
        throw lastErr;
      } finally {
        this.decInflight(provider.id);
      }
    });
  }

  private incInflight(id: ModelProviderId): void {
    this.inflight.set(id, (this.inflight.get(id) ?? 0) + 1);
  }

  private decInflight(id: ModelProviderId): void {
    this.inflight.set(id, Math.max(0, (this.inflight.get(id) ?? 0) - 1));
  }
}
