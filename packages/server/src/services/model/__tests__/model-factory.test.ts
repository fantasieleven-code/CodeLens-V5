import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    DEEPSEEK_API_KEY: 'fake',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DEEPSEEK_MODEL: 'deepseek-chat',
    ANTHROPIC_API_KEY: 'fake',
    CLAUDE_BASE_URL: 'https://api.anthropic.com/v1/',
    CLAUDE_MODEL: 'claude-test',
    GLM_API_KEY: 'fake',
    GLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4/',
    GLM_DEFAULT_MODEL: 'glm-4-plus',
    DASHSCOPE_API_KEY: 'fake',
    DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    DASHSCOPE_MODEL: 'qwen3-coder-plus',
    AI_CONCURRENCY_LIMIT: 8,
  },
}));

// OpenAI SDK is imported transitively through the provider subclasses' ctors.
// We replace it with a no-op constructor so provider instantiation is free.
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: vi.fn() } };
  },
}));

import { ModelFactory, isRetryableError, RETRY_BACKOFF_MS } from '../model-factory.js';
import type {
  CompletionParams,
  CompletionResult,
  ModelProvider,
  ModelProviderId,
  StreamChunk,
} from '@codelens-v5/shared';

interface StubProvider extends ModelProvider {
  generate: Mock;
  stream: Mock;
}

function stubProvider(
  id: ModelProviderId,
  opts: { available?: boolean; defaultModel?: string } = {},
): StubProvider {
  const { available = true, defaultModel = `${id}-default` } = opts;
  return {
    id,
    defaultModel,
    isAvailable: () => available,
    generate: vi.fn(
      async (params: CompletionParams): Promise<CompletionResult> => ({
        content: `${id}:${params.messages[0]?.content ?? ''}`,
        providerId: id,
        model: defaultModel,
        latencyMs: 1,
      }),
    ),
    stream: vi.fn(async function* (): AsyncIterable<StreamChunk> {
      yield { content: `${id}-chunk`, done: false, providerId: id };
      yield { content: '', done: true, providerId: id };
    }),
  };
}

const P: CompletionParams = { messages: [{ role: 'user', content: 'hi' }] };

describe('ModelFactory — role routing', () => {
  it('runtime role goes to DeepSeek by default', async () => {
    const deepseek = stubProvider('deepseek');
    const claude = stubProvider('claude');
    const factory = new ModelFactory({ providers: { deepseek, claude } });
    const result = await factory.generate('runtime', P);
    expect(result.providerId).toBe('deepseek');
    expect(deepseek.generate).toHaveBeenCalledOnce();
    expect(claude.generate).not.toHaveBeenCalled();
  });

  it('generation role goes to Claude by default', async () => {
    const deepseek = stubProvider('deepseek');
    const claude = stubProvider('claude');
    const factory = new ModelFactory({ providers: { deepseek, claude } });
    const result = await factory.generate('generation', P);
    expect(result.providerId).toBe('claude');
  });

  it('scoring role goes to GLM by default', async () => {
    const glm = stubProvider('glm');
    const factory = new ModelFactory({ providers: { glm } });
    const result = await factory.generate('scoring', P);
    expect(result.providerId).toBe('glm');
  });

  it('coding_agent role goes to Qwen by default', async () => {
    const qwen = stubProvider('qwen');
    const factory = new ModelFactory({ providers: { qwen } });
    const result = await factory.generate('coding_agent', P);
    expect(result.providerId).toBe('qwen');
  });
});

