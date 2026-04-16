import { logger } from './logger.js';
import type { AIMessage, TokenBudget } from '@codelens-v5/shared';
import { TOKEN_BUDGET } from '@codelens-v5/shared';

// Lazy-initialized tiktoken encoder
let encoder: { encode: (text: string) => number[] } | null = null;
let encoderFailed = false;

async function getEncoder() {
  if (encoder) return encoder;
  if (encoderFailed) return null;

  try {
    const { encodingForModel } = await import('js-tiktoken');
    encoder = encodingForModel('gpt-4o');
    return encoder;
  } catch (error) {
    encoderFailed = true;
    logger.warn('js-tiktoken failed to load, using character-based estimation', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Count tokens in a string.
 * Uses tiktoken (cl100k_base) when available, falls back to char/3.5 estimation.
 */
export function countTokens(content: string): number {
  if (!content) return 0;

  // Use synchronous path if encoder is already loaded
  if (encoder) {
    return encoder.encode(content).length;
  }

  // Fallback: ~3.5 chars per token for CJK-mixed content
  return Math.ceil(content.length / 3.5);
}

/**
 * Initialize the encoder asynchronously. Call once at startup.
 */
export async function initTokenCounter(): Promise<void> {
  await getEncoder();
}

/**
 * Count tokens across an array of messages.
 * Each message adds ~4 tokens overhead (role, formatting).
 */
export function countMessagesTokens(messages: AIMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += countTokens(msg.content) + 4; // 4 tokens per-message overhead
  }
  return total;
}

/**
 * Estimate token budget utilization for a request.
 */
export function estimateBudget(parts: {
  systemPrompt: string;
  codeSnapshot: string;
  cpSummaries: string;
  currentDialog: AIMessage[];
  assistantSummary: string;
  providerLimit: number;
}): TokenBudget {
  const systemPrompt = countTokens(parts.systemPrompt);
  const codeSnapshot = countTokens(parts.codeSnapshot);
  const cpSummaries = countTokens(parts.cpSummaries);
  const currentDialog = countMessagesTokens(parts.currentDialog);
  const assistantSummary = countTokens(parts.assistantSummary);
  const outputReserved = TOKEN_BUDGET.OUTPUT_RESERVED;

  const total = systemPrompt + codeSnapshot + cpSummaries + currentDialog + assistantSummary + outputReserved;
  const utilizationPct = parts.providerLimit > 0 ? (total / parts.providerLimit) * 100 : 0;

  return {
    systemPrompt,
    codeSnapshot,
    cpSummaries,
    currentDialog,
    assistantSummary,
    outputReserved,
    total,
    providerLimit: parts.providerLimit,
    utilizationPct,
  };
}
