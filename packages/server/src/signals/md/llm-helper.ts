/**
 * LLM whitelist signal scaffolding — Task 13d.
 *
 * Shared by the 3 MD LLM-graded signals (sDesignDecomposition,
 * sTradeoffArticulation, sAiOrchestrationQuality). The SignalRegistry
 * (services/signal-registry.service.ts) wraps LLM signal calls with:
 *   - 30s timeout  → registry@timeout + fallback
 *   - 1x retry on error (500ms backoff)  → registry@failure + fallback
 *   - Langfuse trace per attempt
 *
 * This helper's job, narrowly: resolve a versioned prompt from
 * PromptRegistry, substitute `{{var}}` placeholders, call ModelProvider
 * (`scoring` role → GLM primary + Claude fallback), and parse the JSON
 * rubric response. Errors thrown here propagate to the registry, which
 * owns retry/fallback policy.
 *
 * Prompt contract: templates in PromptRegistry use `{{variable}}` markers
 * and instruct the model to return:
 *   { "score": 0.0-1.0, "notes": "≤2 sentence rationale" }
 *
 * V5.0 placeholder prompts live in the seed as v1 (prompt-keys.ts L28-30);
 * Task 14 promotes them to production-quality rubrics. Until then, the
 * fallback path is the effective scorer in dev.
 */
import type { SignalEvidence, SignalInput, SignalResult } from '@codelens-v5/shared';
import { logger } from '../../lib/logger.js';
import { modelFactory } from '../../services/model/index.js';
import { promptRegistry } from '../../services/prompt-registry.service.js';
import type { V5PromptKey } from '../../services/prompt-keys.js';
import { finalize } from './types.js';

const SYSTEM_PROMPT =
  'You grade senior software engineer design submissions on a 0-1 scale. ' +
  'Return ONLY a JSON object: {"score": <number 0-1>, "notes": "<≤2 sentences>"}. ' +
  'No preamble, no markdown fences.';

const LLM_TEMPERATURE = 0.1;
const LLM_MAX_TOKENS = 400;

export interface LLMGradeRequest {
  signalId: string;
  promptKey: V5PromptKey;
  input: SignalInput;
  variables: Record<string, string>;
  /** Algorithm version string reported in the SignalResult on the LLM path. */
  llmAlgorithmVersion: string;
  /** Evidence source label (usually "submissions.moduleD.<field>"). */
  evidenceSource: string;
  /** Short excerpt of the graded submission for the evidence payload. */
  evidenceExcerpt: string;
}

export interface LLMGradeParsed {
  score: number | null;
  notes?: string;
}

/** Replace `{{key}}` markers with values from `vars`; missing keys → empty string. */
export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Extract the first balanced JSON object from the LLM response. LLMs sometimes
 * wrap JSON in prose or markdown fences even when told not to; this scan
 * tolerates that by finding the first `{` and matching braces.
 */
export function extractJSON(content: string): string | null {
  const start = content.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return null;
}

export function parseLLMRubric(content: string): LLMGradeParsed {
  const raw = extractJSON(content);
  if (!raw) return { score: null };
  try {
    const obj = JSON.parse(raw) as { score?: unknown; notes?: unknown };
    if (typeof obj.score !== 'number' || !Number.isFinite(obj.score)) return { score: null };
    const clamped = Math.max(0, Math.min(1, obj.score));
    return {
      score: clamped,
      notes: typeof obj.notes === 'string' ? obj.notes : undefined,
    };
  } catch {
    return { score: null };
  }
}

/**
 * Call the LLM scoring chain with the resolved prompt. Returns a SignalResult
 * on success; throws otherwise (the SignalRegistry wraps retry + fallback).
 */
export async function gradeWithLLM(req: LLMGradeRequest): Promise<SignalResult> {
  const template = await promptRegistry.get(req.promptKey);
  const user = substituteVars(template, req.variables);

  const res = await modelFactory.generate('scoring', {
    sessionId: req.input.sessionId,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    temperature: LLM_TEMPERATURE,
    maxTokens: LLM_MAX_TOKENS,
  });

  const parsed = parseLLMRubric(res.content);
  if (parsed.score === null) {
    logger.warn('LLM rubric parse failed', {
      signalId: req.signalId,
      providerId: res.providerId,
      model: res.model,
      latencyMs: res.latencyMs,
    });
    throw new Error(`LLM rubric parse failed for ${req.signalId}`);
  }

  const evidence: SignalEvidence[] = [
    {
      source: req.evidenceSource,
      excerpt: req.evidenceExcerpt,
      contribution: parsed.score,
      triggeredRule: `llm_rubric:${parsed.score.toFixed(2)}`,
    },
    {
      source: 'llm',
      excerpt: `provider=${res.providerId} model=${res.model} latency=${res.latencyMs}ms`,
      contribution: 0,
      triggeredRule: `prompt_key:${req.promptKey}`,
    },
    {
      source: 'llm',
      excerpt: parsed.notes ? parsed.notes.slice(0, 200) : '(no notes)',
      contribution: 0,
      triggeredRule: 'rubric_notes',
    },
  ];

  return finalize(parsed.score, evidence, req.llmAlgorithmVersion);
}
