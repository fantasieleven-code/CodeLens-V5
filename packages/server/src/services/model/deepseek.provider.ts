import { env } from '../../config/env.js';
import { BaseOpenAIProvider } from './base-openai-provider.js';

export class DeepSeekProvider extends BaseOpenAIProvider {
  constructor() {
    super({
      id: 'deepseek',
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
      defaultModel: env.DEEPSEEK_MODEL,
    });
  }
}
