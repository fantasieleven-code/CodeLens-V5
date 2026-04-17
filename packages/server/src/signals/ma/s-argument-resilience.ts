/**
 * sArgumentResilience — Task 13b.
 *
 * Pure-rule signal per backend-agent-tasks.md L68-84 (full pseudocode quoted
 * below). Measures whether the candidate maintains their R1 scheme choice
 * under challenge, with quantitative + specific + causal reasoning.
 *
 * ```
 * const stanceMaintained = response.includes(originalSchemeId);
 * const stanceChanged    = response.includes(alternativeSchemeId);
 *
 * if (stanceMaintained && !stanceChanged) {
 *   const quantitative = countQuantitativeMarkers(response);
 *   const specificity  = countTechnicalTerms(response) / wordCount;
 *   return quantitative * 0.4 + specificity * 0.3 + 1.0 * 0.3;
 * }
 * if (stanceChanged) {
 *   const hasJustification = response.length > 50 && countCausalMarkers > 0;
 *   return hasJustification ? 0.6 : 0.1;
 * }
 * return 0.3;
 * ```
 *
 * Note: pseudocode uses raw `quantitative` / `specificity` as if already in
 * [0, 1]; V5 implementation normalizes both (quantitative hits vs target=3,
 * specificity as tech-term-density) to keep value in [0, 1] under typical
 * inputs. Documented deviation.
 *
 * Fallback: null if round1 or challengeResponse missing.
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
  countCausalMarkers,
  countQuantitativeMarkers,
  countTechTerms,
  finalize,
  nullResult,
  truncate,
  wordCount,
} from './types.js';

const ALGORITHM_VERSION = 'sArgumentResilience@v1';

const QUANTITATIVE_TARGET_HITS = 3;
const STANCE_CHANGED_JUSTIFICATION_THRESHOLD = 50;

const ALTERNATIVE_BY_CHOICE: Record<string, string[]> = {
  A: ['B', 'C'],
  B: ['A', 'C'],
  C: ['A', 'B'],
};

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub) return nullResult(ALGORITHM_VERSION);
  const { schemeId } = sub.round1;
  const response = sub.round1.challengeResponse ?? '';
  if (!response.trim()) return nullResult(ALGORITHM_VERSION);

  const alternatives = ALTERNATIVE_BY_CHOICE[schemeId] ?? [];
  const mentionsOriginal = response.includes(schemeId);
  const mentionsAlternative = alternatives.some((alt) => response.includes(alt));

  const quantitative = countQuantitativeMarkers(response);
  const causal = countCausalMarkers(response);
  const { count: techCount } = countTechTerms(response);
  const words = wordCount(response);

  const excerpt = truncate(response);
  const evidence: SignalEvidence[] = [];

  let value: number;
  let branch: 'maintained' | 'changed_justified' | 'changed_unjustified' | 'fallback';

  if (mentionsOriginal && !mentionsAlternative) {
    branch = 'maintained';
    const quantScore = Math.min(1, quantitative.count / QUANTITATIVE_TARGET_HITS);
    const specificity = words > 0 ? Math.min(1, techCount / Math.max(5, words * 0.15)) : 0;
    value = quantScore * 0.4 + specificity * 0.3 + 1.0 * 0.3;

    evidence.push({
      source: 'submissions.moduleA.round1.challengeResponse',
      excerpt,
      contribution: 0.3,
      triggeredRule: `stance_maintained:choice=${schemeId}`,
    });
    evidence.push({
      source: 'submissions.moduleA.round1.challengeResponse',
      excerpt: `quantitative_hits=[${quantitative.hits.join(',')}] count=${quantitative.count}/${QUANTITATIVE_TARGET_HITS}`,
      contribution: quantScore * 0.4,
      triggeredRule: `has_quantitative_marker:${quantitative.count}`,
    });
    evidence.push({
      source: 'submissions.moduleA.round1.challengeResponse',
      excerpt: `tech_terms=${techCount} words=${words} density=${specificity.toFixed(2)}`,
      contribution: specificity * 0.3,
      triggeredRule: `has_technical_specificity:${techCount}`,
    });
  } else if (mentionsAlternative) {
    const hasJustification =
      response.length > STANCE_CHANGED_JUSTIFICATION_THRESHOLD && causal.count > 0;
    branch = hasJustification ? 'changed_justified' : 'changed_unjustified';
    value = hasJustification ? 0.6 : 0.1;

    evidence.push({
      source: 'submissions.moduleA.round1.challengeResponse',
      excerpt,
      contribution: value,
      triggeredRule: hasJustification ? 'stance_changed_justified' : 'stance_changed_unjustified',
    });
    if (hasJustification) {
      evidence.push({
        source: 'submissions.moduleA.round1.challengeResponse',
        excerpt: `causal_markers=[${causal.hits.slice(0, 3).join(',')}] length=${response.length}`,
        contribution: 0,
        triggeredRule: `has_causal_justification:${causal.count}`,
      });
    }
  } else {
    branch = 'fallback';
    value = 0.3;
    evidence.push({
      source: 'submissions.moduleA.round1.challengeResponse',
      excerpt,
      contribution: value,
      triggeredRule: 'no_stance_reference',
    });
  }

  evidence.push({
    source: 'tier',
    excerpt: `branch=${branch} mentionsOriginal=${mentionsOriginal} mentionsAlt=${mentionsAlternative} quant=${quantitative.count} tech=${techCount} → ${value.toFixed(3)}`,
    contribution: 0,
    triggeredRule: 'scoring_branch',
  });

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sArgumentResilience: SignalDefinition = {
  id: 'sArgumentResilience',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as ARGUMENT_RESILIENCE_VERSION };
