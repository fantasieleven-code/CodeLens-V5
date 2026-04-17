/**
 * sAiOrchestrationQuality — Task 13d (MD LLM whitelist).
 *
 * LLM-graded quality of the candidate's AI-orchestration prompts: did they
 * articulate goals, constraints, division of labor, and failure handling
 * when drafting prompts for downstream AI agents? Dimension: AI_ENGINEERING.
 *
 * Prompt key: md.llm_whitelist.ai_orch.
 *
 * Pure-rule fallback (V5-native — spec only lists the policy, not the
 * formula):
 *
 *   promptCount       = aiOrchestrationPrompts.length
 *   countScore        = clamp01(promptCount / 3)                  // target 3 prompts
 *   avgVolume         = mean(textVolume per prompt)
 *   lengthScore       = clamp01(avgVolume / 40)                   // substantive prompt ~40 units
 *   structureScore    = fraction of prompts that reference at least 1
 *                       structure marker (goal / constraint / output / step …)
 *
 *   fallback = count × 0.3 + length × 0.3 + structure × 0.4
 *
 * Fallback null when `submissions.moduleD.aiOrchestrationPrompts` missing
 * or empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { gradeWithLLM } from './llm-helper.js';
import { clamp01, finalize, nullResult, textVolume, truncate } from './types.js';

const LLM_VERSION = 'sAiOrchestrationQuality@v1_llm';
const FALLBACK_VERSION = 'sAiOrchestrationQuality@v1_fallback';
const PROMPT_KEY = 'md.llm_whitelist.ai_orch';
const SIGNAL_ID = 'sAiOrchestrationQuality';

const PROMPT_COUNT_TARGET = 3;
const AVG_VOLUME_TARGET = 40;
const COUNT_WEIGHT = 0.3;
const LENGTH_WEIGHT = 0.3;
const STRUCTURE_WEIGHT = 0.4;

const STRUCTURE_MARKERS = [
  '目标',
  'goal',
  'objective',
  '任务',
  'task',
  '约束',
  'constraint',
  '限制',
  '输入',
  'input',
  '输出',
  'output',
  '步骤',
  'step',
  'if',
  '如果',
  '当',
  'when',
  '禁止',
  '必须',
  'must',
  "don't",
  'do not',
];

function hasStructureMarker(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return STRUCTURE_MARKERS.some((m) => lower.includes(m.toLowerCase()) || prompt.includes(m));
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const md = input.submissions.moduleD;
  const prompts = md?.aiOrchestrationPrompts ?? [];
  if (prompts.length === 0) return nullResult(LLM_VERSION);

  const excerpt = truncate(prompts.map((p, i) => `${i + 1}. ${p}`).join('\n'));

  return gradeWithLLM({
    signalId: SIGNAL_ID,
    promptKey: PROMPT_KEY,
    input,
    variables: {
      aiOrchestrationPrompts: excerpt,
      subModules: md!.subModules.map((m) => m.name).join(', '),
    },
    llmAlgorithmVersion: LLM_VERSION,
    evidenceSource: 'submissions.moduleD.aiOrchestrationPrompts',
    evidenceExcerpt: excerpt,
  });
}

function fallback(input: SignalInput): SignalResult {
  const md = input.submissions.moduleD;
  const prompts = md?.aiOrchestrationPrompts ?? [];
  if (prompts.length === 0) return nullResult(FALLBACK_VERSION);

  const promptCount = prompts.length;
  const countScore = clamp01(promptCount / PROMPT_COUNT_TARGET);

  const volumes = prompts.map((p) => textVolume(p));
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / promptCount;
  const lengthScore = clamp01(avgVolume / AVG_VOLUME_TARGET);

  const structuredHits = prompts.filter(hasStructureMarker).length;
  const structureScore = structuredHits / promptCount;

  const value =
    countScore * COUNT_WEIGHT +
    lengthScore * LENGTH_WEIGHT +
    structureScore * STRUCTURE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleD.aiOrchestrationPrompts',
      excerpt: truncate(prompts.join(' | ')),
      contribution: countScore * COUNT_WEIGHT,
      triggeredRule: `prompt_count:${promptCount}/${PROMPT_COUNT_TARGET}`,
    },
    {
      source: 'submissions.moduleD.aiOrchestrationPrompts',
      excerpt: `avg_volume=${avgVolume.toFixed(1)} target=${AVG_VOLUME_TARGET}`,
      contribution: lengthScore * LENGTH_WEIGHT,
      triggeredRule: `length:${lengthScore.toFixed(2)}`,
    },
    {
      source: 'submissions.moduleD.aiOrchestrationPrompts',
      excerpt: `structured=${structuredHits}/${promptCount}`,
      contribution: structureScore * STRUCTURE_WEIGHT,
      triggeredRule: `structure:${structureScore.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `cnt=${countScore.toFixed(2)} len=${lengthScore.toFixed(2)} struct=${structureScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, FALLBACK_VERSION);
}

export const sAiOrchestrationQuality: SignalDefinition = {
  id: SIGNAL_ID,
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MD',
  isLLMWhitelist: true,
  compute,
  fallback,
};

export { LLM_VERSION as AI_ORCHESTRATION_QUALITY_LLM_VERSION };
export { FALLBACK_VERSION as AI_ORCHESTRATION_QUALITY_FALLBACK_VERSION };
