/**
 * sRulesQuality — Task 13c (MB Stage 3 standards).
 *
 * Measures the phrasing quality of the candidate's RULES.md: does it use
 * imperative voice, illustrate with examples, avoid vague filler? A "do not
 * block the event loop; prefer asyncio.gather() — e.g. for parallel
 * database reads" is higher quality than "注意性能".
 *
 * backend-agent-tasks.md L111 groups sRulesQuality under Stage 3 codeQuality
 * without explicit formulas. V5-native:
 *
 *   lengthScore      = clamp01(rulesContent.length / 400)
 *   imperativeScore  = clamp01(imperativeHits / 3)
 *   exampleScore     = clamp01(exampleHits / 2)
 *
 *   sRulesQuality = length × 0.3 + imperative × 0.4 + example × 0.3
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
  EXAMPLE_MARKERS,
  finalize,
  IMPERATIVE_MARKERS,
  markerHits,
  nullResult,
  truncate,
} from '../types.js';

const ALGORITHM_VERSION = 'sRulesQuality@v1';
const LENGTH_WEIGHT = 0.3;
const IMPERATIVE_WEIGHT = 0.4;
const EXAMPLE_WEIGHT = 0.3;
const LENGTH_TARGET = 400;
const IMPERATIVE_TARGET = 3;
const EXAMPLE_TARGET = 2;

async function compute(input: SignalInput): Promise<SignalResult> {
  const rulesContent = input.submissions.mb?.standards?.rulesContent?.trim();
  if (!rulesContent) return nullResult(ALGORITHM_VERSION);

  const lengthScore = clamp01(rulesContent.length / LENGTH_TARGET);
  const imperativeSet = markerHits(rulesContent, IMPERATIVE_MARKERS);
  const exampleSet = markerHits(rulesContent, EXAMPLE_MARKERS);
  const imperativeScore = clamp01(imperativeSet.length / IMPERATIVE_TARGET);
  const exampleScore = clamp01(exampleSet.length / EXAMPLE_TARGET);

  const value =
    lengthScore * LENGTH_WEIGHT +
    imperativeScore * IMPERATIVE_WEIGHT +
    exampleScore * EXAMPLE_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: truncate(rulesContent),
      contribution: lengthScore * LENGTH_WEIGHT,
      triggeredRule: `length:${rulesContent.length}/${LENGTH_TARGET}`,
    },
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: `imperative_markers=[${imperativeSet.slice(0, 4).join(',')}]`,
      contribution: imperativeScore * IMPERATIVE_WEIGHT,
      triggeredRule: `imperative_hits:${imperativeSet.length}/${IMPERATIVE_TARGET}`,
    },
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: `example_markers=[${exampleSet.slice(0, 3).join(',')}]`,
      contribution: exampleScore * EXAMPLE_WEIGHT,
      triggeredRule: `example_hits:${exampleSet.length}/${EXAMPLE_TARGET}`,
    },
    {
      source: 'tier',
      excerpt: `len=${lengthScore.toFixed(2)} imp=${imperativeScore.toFixed(2)} ex=${exampleScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sRulesQuality: SignalDefinition = {
  id: 'sRulesQuality',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as RULES_QUALITY_VERSION };
