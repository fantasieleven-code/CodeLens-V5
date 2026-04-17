/**
 * sAiOutputReview — Task 13c (MB Stage 2 quality).
 *
 * Measures whether the candidate critically reviewed AI output before
 * applying it. V4 originally had block-level annotation UI where the
 * candidate marked suspect lines; V5 dropped that in favor of Stage 4
 * audit (sRuleEnforcement). V5-native substitute (documented deviation):
 *
 *   reviewKeywords found in candidate's chat prompts — "check", "verify",
 *   "edge case", "bug", "issue", "是否", "检查", "验证", "确认", "怀疑",
 *   "漏洞".
 *
 *   reviewPromptRate = count(chatEvents where prompt contains any keyword)
 *                      / chatEvents.length
 *   diffRejectRate   = diffEvents where accepted=false
 *                      / diffEvents.length
 *
 *   sAiOutputReview = reviewPromptRate × 0.5 + diffRejectRate × 0.5
 *
 * Fallback: null when chatEvents empty AND diffEvents empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sAiOutputReview@v1';
const REVIEW_WEIGHT = 0.5;
const REJECT_WEIGHT = 0.5;

const REVIEW_KEYWORDS: readonly string[] = [
  'check',
  'verify',
  'confirm',
  'ensure',
  'edge case',
  'bug',
  'issue',
  'correct',
  'wrong',
  'mistake',
  'problem',
  'suspicious',
  'review',
  '检查',
  '验证',
  '确认',
  '是否',
  '漏洞',
  '错误',
  '问题',
  '边界',
  '怀疑',
  '审查',
];

function promptHasReviewMarker(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return REVIEW_KEYWORDS.some((k) => lower.includes(k.toLowerCase()) || prompt.includes(k));
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const chatEvents = behavior.chatEvents ?? [];
  const diffEvents = behavior.diffEvents ?? [];
  if (chatEvents.length === 0 && diffEvents.length === 0) return nullResult(ALGORITHM_VERSION);

  const reviewPrompts = chatEvents.filter((e) => promptHasReviewMarker(e.prompt ?? ''));
  const reviewPromptRate = chatEvents.length === 0 ? 0 : reviewPrompts.length / chatEvents.length;

  const diffRejects = diffEvents.filter((e) => !e.accepted).length;
  const diffRejectRate = diffEvents.length === 0 ? 0 : diffRejects / diffEvents.length;

  const value = reviewPromptRate * REVIEW_WEIGHT + diffRejectRate * REJECT_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.editorBehavior.chatEvents',
      excerpt: `review_prompts=${reviewPrompts.length}/${chatEvents.length}`,
      contribution: reviewPromptRate * REVIEW_WEIGHT,
      triggeredRule: `review_prompt_rate:${reviewPromptRate.toFixed(2)}`,
    },
    {
      source: 'submissions.mb.editorBehavior.diffEvents',
      excerpt: `diff_rejects=${diffRejects}/${diffEvents.length}`,
      contribution: diffRejectRate * REJECT_WEIGHT,
      triggeredRule: `diff_reject_rate:${diffRejectRate.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `review=${reviewPromptRate.toFixed(2)} reject=${diffRejectRate.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sAiOutputReview: SignalDefinition = {
  id: 'sAiOutputReview',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as AI_OUTPUT_REVIEW_VERSION };
