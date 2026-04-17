/**
 * sPromptQuality — Task 13c (MB Stage 2 execution).
 *
 * Measures quality of candidate's Chat prompts. A junior developer says
 * "help me fix this bug"; a senior says "decrement_inventory in
 * InventoryRepository has a TOCTOU race — show me a SETNX-based lock."
 *
 * backend-agent-tasks.md L99 groups sPromptQuality with Stage 2 exec, pure
 * rule aiEngineering, no explicit weights. V5-native:
 *
 *   lengthScore    = min(1, meanPromptChars / 80)      target ~80 chars
 *   specificityScore = fraction of prompts that include a scaffold identifier
 *                      OR a numeric threshold OR an API-looking token
 *   contextScore   = fraction of prompts that include a causal / qualifier
 *                    marker (because / so that / 当 / 如果 / after)
 *
 *   sPromptQuality = length × 0.3 + specificity × 0.4 + context × 0.3
 *
 * Fallback: null when editorBehavior.chatEvents empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sPromptQuality@v1';
const LENGTH_WEIGHT = 0.3;
const SPECIFICITY_WEIGHT = 0.4;
const CONTEXT_WEIGHT = 0.3;
const LENGTH_TARGET_CHARS = 80;

const SPECIFICITY_PATTERNS: readonly RegExp[] = [
  /\b[A-Z][a-zA-Z0-9]{2,}\b/, // ClassName / method refs
  /\d+\s*(ms|sec|seconds?|%|lines?)/i,
  /\b\w+\(\)/, // function-call-shaped tokens
  /`[^`]+`/, // backticks = concrete symbol
];

const CONTEXT_MARKERS: readonly string[] = [
  'because',
  'so that',
  'when',
  'if',
  'after',
  'before',
  '因为',
  '所以',
  '当',
  '如果',
  '之后',
  '之前',
  '由于',
  '为了',
];

function countMatches(text: string, patterns: readonly RegExp[]): number {
  let n = 0;
  for (const p of patterns) if (p.test(text)) n += 1;
  return n;
}

function hasAnyMarker(text: string, markers: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m.toLowerCase()) || text.includes(m));
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const chatEvents = input.submissions.mb?.editorBehavior?.chatEvents;
  if (!chatEvents || chatEvents.length === 0) return nullResult(ALGORITHM_VERSION);

  const prompts = chatEvents.map((e) => (e.prompt ?? '').trim()).filter((p) => p.length > 0);
  if (prompts.length === 0) return nullResult(ALGORITHM_VERSION);

  const meanChars = prompts.reduce((acc, p) => acc + p.length, 0) / prompts.length;
  const lengthScore = clamp01(meanChars / LENGTH_TARGET_CHARS);

  const specificHits = prompts.filter((p) => countMatches(p, SPECIFICITY_PATTERNS) >= 1).length;
  const specificityScore = specificHits / prompts.length;

  const contextHits = prompts.filter((p) => hasAnyMarker(p, CONTEXT_MARKERS)).length;
  const contextScore = contextHits / prompts.length;

  const value =
    lengthScore * LENGTH_WEIGHT + specificityScore * SPECIFICITY_WEIGHT + contextScore * CONTEXT_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.chatEvents[].prompt',
      excerpt: truncate(prompts.slice(0, 3).join(' | ')),
      contribution: lengthScore * LENGTH_WEIGHT,
      triggeredRule: `mean_chars:${meanChars.toFixed(0)}/${LENGTH_TARGET_CHARS}`,
    },
    {
      source: 'submissions.mb.editorBehavior.chatEvents[].prompt',
      excerpt: `specific_prompts=${specificHits}/${prompts.length}`,
      contribution: specificityScore * SPECIFICITY_WEIGHT,
      triggeredRule: `specificity_ratio:${specificityScore.toFixed(2)}`,
    },
    {
      source: 'submissions.mb.editorBehavior.chatEvents[].prompt',
      excerpt: `context_prompts=${contextHits}/${prompts.length}`,
      contribution: contextScore * CONTEXT_WEIGHT,
      triggeredRule: `context_ratio:${contextScore.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `len=${lengthScore.toFixed(2)} spec=${specificityScore.toFixed(2)} ctx=${contextScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sPromptQuality: SignalDefinition = {
  id: 'sPromptQuality',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as PROMPT_QUALITY_VERSION };
