import OpenAI from 'openai';
import { CircuitBreaker } from '../lib/circuit-breaker.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getLangfuse } from '../lib/langfuse.js';
import type { AIRequest, AIResponse, AIRole, AIProvider, AIStreamChunk } from '@codelens-v5/shared';
import { ROLE_PROVIDER_MAP, PROVIDER_CONTEXT_LIMITS, TOKEN_BUDGET } from '@codelens-v5/shared';

// p-limit is ESM-only
let _pLimit: ((concurrency: number) => (fn: () => Promise<unknown>) => Promise<unknown>) | null =
  null;
async function getPLimit() {
  if (!_pLimit) {
    const mod = await import('p-limit');
    _pLimit = mod.default;
  }
  return _pLimit;
}

/**
 * SECURITY: Strip API keys, tokens, and other secrets from error messages
 * before logging. AI SDK errors may include the apiKey in the error body.
 */
function sanitizeErrorMessage(message: string): string {
  // Redact anything that looks like an API key or token (long alphanumeric/base64 strings)
  return message
    .replace(/(?:api[_-]?key|token|authorization|bearer|secret|password|credential)[=: ]*["']?[A-Za-z0-9_\-./+]{16,}["']?/gi, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED]')      // OpenAI-style keys
    .replace(/[A-Za-z0-9]{32,}/g, (match) => {
      // Only redact if it looks like a key (not a URL path or UUID)
      if (/^[0-9a-f-]{36}$/.test(match)) return match; // Preserve UUIDs
      if (match.length > 40) return '[REDACTED]';        // Long strings are likely keys
      return match;
    });
}

interface ProviderConfig {
  provider: AIProvider;
  client: OpenAI;
  model: string;
  breaker: CircuitBreaker;
}

function buildProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  // Tier 1: Doubao Pro (ARK)
  if (env.ARK_API_KEY && env.ARK_MODEL_PRO) {
    providers.push({
      provider: 'doubao-pro',
      client: new OpenAI({
        apiKey: env.ARK_API_KEY,
        baseURL: env.ARK_BASE_URL,
      }),
      model: env.ARK_MODEL_PRO,
      breaker: new CircuitBreaker('doubao-pro'),
    });
  }

  // Tier 1b: Doubao Lite (ARK)
  if (env.ARK_API_KEY && env.ARK_MODEL_LITE) {
    providers.push({
      provider: 'doubao-lite',
      client: new OpenAI({
        apiKey: env.ARK_API_KEY,
        baseURL: env.ARK_BASE_URL,
      }),
      model: env.ARK_MODEL_LITE,
      breaker: new CircuitBreaker('doubao-lite'),
    });
  }

  // Tier 2: DeepSeek
  if (env.DEEPSEEK_API_KEY) {
    providers.push({
      provider: 'deepseek',
      client: new OpenAI({
        apiKey: env.DEEPSEEK_API_KEY,
        baseURL: env.DEEPSEEK_BASE_URL,
      }),
      model: env.DEEPSEEK_MODEL,
      breaker: new CircuitBreaker('deepseek'),
    });
  }

  // Tier 3: Claude (via Anthropic's OpenAI-compatible endpoint)
  // Note: Anthropic provides an OpenAI-compatible API at /v1/ that supports
  // chat.completions.create with stream:true. Requires x-api-key header
  // (handled by OpenAI SDK via apiKey) and model must be a valid Claude model.
  // See: https://docs.anthropic.com/en/api/openai-sdk
  if (env.ANTHROPIC_API_KEY) {
    providers.push({
      provider: 'claude',
      client: new OpenAI({
        apiKey: env.ANTHROPIC_API_KEY,
        baseURL: env.CLAUDE_BASE_URL,
      }),
      model: env.CLAUDE_MODEL,
      breaker: new CircuitBreaker('claude'),
    });
  }

  return providers;
}

let providers: ProviderConfig[] | null = null;
let limiter: ((fn: () => Promise<unknown>) => Promise<unknown>) | null = null;

function getProviders(): ProviderConfig[] {
  if (!providers) {
    providers = buildProviders();
    if (providers.length === 0) {
      logger.warn('No AI providers configured');
    }
  }
  return providers;
}

