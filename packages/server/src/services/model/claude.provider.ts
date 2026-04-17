import { env } from '../../config/env.js';
import { BaseOpenAIProvider } from './base-openai-provider.js';

/**
 * Claude via Anthropic's OpenAI-compatible endpoint (/v1/). The OpenAI SDK
 * auto-sets the auth header; no `anthropic-version` header is required for
 * the OpenAI-compat surface.
 * @see https://docs.anthropic.com/en/api/openai-sdk
 */
export class ClaudeProvider extends BaseOpenAIProvider {
  constructor() {
    super({
      id: 'claude',
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.CLAUDE_BASE_URL,
      defaultModel: env.CLAUDE_MODEL,
    });
  }
}