describe('ModelFactory — fallback chain', () => {
  it('falls through to Claude when DeepSeek is unavailable (runtime)', async () => {
    const deepseek = stubProvider('deepseek', { available: false });
    const claude = stubProvider('claude');
    const factory = new ModelFactory({ providers: { deepseek, claude } });
    const result = await factory.generate('runtime', P);
    expect(result.providerId).toBe('claude');
    expect(deepseek.generate).not.toHaveBeenCalled();
    expect(claude.generate).toHaveBeenCalledOnce();
  });

  it('falls through to DeepSeek when Claude exhausts retries (generation)', async () => {
    const claude = stubProvider('claude');
    claude.generate.mockRejectedValue({ status: 503 });
    const deepseek = stubProvider('deepseek');
    const sleeps: number[] = [];
    const factory = new ModelFactory({
      providers: { claude, deepseek },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const result = await factory.generate('generation', P);
    expect(result.providerId).toBe('deepseek');
    // Claude tried 4 times (initial + 3 retries)
    expect(claude.generate).toHaveBeenCalledTimes(RETRY_BACKOFF_MS.length + 1);
    expect(sleeps).toEqual([...RETRY_BACKOFF_MS]);
  });

  it('throws when all providers in chain are unavailable', async () => {
    const glm = stubProvider('glm', { available: false });
    const claude = stubProvider('claude', { available: false });
    const factory = new ModelFactory({ providers: { glm, claude } });
    await expect(factory.generate('scoring', P)).rejects.toThrow(
      /No available provider for role 'scoring'/,
    );
  });
});

describe('ModelFactory — retry behaviour', () => {
  it('retries 5xx up to 3 times with [500, 1500, 4500] backoff then succeeds', async () => {
    const calls = vi
      .fn()
      .mockRejectedValueOnce({ status: 503, message: 'unavailable' })
      .mockRejectedValueOnce({ status: 502 })
      .mockRejectedValueOnce({ status: 500 })
      .mockResolvedValueOnce({
        content: 'finally',
        providerId: 'deepseek',
        model: 'deepseek-chat',
        latencyMs: 1,
      });
    const provider: ModelProvider = {
      id: 'deepseek',
      defaultModel: 'deepseek-chat',
      isAvailable: () => true,
      generate: calls,
      stream: vi.fn(),
    };
    const sleeps: number[] = [];
    const factory = new ModelFactory({
      providers: { deepseek: provider },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    const result = await factory.generate('runtime', P);
    expect(result.content).toBe('finally');
    expect(calls).toHaveBeenCalledTimes(4);
    expect(sleeps).toEqual([500, 1500, 4500]);
  });

  it('does NOT retry 4xx errors', async () => {
    const calls = vi.fn().mockRejectedValue({ status: 400, message: 'bad request' });
    const provider: ModelProvider = {
      id: 'deepseek',
      defaultModel: 'deepseek-chat',
      isAvailable: () => true,
      generate: calls,
      stream: vi.fn(),
    };
    const sleeps: number[] = [];
    const factory = new ModelFactory({
      providers: {
        deepseek: provider,
        // Disable fallback so the 4xx error surfaces directly.
        claude: stubProvider('claude', { available: false }),
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await expect(factory.generate('runtime', P)).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('retries network errors (ECONNRESET)', async () => {
    const calls = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce({
        content: 'ok',
        providerId: 'deepseek',
        model: 'deepseek-chat',
        latencyMs: 1,
      });
    const provider: ModelProvider = {
      id: 'deepseek',
      defaultModel: 'deepseek-chat',
      isAvailable: () => true,
      generate: calls,
      stream: vi.fn(),
    };
    const factory = new ModelFactory({
      providers: { deepseek: provider },
      sleep: async () => {},
    });
    const result = await factory.generate('runtime', P);
    expect(result.content).toBe('ok');
    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('exhausts all retries and surfaces the last error when still failing', async () => {
    const err = { status: 503, message: 'still down' };
    const calls = vi.fn().mockRejectedValue(err);
    const provider: ModelProvider = {
      id: 'glm',
      defaultModel: 'glm-4-plus',
      isAvailable: () => true,
      generate: calls,
      stream: vi.fn(),
    };
    const factory = new ModelFactory({
      providers: { glm: provider, claude: stubProvider('claude', { available: false }) },
      sleep: async () => {},
    });
    await expect(factory.generate('scoring', P)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveBeenCalledTimes(RETRY_BACKOFF_MS.length + 1);
  });
});

describe('ModelFactory — stream behaviour', () => {
  it('streams chunks from the primary provider for the role', async () => {
    const glm = stubProvider('glm');
    const factory = new ModelFactory({ providers: { glm } });
    const chunks: string[] = [];
    for await (const chunk of factory.stream('scoring', P)) {
      chunks.push(chunk.content);
    }
    expect(chunks).toEqual(['glm-chunk', '']);
    expect(glm.stream).toHaveBeenCalledOnce();
  });

  it('falls through to the fallback provider when the primary fails before any chunk', async () => {
    const qwen = stubProvider('qwen');
    qwen.stream.mockImplementation(() => ({
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<StreamChunk>> {
            return Promise.reject(new Error('qwen down'));
          },
        };
      },
    }));
    const claude = stubProvider('claude');
    const factory = new ModelFactory({ providers: { qwen, claude } });
    const chunks: string[] = [];
    for await (const chunk of factory.stream('coding_agent', P)) {
      chunks.push(chunk.content);
    }
    expect(chunks).toEqual(['claude-chunk', '']);
  });

  it('re-throws mid-stream errors without falling through', async () => {
    const glm = stubProvider('glm');
    glm.stream.mockImplementation(async function* () {
      yield { content: 'partial', done: false, providerId: 'glm' };
      throw new Error('midstream boom');
    });
    const claude = stubProvider('claude');
    const factory = new ModelFactory({ providers: { glm, claude } });
    const received: string[] = [];
    await expect(async () => {
      for await (const chunk of factory.stream('scoring', P)) {
        received.push(chunk.content);
      }
    }).rejects.toThrow('midstream boom');
    expect(received).toEqual(['partial']);
    // Claude must not be invoked after partial content
    expect(claude.stream).not.toHaveBeenCalled();
  });
});

describe('ModelFactory — rate limit + status', () => {
  it('serializes inflight calls to the same provider up to concurrency', async () => {
    const deepseek = stubProvider('deepseek');
    const resolvers: Array<() => void> = [];
    deepseek.generate.mockImplementation(
      () =>
        new Promise<CompletionResult>((resolve) => {
          resolvers.push(() =>
            resolve({
              content: 'ok',
              providerId: 'deepseek',
              model: 'deepseek-chat',
              latencyMs: 1,
            }),
          );
        }),
    );
    const factory = new ModelFactory({
      providers: { deepseek },
      concurrencyPerProvider: 2,
    });
    const calls = [
      factory.generate('runtime', P),
      factory.generate('runtime', P),
      factory.generate('runtime', P),
    ];
    // Yield to the event loop so the limiter has a chance to dispatch.
    await new Promise((r) => setImmediate(r));
    expect(deepseek.generate).toHaveBeenCalledTimes(2);
    // Resolve the first two so the third gets dispatched
    resolvers[0]();
    resolvers[1]();
    await new Promise((r) => setImmediate(r));
    expect(deepseek.generate).toHaveBeenCalledTimes(3);
    resolvers[2]();
    await Promise.all(calls);
  });

  it('getStatus reports one entry per constructed provider', () => {
    const factory = new ModelFactory({
      providers: {
        deepseek: stubProvider('deepseek'),
        claude: stubProvider('claude', { available: false }),
        glm: stubProvider('glm'),
        qwen: stubProvider('qwen'),
      },
    });
    const status = factory.getStatus();
    expect(status).toHaveLength(4);
    expect(status.find((s) => s.id === 'claude')?.available).toBe(false);
    expect(status.find((s) => s.id === 'deepseek')?.available).toBe(true);
  });
});

describe('isRetryableError', () => {
  it('retries 5xx', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });
  it('does not retry 4xx', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 429 })).toBe(false);
  });
  it('retries known network codes', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
  });
  it('does not retry unknown non-network errors', () => {
    expect(isRetryableError(new Error('plain boom'))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });
  it('retries when message looks like a timeout', () => {
    expect(isRetryableError(new Error('request timeout'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });
});
