import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } };
  },
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    DEEPSEEK_API_KEY: 'fake-deepseek-key',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    DEEPSEEK_MODEL: 'deepseek-chat',
    ANTHROPIC_API_KEY: undefined,
    CLAUDE_BASE_URL: 'https://api.anthropic.com/v1/',
    CLAUDE_MODEL: 'claude-test',
    GLM_API_KEY: 'fake-glm-key',
    GLM_BASE_URL: 'https://open.bigmodel.cn/api/paas/v4/',
    GLM_DEFAULT_MODEL: 'glm-4-plus',
    DASHSCOPE_API_KEY: 'fake-dashscope-key',
    DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    DASHSCOPE_MODEL: 'qwen3-coder-plus',
    AI_CONCURRENCY_LIMIT: 4,
  },
}));

import { DeepSeekProvider } from '../deepseek.provider.js';
import { ClaudeProvider } from '../claude.provider.js';
import { GLMProvider } from '../glm.provider.js';
import { QwenProvider } from '../qwen.provider.js';
import { ProviderNotConfiguredError } from '../base-openai-provider.js';

async function* makeStream(chunks: Array<{ content: string; usage?: unknown }>) {
  for (const c of chunks) {
    yield { choices: [{ delta: { content: c.content } }], usage: c.usage };
  }
}

describe('BaseOpenAIProvider (via DeepSeek subclass)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('isAvailable is true when apiKey is present', () => {
    expect(new DeepSeekProvider().isAvailable()).toBe(true);
  });

  it('isAvailable is false when apiKey is missing (Claude in this test env)', () => {
    expect(new ClaudeProvider().isAvailable()).toBe(false);
  });

  it('generate maps OpenAI response to CompletionResult', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'hello world' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    });
    const provider = new DeepSeekProvider();
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.3,
      maxTokens: 100,
    });
    expect(result).toMatchObject({
      content: 'hello world',
      providerId: 'deepseek',
      model: 'deepseek-chat',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    });
    expect(typeof result.latencyMs).toBe('number');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-chat',
        temperature: 0.3,
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );
  });

  it('generate honours per-call model override', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'x' } }],
    });
    await new DeepSeekProvider().generate({
      messages: [{ role: 'user', content: 'go' }],
      model: 'deepseek-reasoner',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'deepseek-reasoner' }),
    );
  });

  it('generate throws ProviderNotConfiguredError when apiKey is missing', async () => {
    const provider = new ClaudeProvider();
    await expect(
      provider.generate({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toBeInstanceOf(ProviderNotConfiguredError);
  });

  it('stream yields content deltas followed by a done marker', async () => {
    mockCreate.mockResolvedValueOnce(
      makeStream([
        { content: 'Hel' },
        { content: 'lo' },
        {
          content: '!',
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
      ]),
    );
    const provider = new GLMProvider();
    const received: Array<{ content: string; done: boolean }> = [];
    for await (const chunk of provider.stream({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      received.push({ content: chunk.content, done: chunk.done });
    }
    expect(received).toEqual([
      { content: 'Hel', done: false },
      { content: 'lo', done: false },
      { content: '!', done: false },
      { content: '', done: true },
    ]);
    const last = received[received.length - 1];
    expect(last).toEqual({ content: '', done: true });
  });

  it('stream propagates the final usage block on the done chunk', async () => {
    mockCreate.mockResolvedValueOnce(
      makeStream([
        { content: 'ok' },
        {
          content: '',
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        },
      ]),
    );
    const provider = new QwenProvider();
    const chunks: unknown[] = [];
    for await (const chunk of provider.stream({
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      chunks.push(chunk);
    }
    const done = chunks[chunks.length - 1] as {
      done: boolean;
      usage?: { promptTokens: number };
    };
    expect(done.done).toBe(true);
    expect(done.usage).toEqual({ promptTokens: 2, completionTokens: 1, totalTokens: 3 });
  });
});
