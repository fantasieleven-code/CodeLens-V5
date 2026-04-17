/**
 * sPrincipleAbstraction — Task 13b, Round 2 Part 3 调整 2.
 *
 * Full pseudocode from v5-design-clarifications.md L234-272:
 *
 * ```
 * function sPrincipleAbstraction(input: PrincipleAbstractionInput): number {
 *   const response = input.r4Response;
 *   const hasPrincipleStatement =
 *     /(核心|原则|本质|根本|底层逻辑|关键是)/i.test(response) ||
 *     /(同样的|一样的|相同的).*(原则|思路|逻辑)/i.test(response);
 *   const hasParameterAdaptation =
 *     /(不同|不一样|需要调整|参数.*变|阈值.*变|实现.*不同)/i.test(response) &&
 *     /(因为|由于|考虑到)/i.test(response);
 *   const isSubstantive  = response.length >= 100;
 *   const referencesR1   = response.includes(input.r1SchemeChoice)
 *                       || /(之前|前面|R1|第一轮|刚才)/i.test(response);
 *   if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive && referencesR1) return 1.0;
 *   if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive) return 0.85;
 *   if (hasPrincipleStatement && hasParameterAdaptation) return 0.7;
 *   if (hasPrincipleStatement || hasParameterAdaptation) return 0.4;
 *   return 0.15;
 * }
 * ```
 *
 * NOTE: PrincipleAbstractionInput.r4NewScenario is declared in the doc interface
 * but not consumed by the scoring pseudocode. V5.0 implementation follows the
 * pseudocode exactly — migrationScenario is read via local narrow cast purely
 * for an evidence entry citing the scenario the candidate faced. See
 * ma/types.ts header for the cross-task migrationScenario tech-debt note.
 *
 * Fallback: null when round4 missing.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  R4_SUBSTANTIVE_CHARS,
  finalize,
  getMaExamData,
  getMaMigrationScenario,
  nullResult,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sPrincipleAbstraction@v1';

const PRINCIPLE_PATTERN_1 = /(核心|原则|本质|根本|底层逻辑|关键是)/i;
const PRINCIPLE_PATTERN_2 = /(同样的|一样的|相同的).*(原则|思路|逻辑)/;
const PARAMETER_VARY_PATTERN =
  /(不同|不一样|需要调整|参数.*变|阈值.*变|实现.*不同)/;
const PARAMETER_CAUSAL_PATTERN = /(因为|由于|考虑到)/;
const R1_REFERENCE_PATTERN = /(之前|前面|R1|第一轮|刚才)/i;

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.moduleA;
  if (!sub?.round4) return nullResult(ALGORITHM_VERSION);

  const response = sub.round4.response ?? '';
  const r1SchemeChoice = sub.round1.schemeId;

  const hasPrincipleStatement =
    PRINCIPLE_PATTERN_1.test(response) || PRINCIPLE_PATTERN_2.test(response);
  const hasParameterAdaptation =
    PARAMETER_VARY_PATTERN.test(response) && PARAMETER_CAUSAL_PATTERN.test(response);
  const isSubstantive = response.length >= R4_SUBSTANTIVE_CHARS;
  const referencesR1 =
    response.includes(r1SchemeChoice) || R1_REFERENCE_PATTERN.test(response);

  let value: number;
  let tier: 'tier_100' | 'tier_85' | 'tier_70' | 'tier_40' | 'tier_15';
  if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive && referencesR1) {
    value = 1.0;
    tier = 'tier_100';
  } else if (hasPrincipleStatement && hasParameterAdaptation && isSubstantive) {
    value = 0.85;
    tier = 'tier_85';
  } else if (hasPrincipleStatement && hasParameterAdaptation) {
    value = 0.7;
    tier = 'tier_70';
  } else if (hasPrincipleStatement || hasParameterAdaptation) {
    value = 0.4;
    tier = 'tier_40';
  } else {
    value = 0.15;
    tier = 'tier_15';
  }

  const excerpt = truncate(response);
  const evidence: SignalEvidence[] = [];

  if (hasPrincipleStatement) {
    evidence.push({
      source: 'submissions.moduleA.round4.response',
      excerpt,
      contribution: 0.3,
      triggeredRule: 'has_principle_statement',
    });
  }
  if (hasParameterAdaptation) {
    evidence.push({
      source: 'submissions.moduleA.round4.response',
      excerpt,
      contribution: 0.3,
      triggeredRule: 'has_parameter_adaptation',
    });
  }
  if (isSubstantive) {
    evidence.push({
      source: 'submissions.moduleA.round4.response',
      excerpt: `length=${response.length} ≥ ${R4_SUBSTANTIVE_CHARS}`,
      contribution: 0.15,
      triggeredRule: 'is_substantive',
    });
  }
  if (referencesR1) {
    evidence.push({
      source: 'submissions.moduleA.round4.response',
      excerpt: `r1SchemeChoice=${r1SchemeChoice}`,
      contribution: 0.15,
      triggeredRule: 'references_r1',
    });
  }

  const migrationScenario = getMaMigrationScenario(getMaExamData(input.examData));
  if (migrationScenario) {
    evidence.push({
      source: 'examData.MA.migrationScenario.newBusinessContext',
      excerpt: truncate(migrationScenario.newBusinessContext),
      contribution: 0,
      triggeredRule: 'migration_scenario_reference',
    });
  }

  evidence.push({
    source: 'tier',
    excerpt: `principle=${hasPrincipleStatement} param=${hasParameterAdaptation} substantive=${isSubstantive} refR1=${referencesR1} → ${value.toFixed(2)}`,
    contribution: 0,
    triggeredRule: tier,
  });

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sPrincipleAbstraction: SignalDefinition = {
  id: 'sPrincipleAbstraction',
  dimension: V5Dimension.TECHNICAL_JUDGMENT,
  moduleSource: 'MA',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as PRINCIPLE_ABSTRACTION_VERSION };
