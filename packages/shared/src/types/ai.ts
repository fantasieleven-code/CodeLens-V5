export type AIRole = 'interviewer' | 'assistant' | 'scoring' | 'probing';

export type AIProvider = 'doubao-pro' | 'doubao-lite' | 'deepseek' | 'claude';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  role: AIRole;
  messages: AIMessage[];
  sessionId: string;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  estimatedInputTokens?: number;
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  provider?: AIProvider;
  channel?: 'interviewer' | 'assistant';
}

export interface TokenBudget {
  systemPrompt: number;
  codeSnapshot: number;
  cpSummaries: number;
  currentDialog: number;
  assistantSummary: number;
  outputReserved: number;
  total: number;
  providerLimit: number;
  utilizationPct: number;
}

export interface StructuredMemoryEntry {
  timestamp: number;
  checkpoint: number;
  category: 'bug_found' | 'bug_fixed' | 'question_answered' | 'hallucination_detected' | 'key_insight' | 'signal';
  content: string;
}

export interface CodeSnapshotState {
  baseSnapshot: Map<string, string>;
  currentState: Map<string, string>;
  baseCheckpoint: number;
}

export const ROLE_PROVIDER_MAP: Record<AIRole, AIProvider[]> = {
  interviewer: ['doubao-pro', 'deepseek', 'claude'],
  assistant: ['doubao-lite', 'doubao-pro', 'deepseek'],
  scoring: ['deepseek', 'claude', 'doubao-pro'],
  probing: ['claude', 'deepseek', 'doubao-pro'],
};
