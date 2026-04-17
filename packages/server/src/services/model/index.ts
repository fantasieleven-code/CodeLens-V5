export { BaseOpenAIProvider, ProviderNotConfiguredError } from './base-openai-provider.js';
export type { BaseOpenAIProviderConfig } from './base-openai-provider.js';
export { DeepSeekProvider } from './deepseek.provider.js';
export { ClaudeProvider } from './claude.provider.js';
export { GLMProvider } from './glm.provider.js';
export { QwenProvider } from './qwen.provider.js';
export {
  ModelFactory,
  RETRY_BACKOFF_MS,
  isRetryableError,
  sanitizeErrorMessage,
} from './model-factory.js';
export type { ModelFactoryOptions, ProviderOverrides } from './model-factory.js';

import { ModelFactory } from './model-factory.js';

/** Singleton used by routes and services. Tests should construct their own. */
export const modelFactory = new ModelFactory();
