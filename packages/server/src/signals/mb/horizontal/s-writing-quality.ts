/**
 * sWritingQuality — Task 13c (MB horizontal, communication dimension).
 *
 * Cross-stage writing quality: measures the candidate's overall written
 * communication across planning / standards / chat prompts. Separate from
 * sRulesQuality (which scores RULES.md alone) — this aggregates.
 *
 * V5-native (communication dimension; no explicit V4 formula):
 *
 *   corpus = planning.decomposition + dependencies + fallbackStrategy
 *            + standards.rulesContent + agentContent
 *            + chatEvents[].prompt
 *   totalChars = corpus length
 *   lengthScore      = clamp01(totalChars / 1200)
 *   structureScore   = (has bullet lists ? 0.5 : 0) + (has line breaks ? 0.5 : 0)
 *   vocabScore       = clamp01(distinctWords / 120)
 *
 *   sWritingQuality = length × 0.4 + structure × 0.3 + vocab × 0.3
 *
 * Fallback: null when no text inputs available.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult, wordCount } from '../types.js';

const ALGORITHM_VERSION = 'sWritingQuality@v1';
const LENGTH_WEIGHT = 0.4;
const STRUCTURE_WEIGHT = 0.3;
const VOCAB_WEIGHT = 0.3;
const LENGTH_TARGET = 1200;
const VOCAB_TARGET = 120;

function distinctTokenCount(text: string): number {
  if (!text) return 0;
  const tokens = text
    .toLowerCase()
    .split(/[\s,.。、；;:\n\r\t!?()[\]{}"'`]+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens).size;
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const mb = input.submissions.mb;
  if (!mb) return nullResult(ALGORITHM_VERSION);

  const parts: string[] = [];
  if (mb.planning?.decomposition) parts.push(mb.planning.decomposition);
  if (mb.planning?.dependencies) parts.push(mb.planning.dependencies);
  if (mb.planning?.fallbackStrategy) parts.push(mb.planning.fallbackStrategy);
  if (mb.standards?.rulesContent) parts.push(mb.standards.rulesContent);
  if (mb.standards?.agentContent) parts.push(mb.standards.agentContent);
  for (const e of mb.editorBehavior?.chatEvents ?? []) {
    if (e.prompt) parts.push(e.prompt);
  }

  const corpus = parts.join('\n').trim();
  if (corpus.length === 0) return nullResult(ALGORITHM_VERSION);

  const lengthScore = clamp01(corpus.length / LENGTH_TARGET);

  const hasBullets = /^\s*[-*\d]\s|^\s*\d+[\.\)]/m.test(corpus);
  const hasLineBreaks = corpus.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 3;
  const structureScore = (hasBullets ? 0.5 : 0) + (hasLineBreaks ? 0.5 : 0);

  const vocabSize = distinctTokenCount(corpus);
  const cjkWeight = wordCount(corpus) / Math.max(1, corpus.split(/\s+/).filter(Boolean).length);
  const vocabScore = clamp01((vocabSize * Math.max(1, cjkWeight)) / VOCAB_TARGET);

  const value =
    lengthScore * LENGTH_WEIGHT + structureScore * STRUCTURE_WEIGHT + vocabScore * VOCAB_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.planning+standards+chatEvents',
      excerpt: `total_chars=${corpus.length} parts=${parts.length}`,
      contribution: lengthScore * LENGTH_WEIGHT,
      triggeredRule: `length:${corpus.length}/${LENGTH_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `bullets=${hasBullets} line_breaks=${hasLineBreaks}`,
      contribution: structureScore * STRUCTURE_WEIGHT,
      triggeredRule: `structure:${structureScore.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `distinct_tokens=${vocabSize} cjk_weight=${cjkWeight.toFixed(2)}`,
      contribution: vocabScore * VOCAB_WEIGHT,
      triggeredRule: `vocab:${vocabSize}/${VOCAB_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `len=${lengthScore.toFixed(2)} struct=${structureScore.toFixed(2)} vocab=${vocabScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sWritingQuality: SignalDefinition = {
  id: 'sWritingQuality',
  dimension: V5Dimension.COMMUNICATION,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as WRITING_QUALITY_VERSION };
