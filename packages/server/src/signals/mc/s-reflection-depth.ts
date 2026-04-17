/**
 * sReflectionDepth — Task 13e (MC, metacognition dimension).
 *
 * Direct transcription of design-reference-full.md L2074-2118.
 *
 *   if mcAnswers.length < 3            → null
 *   for each substantive answer (≥30): count base + high-depth markers
 *   baseScore   = min(1, totalMarkers / substantive / 2)
 *   depthBonus  = (high-depth-hit rounds / substantive) × 0.3
 *   value       = min(1, baseScore + depthBonus)
 *
 * Regex expansion over V4 (backend-agent-tasks.md L1398-1407): the V5
 * marker list adds "如果重来 / 下次会 / 学到了 / 应该 / 原本以为 /
 * 后来发现 / 换个角度 / 其实 / 没想到 / 意识到" plus the design-ref
 * high-depth subset to reward explicit lesson-learned language.
 */

import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  MIN_MC_ROUNDS,
  countMarkers,
  finalize,
  nullResult,
  substantiveAnswers,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sReflectionDepth@v1';

const REFLECTION_MARKERS = [
  // V4 原有（Phase -1 扩充）
  '我觉得',
  '我认为',
  '反思',
  // V5 新增（解决 V4 覆盖不足）
  '如果重来',
  '下次会',
  '学到了',
  '应该',
  '原本以为',
  '后来发现',
  '换个角度',
  '其实',
  '没想到',
  '意识到',
  // 高级反思
  '我错了',
  '之前没想到',
  '这次的教训',
  '更好的做法',
  '我会重新考虑',
] as const;

const HIGH_DEPTH_MARKERS = [
  '我错了',
  '之前没想到',
  '这次的教训',
  '更好的做法',
] as const;

async function computeReflectionDepth(input: SignalInput): Promise<SignalResult> {
  const mc = input.submissions.moduleC;
  if (!mc || mc.length < MIN_MC_ROUNDS) return nullResult(ALGORITHM_VERSION);

  const substantive = substantiveAnswers(mc);
  if (substantive.length === 0) return nullResult(ALGORITHM_VERSION);

  let totalMarkers = 0;
  let highDepthRounds = 0;
  const evidence: SignalEvidence[] = [];

  for (const a of substantive) {
    const markerCount = countMarkers(a.answer, REFLECTION_MARKERS);
    totalMarkers += markerCount;

    const highCount = countMarkers(a.answer, HIGH_DEPTH_MARKERS);
    if (highCount > 0) highDepthRounds += 1;

    if (markerCount > 0 && evidence.length < 5) {
      const firstMarker =
        HIGH_DEPTH_MARKERS.find((m) => a.answer.includes(m)) ??
        REFLECTION_MARKERS.find((m) => a.answer.includes(m)) ??
        'marker';
      const idx = a.answer.indexOf(firstMarker);
      const start = Math.max(0, idx - 30);
      const end = Math.min(a.answer.length, idx + firstMarker.length + 30);
      evidence.push({
        source: `submissions.moduleC.answers[round=${a.round}]`,
        excerpt: truncate(a.answer.slice(start, end)),
        contribution: markerCount / substantive.length / 2,
        triggeredRule:
          highCount > 0
            ? `reflection_high_depth_${firstMarker}`
            : `reflection_marker_${firstMarker}`,
      });
    }
  }

  const baseScore = Math.min(1, totalMarkers / substantive.length / 2);
  const depthBonus = (highDepthRounds / substantive.length) * 0.3;
  const value = Math.min(1, baseScore + depthBonus);

  if (evidence.length === 0) {
    evidence.push({
      source: 'submissions.moduleC',
      excerpt: `${substantive.length} substantive rounds, 0 reflection markers`,
      contribution: 0,
      triggeredRule: 'no_reflection_markers',
    });
  }

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sReflectionDepth: SignalDefinition = {
  id: 'sReflectionDepth',
  dimension: V5Dimension.METACOGNITION,
  moduleSource: 'MC',
  isLLMWhitelist: false,
  compute: computeReflectionDepth,
};

export {
  ALGORITHM_VERSION as REFLECTION_DEPTH_VERSION,
  REFLECTION_MARKERS,
  HIGH_DEPTH_MARKERS,
};
