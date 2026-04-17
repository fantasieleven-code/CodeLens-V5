/**
 * sRulesSpecificity — Task 13c (MB Stage 3 standards).
 *
 * Measures whether rules are concrete (numeric thresholds, specific APIs,
 * if/when conditionals) or generic filler ("尽量", "try to", "appropriate").
 * Highly specific rules act on real constraints; filler rules do nothing.
 *
 * V5-native (markers defined in mb/types.ts):
 *
 *   rewardHits = count of SPECIFICITY_REWARD_PATTERNS matches
 *   fillerHits = count of GENERIC_FILLER_MARKERS matches
 *
 *   rewardScore  = clamp01(rewardHits / 4)
 *   fillerScore  = clamp01(1 - fillerHits / 5)
 *
 *   sRulesSpecificity = rewardScore × 0.6 + fillerScore × 0.4
 *
 * Fallback: null when standards.rulesContent missing or empty.
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
  GENERIC_FILLER_MARKERS,
  markerHits,
  nullResult,
  regexHits,
  SPECIFICITY_REWARD_PATTERNS,
  truncate,
} from '../types.js';

const ALGORITHM_VERSION = 'sRulesSpecificity@v1';
const REWARD_WEIGHT = 0.6;
const FILLER_WEIGHT = 0.4;
const REWARD_TARGET = 4;
const FILLER_CAP = 5;

async function compute(input: SignalInput): Promise<SignalResult> {
  const rulesContent = input.submissions.mb?.standards?.rulesContent?.trim();
  if (!rulesContent) return nullResult(ALGORITHM_VERSION);

  const rewardCount = regexHits(rulesContent, SPECIFICITY_REWARD_PATTERNS);
  const fillerSet = markerHits(rulesContent, GENERIC_FILLER_MARKERS);

  const rewardScore = clamp01(rewardCount / REWARD_TARGET);
  const fillerScore = clamp01(1 - fillerSet.length / FILLER_CAP);

  const value = rewardScore * REWARD_WEIGHT + fillerScore * FILLER_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: truncate(rulesContent),
      contribution: rewardScore * REWARD_WEIGHT,
      triggeredRule: `specificity_rewards:${rewardCount}/${REWARD_TARGET}`,
    },
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: `generic_fillers=[${fillerSet.slice(0, 4).join(',')}]`,
      contribution: fillerScore * FILLER_WEIGHT,
      triggeredRule: `filler_penalty:${fillerSet.length}/${FILLER_CAP}`,
    },
    {
      source: 'tier',
      excerpt: `reward=${rewardScore.toFixed(2)} filler=${fillerScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sRulesSpecificity: SignalDefinition = {
  id: 'sRulesSpecificity',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as RULES_SPECIFICITY_VERSION };
