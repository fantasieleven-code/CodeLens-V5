/**
 * sTradeoffArticulation — Task 13d (MD LLM whitelist).
 *
 * LLM-graded quality of the MD tradeoff narrative: does the candidate
 * compare multiple design options, name failure modes, and make an
 * explicit recommendation? Dimension: SYSTEM_DESIGN.
 *
 * Prompt key: md.llm_whitelist.tradeoff.
 *
 * Pure-rule fallback (backend-agent-tasks.md L1438-1456 shows the pattern
 * for sDesignDecomposition only; V5-native fallback for tradeoff):
 *
 *   volumeScore    = clamp01(textVolume / 120)                    // CJK-aware
 *   contrastScore  = clamp01(contrast_markers_hit / 3)            // vs / 对比 / 优缺点 / 权衡 …
 *   decisionScore  = has_explicit_choice ? 1 : 0                  // 选 / 推荐 / 建议 / choose …
 *
 *   fallback = volume × 0.4 + contrast × 0.4 + decision × 0.2
 *
 * Fallback null when `submissions.moduleD.tradeoffText` empty.
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

const LLM_VERSION = 'sTradeoffArticulation@v1_llm';
const FALLBACK_VERSION = 'sTradeoffArticulation@v1_fallback';
const PROMPT_KEY = 'md.llm_whitelist.tradeoff';
const SIGNAL_ID = 'sTradeoffArticulation';

const VOLUME_TARGET = 120;
const CONTRAST_TARGET = 3;
const VOLUME_WEIGHT = 0.4;
const CONTRAST_WEIGHT = 0.4;
const DECISION_WEIGHT = 0.2;

const CONTRAST_MARKERS = [
  'vs',
  'vs.',
  '对比',
  '相比',
  '权衡',
  'tradeoff',
  'trade-off',
  'trade off',
  '优点',
  '缺点',
  '优势',
  '劣势',
  'pros',
  'cons',
  '方案 a',
  '方案 b',
  'option a',
  'option b',
  'plan a',
  'plan b',
];

const DECISION_MARKERS = [
  '推荐',
  '建议',
  '选择',
  '选',
  '决定',
  'recommend',
  'choose',
  'prefer',
  'pick',
  'decide',
  '倾向',
  '最终',
];

function countMarkerHits(text: string, markers: readonly string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const m of markers) {
    if (lower.includes(m.toLowerCase()) || text.includes(m)) n += 1;
  }
  return n;
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const md = input.submissions.moduleD;
  if (!md || !md.tradeoffText?.trim()) return nullResult(LLM_VERSION);

  const excerpt = truncate(md.tradeoffText);

  return gradeWithLLM({
    signalId: SIGNAL_ID,
    promptKey: PROMPT_KEY,
    input,
    variables: {
      tradeoffText: md.tradeoffText,
      subModules: md.subModules.map((m) => m.name).join(', '),
      constraintsSelected: (md.constraintsSelected ?? []).join(', '),
    },
    llmAlgorithmVersion: LLM_VERSION,
    evidenceSource: 'submissions.moduleD.tradeoffText',
    evidenceExcerpt: excerpt,
  });
}

function fallback(input: SignalInput): SignalResult {
  const md = input.submissions.moduleD;
  const text = md?.tradeoffText?.trim() ?? '';
  if (text.length === 0) return nullResult(FALLBACK_VERSION);

  const volume = textVolume(text);
  const volumeScore = clamp01(volume / VOLUME_TARGET);

  const contrastHits = countMarkerHits(text, CONTRAST_MARKERS);
  const contrastScore = clamp01(contrastHits / CONTRAST_TARGET);

  const decisionHits = countMarkerHits(text, DECISION_MARKERS);
  const decisionScore = decisionHits > 0 ? 1 : 0;

  const value =
    volumeScore * VOLUME_WEIGHT +
    contrastScore * CONTRAST_WEIGHT +
    decisionScore * DECISION_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleD.tradeoffText',
      excerpt: truncate(text),
      contribution: volumeScore * VOLUME_WEIGHT,
      triggeredRule: `volume:${volume}/${VOLUME_TARGET}`,
    },
    {
      source: 'submissions.moduleD.tradeoffText',
      excerpt: `contrast_hits=${contrastHits}/${CONTRAST_TARGET}`,
      contribution: contrastScore * CONTRAST_WEIGHT,
      triggeredRule: `contrast:${contrastScore.toFixed(2)}`,
    },
    {
      source: 'submissions.moduleD.tradeoffText',
      excerpt: `decision_hits=${decisionHits}`,
      contribution: decisionScore * DECISION_WEIGHT,
      triggeredRule: `decision:${decisionScore}`,
    },
    {
      source: 'tier',
      excerpt: `vol=${volumeScore.toFixed(2)} contrast=${contrastScore.toFixed(2)} dec=${decisionScore} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, FALLBACK_VERSION);
}

export const sTradeoffArticulation: SignalDefinition = {
  id: SIGNAL_ID,
  dimension: V5Dimension.SYSTEM_DESIGN,
  moduleSource: 'MD',
  isLLMWhitelist: true,
  compute,
  fallback,
};

export { LLM_VERSION as TRADEOFF_ARTICULATION_LLM_VERSION };
export { FALLBACK_VERSION as TRADEOFF_ARTICULATION_FALLBACK_VERSION };
