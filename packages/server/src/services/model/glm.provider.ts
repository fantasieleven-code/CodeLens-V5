import { env } from '../../config/env.js';
import { BaseOpenAIProvider } from './base-openai-provider.js';

/**
 * Zhipu GLM via the OpenAI-compatible endpoint at /api/paas/v4/. Used as the
 * V5 scoring / structured-output primary (role: 'scoring').
 * Default model: glm-4-plus.
 */
export class GLMProvider extends BaseOpenAIProvider {
  constructor() {
    super({
      id: 'glm',
      apiKey: env.GLM_API_KEY,
      baseURL: env.GLM_BASE_URL,
      defaultModel: env.GLM_DEFAULT_MODEL,
    });
  }
}
