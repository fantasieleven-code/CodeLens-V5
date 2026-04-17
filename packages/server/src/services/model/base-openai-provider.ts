import OpenAI from 'openai';
import type {
  CompletionMessage,
  CompletionParams,
  CompletionResult,
  CompletionUsage,
  ModelProvider,
  ModelProviderId,
  StreamChunk,
} from '@codelens-v5/shared';

export interface BaseOpenAIProviderConfig {
  id: ModelProviderId;
  apiKey: string | undefined;
  baseURL: string;
  defaultModel: string;
  defaultHeaders?: Record<string, string>;
}

/**
 * OpenAI-compatible provider base. Delegates chat.completions to a configured
 * baseURL / apiKey combo. Each concrete provider (DeepSeek / Claude / GLM /
 * Qwen) is a thin subclass that supplies its endpoint and default model.
 *
 * When no API key is provided, the client stays null and `isAvailable()` is
 * false — ModelFactory then falls through to the next provider in the chain.
 */
export abstract class BaseOpenAIProvider implements ModelProvider {
  readonly id: ModelProviderId;
  readonly defaultModel: string;
  protected readonly client: OpenAI | null;

  constructor(config: BaseOpenAIProviderConfig) {
    this.id = config.id;
    this.defaultModel = config.defaultModel;
    this.client = config.apiKey
      ? new OpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseURL,
          defaultHeaders: config.defaultHeaders,
        })
      : null;
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async generate(params: CompletionParams): Promise<CompletionResult> {
    const client = this.requireClient();
    const model = params.model ?? this.defaultModel;
    const start = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: params.messages.map(toOpenAIMessage),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    });
    const latencyMs = Date.now() - start;
    const choice = response.choices[0];
    return {
      content: choice?.message?.content ?? '',
      providerId: this.id,
      model,
      usage: response.usage ? mapUsage(response.usage) : undefined,
      latencyMs,
    };
  }

  async *stream(params: CompletionParams): AsyncIterable<StreamChunk> {
    const client = this.requireClient();
    const model = params.model ?? this.defaultModel;
    const iterable = await client.chat.completions.create({
      model,
      messages: params.messages.map(toOpenAIMessage),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
      stream: true,
    });
    let lastUsage: CompletionUsage | undefined;
    for await (const chunk of iterable) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield { content: delta, done: false, providerId: this.id };
      }
      if (chunk.usage) lastUsage = mapUsage(chunk.usage);
    }
    yield { content: '', done: true, providerId: this.id, usage: lastUsage };
  }

  private requireClient(): OpenAI {
    if (!this.client) {
      throw new ProviderNotConfiguredError(this.id);
    }
    return this.client;
  }
}

export class ProviderNotConfiguredError extends Error {
  constructor(public readonly providerId: ModelProviderId) {
    super(`Provider ${providerId} is not configured (missing API key)`);
    this.name = 'ProviderNotConfiguredError';
  }
}

function toOpenAIMessage(m: CompletionMessage) {
  return { role: m.role, content: m.content };
}

function mapUsage(u: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}): CompletionUsage {
  return {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    totalTokens: u.total_tokens,
  };
}
