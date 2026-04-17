/**
 * sFailureAnticipation — Task 13c (MB Stage 1 planning).
 *
 * Measures whether the candidate anticipated failure modes in Stage 1 —
 * did they name specific fallback strategies, or leave the field generic?
 *
 * backend-agent-tasks.md L96: "降级关键词 + 步骤引用 + 填写率（纯规则）"
 * V5-native 3-factor:
 *
 *   fallbackMarkerScore = min(1, markerHits / 3)
 *     markers = fallback / retry / timeout / degrade / recovery / 降级 / 重试 / 超时 / 兜底 / 回滚
 *
 *   stepReferenceScore  = planning.fallbackStrategy references >=1 step from
 *                          planning.decomposition OR a scaffold identifier
 *                          (re-uses sInterfaceDesign extraction idea)
 *
 *   fillRateScore       = min(1, fallbackStrategy chars / 80)
 *
 *   sFailureAnticipation = fallback × 0.4 + stepRef × 0.3 + fillRate × 0.3
 *
 * Fallback: null when planning.fallbackStrategy missing or empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, markerHits, nullResult, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sFailureAnticipation@v1';

const FALLBACK_MARKERS: readonly string[] = [
  'fallback',
  'retry',
  'timeout',
  'degrade',
  'recovery',
  'rollback',
  'failover',
  'circuit',
  '降级',
  '重试',
  '超时',
  '兜底',
  '回滚',
  '熔断',
  '容错',
  '补偿',
  '重放',
];

const FALLBACK_WEIGHT = 0.4;
const STEP_REF_WEIGHT = 0.3;
const FILL_RATE_WEIGHT = 0.3;
const FILL_TARGET_CHARS = 80;
const MARKER_TARGET = 3;

async function compute(input: SignalInput): Promise<SignalResult> {
  const planning = input.submissions.mb?.planning;
  if (!planning?.fallbackStrategy) return nullResult(ALGORITHM_VERSION);
  const text = planning.fallbackStrategy.trim();
  if (text.length === 0) return nullResult(ALGORITHM_VERSION);

  const markers = markerHits(text, FALLBACK_MARKERS);
  const fallbackMarkerScore = clamp01(markers.length / MARKER_TARGET);

  const decomposition = planning.decomposition ?? '';
  const decompositionTokens = decomposition
    .split(/[\s、,;；\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  const stepHits = decompositionTokens.filter((t) => text.includes(t));
  const stepReferenceScore = stepHits.length > 0 ? 1 : 0;

  const fillRateScore = clamp01(text.length / FILL_TARGET_CHARS);

  const value =
    fallbackMarkerScore * FALLBACK_WEIGHT +
    stepReferenceScore * STEP_REF_WEIGHT +
    fillRateScore * FILL_RATE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.planning.fallbackStrategy',
      excerpt: truncate(text),
      contribution: fallbackMarkerScore * FALLBACK_WEIGHT,
      triggeredRule: `fallback_markers:${markers.length}/${MARKER_TARGET} [${markers.slice(0, 4).join(',')}]`,
    },
    {
      source: 'submissions.mb.planning.decomposition',
      excerpt: `step_hits=${stepHits.length}`,
      contribution: stepReferenceScore * STEP_REF_WEIGHT,
      triggeredRule: stepReferenceScore === 1 ? 'references_decomposition' : 'no_step_reference',
    },
    {
      source: 'submissions.mb.planning.fallbackStrategy',
      excerpt: `chars=${text.length}`,
      contribution: fillRateScore * FILL_RATE_WEIGHT,
      triggeredRule: `fill_rate:${text.length}/${FILL_TARGET_CHARS}`,
    },
    {
      source: 'tier',
      excerpt: `markers=${fallbackMarkerScore.toFixed(2)} steps=${stepReferenceScore.toFixed(2)} fill=${fillRateScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sFailureAnticipation: SignalDefinition = {
  id: 'sFailureAnticipation',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as FAILURE_ANTICIPATION_VERSION };