async function getLimiter() {
  if (!limiter) {
    const pLimit = await getPLimit();
    limiter = pLimit(env.AI_CONCURRENCY_LIMIT) as (
      fn: () => Promise<unknown>,
    ) => Promise<unknown>;
  }
  return limiter;
}

function getProviderChain(role: AIRole): ProviderConfig[] {
  const preferredOrder = ROLE_PROVIDER_MAP[role];
  const all = getProviders();
  const ordered: ProviderConfig[] = [];

  for (const providerName of preferredOrder) {
    const match = all.find((p) => p.provider === providerName);
    if (match) ordered.push(match);
  }

  // Add any remaining providers as final fallback
  for (const p of all) {
    if (!ordered.includes(p)) ordered.push(p);
  }

  return ordered;
}

export const aiRouter = {
  async chat(request: AIRequest): Promise<AIResponse> {
    const limit = await getLimiter();
    return (await limit(async () => {
      const chain = getProviderChain(request.role);
      let lastError: Error | null = null;

      for (const config of chain) {
        if (!config.breaker.isAvailable()) {
          logger.debug(`Skipping ${config.provider} (circuit open)`);
          continue;
        }

        // AR-1: Token overflow pre-check
        if (request.estimatedInputTokens) {
          const limit = PROVIDER_CONTEXT_LIMITS[config.provider];
          if (limit && request.estimatedInputTokens + (request.maxTokens ?? TOKEN_BUDGET.OUTPUT_RESERVED) > limit) {
            logger.warn(`Skipping ${config.provider}: ${request.estimatedInputTokens} + output > ${limit}`);
            continue;
          }
        }

        try {
          const start = Date.now();
          const response = await config.breaker.execute(async () => {
            const completion = await config.client.chat.completions.create({
              model: config.model,
              messages: request.messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              temperature: request.temperature ?? 0.7,
              max_tokens: request.maxTokens ?? TOKEN_BUDGET.OUTPUT_RESERVED,
            });
            return completion;
          });

          const latencyMs = Date.now() - start;
          const choice = response.choices[0];

          // Track with Langfuse
          const langfuse = await getLangfuse();
          langfuse.generation({
            name: `ai-${request.role}`,
            sessionId: request.sessionId,
            model: config.model,
            input: request.messages,
            output: choice?.message?.content,
            metadata: { provider: config.provider, latencyMs },
            usage: response.usage,
          });

          return {
            content: choice?.message?.content || '',
            provider: config.provider,
            model: config.model,
            usage: response.usage
              ? {
                  promptTokens: response.usage.prompt_tokens,
                  completionTokens: response.usage.completion_tokens,
                  totalTokens: response.usage.total_tokens,
                }
              : undefined,
            latencyMs,
          } satisfies AIResponse;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          logger.warn(
            `AI provider ${config.provider} failed: ${sanitizeErrorMessage(lastError.message)}, trying next...`,
          );
        }
      }

      throw lastError || new Error('No AI providers available');
    })) as AIResponse;
  },

  async *chatStream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const chain = getProviderChain(request.role);

    for (const config of chain) {
      if (!config.breaker.isAvailable()) continue;

      // AR-1: Token overflow pre-check
      if (request.estimatedInputTokens) {
        const limit = PROVIDER_CONTEXT_LIMITS[config.provider];
        if (limit && request.estimatedInputTokens + (request.maxTokens ?? TOKEN_BUDGET.OUTPUT_RESERVED) > limit) {
          logger.warn(`Skipping ${config.provider}: ${request.estimatedInputTokens} + output > ${limit}`);
          continue;
        }
      }

      try {
        const stream = await config.breaker.execute(async () => {
          return config.client.chat.completions.create({
            model: config.model,
            messages: request.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? TOKEN_BUDGET.OUTPUT_RESERVED,
            stream: true,
          });
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            yield { content: delta, done: false, provider: config.provider };
          }
        }
        yield { content: '', done: true, provider: config.provider };
        return;
      } catch (error) {
        logger.warn(
          `AI stream ${config.provider} failed: ${sanitizeErrorMessage(error instanceof Error ? error.message : String(error))}`,
        );
      }
    }

    yield { content: 'All AI providers unavailable', done: true };
  },

  getStatus() {
    return getProviders().map((p) => ({
      provider: p.provider,
      model: p.model,
      circuitState: p.breaker.getState(),
    }));
  },
};
