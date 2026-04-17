/**
 * sBeliefUpdateMagnitude — Round 3 Part 3 调整 3.
 *
 * Measures whether a candidate updates their belief in response to Emma's
 * contradiction challenge at MC round 2, without abandoning their entire
 * stance (defending core) and with a concrete fix. Later rounds should show
 * subsequent coherence with the updated view.
 *
 * Scoring (逐字 L462-L467 of v5-design-clarifications.md):
 *   hasBeliefUpdate && defendsCore && hasSpecificFix && subsequentCoherence → 1.0
 *   hasBeliefUpdate && defendsCore && hasSpecificFix                       → 0.85
 *   hasBeliefUpdate && defendsCore                                         → 0.7
 *   hasBeliefUpdate && !defendsCore                                        → 0.3 (全盘放弃)
 *   !hasBeliefUpdate && defendsCore                                        → 0.4 (固执)
 *   else                                                                    → 0.15
 *
 * Fallback returns null + [] — absence of Module C data is NOT treated as a
 * negative signal, per "value === null 表示信号不适用" in v5-signals.ts.
 */

import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import type { BeliefUpdateInput } from './types.js';
import { BELIEF_UPDATE_CHALLENGE_ROUND } from './types.js';

const ALGORITHM_VERSION = 'sBeliefUpdateMagnitude@v1';

const BELIEF_UPDATE_MARKERS = [
  '你说得对',
  '你提的对',
  '我没考虑到',
  '我之前没想到',
  '修正一下',
  '更准确地说',
  '更严谨地说',
  '我刚才用词不精确',
  '你这个问题很好',
  '确实',
  '的确是',
  '我承认',
  'fair point',
  'good point',
  'you are right',
];

const DEFENSE_MARKERS = [
  '但是',
  '然而',
  '核心观点',
  '主要结论',
  '但我仍然',
  '在这个前提下',
  '从另一个角度',
  '不过',
];

const SPECIFIC_FIX_PATTERN = /(应该改为|可以改成|更好的是|修正为)/i;
const NUMBER_PATTERN = /\d+/;
const COHERENCE_PATTERN = /(刚才的修正|基于 R2|基于 Round 2|沿着这个思路|在新的理解下)/i;

function extractMCAnswers(input: SignalInput): BeliefUpdateInput | null {
  const mc = input.submissions.moduleC;
  if (!mc || mc.length === 0) return null;

  const byRound = new Map<number, { question: string; answer: string }>();
  for (const a of mc) {
    if (typeof a.round === 'number') {
      byRound.set(a.round, { question: a.question ?? '', answer: a.answer ?? '' });
    }
  }

  const r2 = byRound.get(BELIEF_UPDATE_CHALLENGE_ROUND);
  if (!r2 || !r2.answer) return null;

  const round3Plus: string[] = [];
  for (const [round, entry] of byRound) {
    if (round > BELIEF_UPDATE_CHALLENGE_ROUND && entry.answer) {
      round3Plus.push(entry.answer);
    }
  }

  const selfReflection = input.submissions.selfAssess?.reasoning ?? '';
  const maReasoning = input.submissions.moduleA?.round1?.reasoning ?? '';
  const preModuleCStance = selfReflection || maReasoning;

  return {
    round2ChallengeText: r2.question,
    round2Response: r2.answer,
    round3PlusResponses: round3Plus,
    preModuleCStance,
  };
}

function scoreBeliefUpdate(
  data: BeliefUpdateInput,
): { value: number; evidence: SignalEvidence[] } {
  const r2 = data.round2Response;
  const r2lower = r2.toLowerCase();

  const beliefHit = BELIEF_UPDATE_MARKERS.find((m) => r2lower.includes(m.toLowerCase()));
  const hasBeliefUpdate = beliefHit !== undefined;

  const defenseHit = DEFENSE_MARKERS.find((m) => r2.includes(m));
  const defendsCore = defenseHit !== undefined;

  const hasSpecificFix =
    r2.length >= 80 && (SPECIFIC_FIX_PATTERN.test(r2) || NUMBER_PATTERN.test(r2));

  const subsequentCoherence = data.round3PlusResponses.some((r) => COHERENCE_PATTERN.test(r));

  let value: number;
  let tier: string;
  if (hasBeliefUpdate && defendsCore && hasSpecificFix && subsequentCoherence) {
    value = 1.0;
    tier = 'full';
  } else if (hasBeliefUpdate && defendsCore && hasSpecificFix) {
    value = 0.85;
    tier = 'strong';
  } else if (hasBeliefUpdate && defendsCore) {
    value = 0.7;
    tier = 'moderate';
  } else if (hasBeliefUpdate && !defendsCore) {
    value = 0.3;
    tier = 'surface';
  } else if (!hasBeliefUpdate && defendsCore) {
    value = 0.4;
    tier = 'entrenched';
  } else {
    value = 0.15;
    tier = 'none';
  }

  const evidence: SignalEvidence[] = [];
  if (beliefHit) {
    evidence.push({
      source: 'submissions.moduleC[round=2].answer',
      excerpt: truncate(r2, 200),
      contribution: 0.3,
      triggeredRule: `belief_marker:${beliefHit}`,
    });
  }
  if (defenseHit) {
    evidence.push({
      source: 'submissions.moduleC[round=2].answer',
      excerpt: truncate(r2, 200),
      contribution: 0.25,
      triggeredRule: `defense_marker:${defenseHit}`,
    });
  }
  if (hasSpecificFix) {
    evidence.push({
      source: 'submissions.moduleC[round=2].answer',
      excerpt: truncate(r2, 200),
      contribution: 0.25,
      triggeredRule: 'specific_fix',
    });
  }
  if (subsequentCoherence) {
    const hit = data.round3PlusResponses.find((r) => COHERENCE_PATTERN.test(r)) ?? '';
    evidence.push({
      source: 'submissions.moduleC[round>=3].answer',
      excerpt: truncate(hit, 200),
      contribution: 0.2,
      triggeredRule: 'subsequent_coherence',
    });
  }
  evidence.push({
    source: 'tier',
    excerpt: `tier=${tier} value=${value}`,
    contribution: 0,
    triggeredRule: 'scoring_tier',
  });

  return { value, evidence: evidence.slice(0, SIGNAL_EVIDENCE_LIMIT) };
}

function truncate(s: string, max: number): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function emptyResult(): SignalResult {
  return {
    value: null,
    evidence: [],
    computedAt: Date.now(),
    algorithmVersion: ALGORITHM_VERSION,
  };
}

export async function computeBeliefUpdateMagnitude(
  input: SignalInput,
): Promise<SignalResult> {
  const data = extractMCAnswers(input);
  if (!data) return emptyResult();
  const { value, evidence } = scoreBeliefUpdate(data);
  return {
    value,
    evidence,
    computedAt: Date.now(),
    algorithmVersion: ALGORITHM_VERSION,
  };
}

export const sBeliefUpdateMagnitude: SignalDefinition = {
  id: 'sBeliefUpdateMagnitude',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'MC',
  isLLMWhitelist: false,
  compute: computeBeliefUpdateMagnitude,
  fallback: () => emptyResult(),
};

export { ALGORITHM_VERSION as BELIEF_UPDATE_MAGNITUDE_VERSION };
