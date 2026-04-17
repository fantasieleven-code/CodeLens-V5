/**
 * sAgentGuidance — Task 13c (MB Stage 3 AI governance).
 *
 * Measures quality of the optional AGENT.md — instructions the candidate
 * leaves for future AI agents maintaining this code. Content shares the
 * same quality bar as RULES.md but targets AI-specific guidance: context
 * pointers, tool-usage constraints, do-not-break invariants.
 *
 * backend-agent-tasks.md L112: "sAgentGuidance (aiEngineering)".
 *
 * V5-native (three-factor, mirrors sRulesQuality but scored under
 * aiEngineering dimension since it's AI-facing guidance):
 *
 *   lengthScore      = clamp01(agentContent.length / 300)
 *   imperativeScore  = clamp01(imperativeHits / 3)
 *   aiContextScore   = clamp01(aiKeywordHits / 2)
 *
 *   sAgentGuidance = length × 0.3 + imperative × 0.4 + aiContext × 0.3
 *
 * Fallback: null when standards.agentContent missing or empty (AGENT.md is
 * optional — candidates without one get null, not 0).
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  clamp01,
  finalize,
  IMPERATIVE_MARKERS,
  markerHits,
  nullResult,
  truncate,
} from '../types.js';

const ALGORITHM_VERSION = 'sAgentGuidance@v1';
const LENGTH_WEIGHT = 0.3;
const IMPERATIVE_WEIGHT = 0.4;
const AI_CONTEXT_WEIGHT = 0.3;
const LENGTH_TARGET = 300;
const IMPERATIVE_TARGET = 3;
const AI_CONTEXT_TARGET = 2;

const AI_CONTEXT_MARKERS: readonly string[] = [
  'agent',
  'ai',
  'llm',
  'model',
  'tool',
  'context',
  'prompt',
  'memory',
  'scope',
  '工具',
  '上下文',
  '指令',
  '避免',
  '边界',
];

async function compute(input: SignalInput): Promise<SignalResult> {
  const agentContent = input.submissions.mb?.standards?.agentContent?.trim();
  if (!agentContent) return nullResult(ALGORITHM_VERSION);

  const lengthScore = clamp01(agentContent.length / LENGTH_TARGET);
  const imperativeSet = markerHits(agentContent, IMPERATIVE_MARKERS);
  const aiContextSet = markerHits(agentContent, AI_CONTEXT_MARKERS);

  const imperativeScore = clamp01(imperativeSet.length / IMPERATIVE_TARGET);
  const aiContextScore = clamp01(aiContextSet.length / AI_CONTEXT_TARGET);

  const value =
    lengthScore * LENGTH_WEIGHT +
    imperativeScore * IMPERATIVE_WEIGHT +
    aiContextScore * AI_CONTEXT_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.standards.agentContent',
      excerpt: truncate(agentContent),
      contribution: lengthScore * LENGTH_WEIGHT,
      triggeredRule: `length:${agentContent.length}/${LENGTH_TARGET}`,
    },
    {
      source: 'submissions.mb.standards.agentContent',
      excerpt: `imperative_markers=[${imperativeSet.slice(0, 4).join(',')}]`,
      contribution: imperativeScore * IMPERATIVE_WEIGHT,
      triggeredRule: `imperative_hits:${imperativeSet.length}/${IMPERATIVE_TARGET}`,
    },
    {
      source: 'submissions.mb.standards.agentContent',
      excerpt: `ai_context_markers=[${aiContextSet.slice(0, 4).join(',')}]`,
      contribution: aiContextScore * AI_CONTEXT_WEIGHT,
      triggeredRule: `ai_context_hits:${aiContextSet.length}/${AI_CONTEXT_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `len=${lengthScore.toFixed(2)} imp=${imperativeScore.toFixed(2)} ai=${aiContextScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sAgentGuidance: SignalDefinition = {
  id: 'sAgentGuidance',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as AGENT_GUIDANCE_VERSION };
