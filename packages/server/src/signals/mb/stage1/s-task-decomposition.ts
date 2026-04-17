/**
 * sTaskDecomposition — Task 13c (MB Stage 1 planning).
 *
 * Measures quality of the candidate's Stage 1 decomposition: how many
 * distinct steps, whether the structure signals step-ordering, and whether
 * the steps reference scaffold files (i.e. the candidate read the scaffold
 * rather than writing a generic plan).
 *
 * backend-agent-tasks.md L94 lists "步骤数 + 格式 + scaffold 引用（纯规则）"
 * without explicit weights — V5-native algorithm (documented deviation):
 *
 *   stepCountScore   = min(1, steps.length / 5)
 *   formatScore      = hasOrderedPrefixes ? 1 : (bulletOrNumbered ? 0.6 : 0.2)
 *   scaffoldHitScore = min(1, scaffoldFileRefs / max(3, scaffoldFiles / 2))
 *
 *   sTaskDecomposition = stepCountScore × 0.4
 *                      + formatScore × 0.2
 *                      + scaffoldHitScore × 0.4
 *
 * Fallback: null when `planning.decomposition` missing or empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMbExamData, nullResult, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sTaskDecomposition@v1';
const STEP_WEIGHT = 0.4;
const FORMAT_WEIGHT = 0.2;
const SCAFFOLD_WEIGHT = 0.4;
const STEP_TARGET = 5;

function splitSteps(text: string): string[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const orderedPrefix = lines.filter((l) => /^(\d+[\.\)、]|[一二三四五六七八九十]+[、\.]|[-*])/.test(l));
  if (orderedPrefix.length >= 2) return orderedPrefix;
  const sentences = text
    .split(/[。.;；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
  return sentences;
}

function hasOrderedPrefixes(lines: string[]): boolean {
  return lines.some((l) => /^(\d+[\.\)、]|[一二三四五六七八九十]+[、\.])/.test(l));
}

function hasBulletPrefixes(lines: string[]): boolean {
  return lines.some((l) => /^[-*]\s/.test(l));
}

function countScaffoldFileRefs(text: string, scaffoldFiles: string[]): string[] {
  if (!text || scaffoldFiles.length === 0) return [];
  const hits: string[] = [];
  const lower = text.toLowerCase();
  for (const path of scaffoldFiles) {
    const segments = path.split('/').filter(Boolean);
    const leaf = segments[segments.length - 1] ?? path;
    const withoutExt = leaf.replace(/\.[^.]+$/, '');
    if (lower.includes(path.toLowerCase()) || lower.includes(withoutExt.toLowerCase())) {
      hits.push(path);
    }
  }
  return hits;
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const planning = input.submissions.mb?.planning;
  if (!planning?.decomposition) return nullResult(ALGORITHM_VERSION);
  const text = planning.decomposition.trim();
  if (text.length === 0) return nullResult(ALGORITHM_VERSION);

  const steps = splitSteps(text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const stepCountScore = clamp01(steps.length / STEP_TARGET);

  let formatScore = 0.2;
  if (hasOrderedPrefixes(lines)) formatScore = 1;
  else if (hasBulletPrefixes(lines)) formatScore = 0.6;

  const exam = getMbExamData(input.examData);
  const scaffoldPaths = exam?.scaffold?.files?.map((f) => f.path) ?? [];
  const scaffoldHits = countScaffoldFileRefs(text, scaffoldPaths);
  const scaffoldTarget = Math.max(3, Math.floor(scaffoldPaths.length / 2));
  const scaffoldHitScore = scaffoldTarget === 0 ? 0 : clamp01(scaffoldHits.length / scaffoldTarget);

  const value =
    stepCountScore * STEP_WEIGHT + formatScore * FORMAT_WEIGHT + scaffoldHitScore * SCAFFOLD_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.mb.planning.decomposition',
      excerpt: truncate(text),
      contribution: stepCountScore * STEP_WEIGHT,
      triggeredRule: `step_count:${steps.length}/${STEP_TARGET}`,
    },
    {
      source: 'submissions.mb.planning.decomposition',
      excerpt: `ordered=${hasOrderedPrefixes(lines)} bullet=${hasBulletPrefixes(lines)}`,
      contribution: formatScore * FORMAT_WEIGHT,
      triggeredRule: `format_score:${formatScore.toFixed(2)}`,
    },
    {
      source: 'examData.MB.scaffold.files',
      excerpt: `scaffold_files=${scaffoldPaths.length} hits=[${scaffoldHits.join(',')}]`,
      contribution: scaffoldHitScore * SCAFFOLD_WEIGHT,
      triggeredRule: `scaffold_refs:${scaffoldHits.length}/${scaffoldTarget}`,
    },
    {
      source: 'tier',
      excerpt: `step=${stepCountScore.toFixed(2)} fmt=${formatScore.toFixed(2)} scaffold=${scaffoldHitScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sTaskDecomposition: SignalDefinition = {
  id: 'sTaskDecomposition',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as TASK_DECOMPOSITION_VERSION };
