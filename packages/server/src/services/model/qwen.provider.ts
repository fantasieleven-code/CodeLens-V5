import { env } from '../../config/env.js';
import { BaseOpenAIProvider } from './base-openai-provider.js';

/**
 * DashScope Qwen via the OpenAI-compatible endpoint (/compatible-mode/v1).
 * V5 primary for role 'coding_agent' (MB1 multi-file coding agent).
 * Default model: qwen3-coder-plus.
 */
export class QwenProvider extends BaseOpenAIProvider {
  constructor() {
    super({
      id: 'qwen',
      apiKey: env.DASHSCOPE_API_KEY,
      baseURL: env.DASHSCOPE_BASE_URL,
      defaultModel: env.DASHSCOPE_MODEL,
    });
  }
}
