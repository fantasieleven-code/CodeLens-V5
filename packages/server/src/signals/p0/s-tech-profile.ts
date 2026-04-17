/**
 * sTechProfile — Task 13a.
 *
 * Infers technical-stack familiarity from the distinct tech-term density
 * across the candidate's L1/L2/L3 code-reading answers. Originally shipped
 * as a non-scoring "画像" (profile) per design-reference-p0.md L4464; the
 * Round 2 consolidation (v5-design-clarifications.md L71) reframes it as a
 * light-weight scoring signal while keeping the profile usage downstream.
 *
 * Value definition:
 *   sTechProfile = min(1, distinctTechTerms / TECH_PROFILE_TARGET_TERMS)
 *
 * Aggregation weight:
 *   Out of scope for the signal itself. v5-design-reference.md L720 / L964
 *   specifies weight = 0.1 in the metacognition aggregation; Round 2 notes
 *   (backend-agent-tasks Task 13a brief) mention 0.02 as an alternative.
 *   The actual weight plumbing lands in the scoring-layer aggregator (Task
 *   14+), not here — this signal just produces `value` in [0, 1].
 *
 * Fallback: null if phase0 submission absent.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { countTechTerms, finalize, nullResult, truncate } from './types.js';

const ALGORITHM_VERSION = 'sTechProfile@v1';
const TECH_PROFILE_TARGET_TERMS = 8;

async function compute(input: SignalInput): Promise<SignalResult> {
  const sub = input.submissions.phase0;
  if (!sub) return nullResult(ALGORITHM_VERSION);

  const { l1Answer, l2Answer, l3Answer } = sub.codeReading;
  const combined = [l1Answer, l2Answer, l3Answer].filter(Boolean).join('\n');
  if (!combined.trim()) {
    return finalize(
      0,
      [
        {
          source: 'submissions.phase0.codeReading',
          excerpt: '(no answers)',
          contribution: 0,
          triggeredRule: 'empty_input',
        },
      ],
      ALGORITHM_VERSION,
    );
  }

  const { hits } = countTechTerms(combined);
  const value = Math.min(1, hits.length / TECH_PROFILE_TARGET_TERMS);

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.phase0.codeReading',
      excerpt: truncate(combined),
      contribution: value,
      triggeredRule: `tech_terms:${hits.length}/${TECH_PROFILE_TARGET_TERMS}`,
    },
    {
      source: 'tier',
      excerpt: `hits=[${hits.slice(0, 6).join(',')}] distinct=${hits.length} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'tech_density',
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sTechProfile: SignalDefinition = {
  id: 'sTechProfile',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'P0',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as TECH_PROFILE_VERSION };
