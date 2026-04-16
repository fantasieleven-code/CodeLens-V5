/**
 * Parse Volcano RTC CustomLLM callbacks.
 * Pure functions — no side effects, no DB/Redis dependencies.
 *
 * Handles 3 possible ExternalPromptsForLLM injection patterns:
 *   Pattern A: Extra system message(s) in messages array
 *   Pattern B: Appended to the first system message content
 *   Pattern C: Separate top-level field (e.g., external_prompts, context)
 */

import type { AIMessage } from '@codelens-v5/shared';

/** Known non-standard fields that might carry ExternalPromptsForLLM */
const EXTERNAL_PROMPT_FIELDS = [
  'external_prompts',
  'external_prompts_for_llm',
  'ExternalPromptsForLLM',
  'context',
  'extra_context',
  'system_context',
];

const STANDARD_FIELDS = new Set([
  'messages', 'stream', 'temperature', 'max_tokens', 'top_p',
  'model', 'n', 'stop', 'presence_penalty', 'frequency_penalty',
  'tools', 'tool_choice', 'response_format', 'seed', 'user',
]);

export interface ParsedCallback {
  systemPrompt: string;
  externalPrompts: string[];
  conversationHistory: AIMessage[];
  latestUserMessage: string;
  injectionPattern: 'A' | 'B' | 'C' | 'none';
  raw: {
    messageCount: number;
    systemMessageCount: number;
    extraFields: string[];
    headers: Record<string, string>;
  };
}

/**
 * Parse incoming Volcano RTC callback, auto-detecting injection pattern.
 */
export function parseCallback(
  body: Record<string, unknown>,
  headers: Record<string, string>,
  knownSystemPrompt?: string,
): ParsedCallback {
  const messages = (body.messages || []) as Array<{ role: string; content: string }>;

  const systemMsgs = messages.filter((m) => m.role === 'system');
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  const extraFields = Object.keys(body).filter((k) => !STANDARD_FIELDS.has(k));
  const externalFieldValues: string[] = [];
  for (const field of extraFields) {
    if (EXTERNAL_PROMPT_FIELDS.includes(field)) {
      const val = body[field];
      if (typeof val === 'string') externalFieldValues.push(val);
      else if (Array.isArray(val)) externalFieldValues.push(...val.map(String));
    }
  }

  let injectionPattern: 'A' | 'B' | 'C' | 'none' = 'none';
  let systemPrompt = '';
  const externalPrompts: string[] = [];

  // Pattern C: External prompts in a separate top-level field
  if (externalFieldValues.length > 0) {
    injectionPattern = 'C';
    systemPrompt = systemMsgs[0]?.content || '';
    externalPrompts.push(...externalFieldValues);
  }
  // Pattern A: Multiple system messages
  else if (systemMsgs.length > 1) {
    injectionPattern = 'A';
    systemPrompt = systemMsgs[0].content;
    for (let i = 1; i < systemMsgs.length; i++) {
      externalPrompts.push(systemMsgs[i].content);
    }
  }
  // Pattern B: Single system message with appended content
  else if (
    systemMsgs.length === 1 &&
    knownSystemPrompt &&
    systemMsgs[0].content.length > knownSystemPrompt.length &&
    systemMsgs[0].content.startsWith(knownSystemPrompt)
  ) {
    injectionPattern = 'B';
    systemPrompt = knownSystemPrompt;
    const appended = systemMsgs[0].content.slice(knownSystemPrompt.length).trim();
    if (appended) externalPrompts.push(appended);
  }
  // No injection
  else {
    systemPrompt = systemMsgs[0]?.content || '';
  }

  const conversationHistory: AIMessage[] = conversationMsgs.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const latestUserMessage =
    conversationHistory.filter((m) => m.role === 'user').pop()?.content || '';

  return {
    systemPrompt,
    externalPrompts,
    conversationHistory,
    latestUserMessage,
    injectionPattern,
    raw: {
      messageCount: messages.length,
      systemMessageCount: systemMsgs.length,
      extraFields,
      headers,
    },
  };
}

/**
 * Build enhanced prompt incorporating external prompts
 */
export function buildEnhancedSystemPrompt(parsed: ParsedCallback, sessionContext?: string): string {
  const parts = [parsed.systemPrompt];

  if (parsed.externalPrompts.length > 0) {
    parts.push('\n\n--- Dynamic Context (Injected) ---');
    for (const ep of parsed.externalPrompts) {
      parts.push(ep);
    }
  }

  if (sessionContext) {
    parts.push('\n\n--- Session Context ---');
    parts.push(sessionContext);
  }

  return parts.join('\n');
}
