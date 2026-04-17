/**
 * P0 signal-local helpers.
 *
 * Shared across the P0 signals folder (sBaselineReading / sAiCalibration /
 * sDecisionStyle / sTechProfile / sAiClaimDetection). Intentionally kept
 * framework-free so unit tests can exercise scoring without stubbing a full
 * SignalInput.
 */

import type { P0ModuleSpecific, SignalEvidence, SignalResult } from '@codelens-v5/shared';
import { SIGNAL_EVIDENCE_LIMIT } from '@codelens-v5/shared';

/** Common ceiling for evidence excerpts (keeps DB rows bounded). */
export const EVIDENCE_EXCERPT_MAX = 200;

/** Minimum character count for L2/L3 free-text to be considered "substantive". */
export const L2_SUBSTANTIVE_CHARS = 60;
export const L3_SUBSTANTIVE_CHARS = 100;

/** Reason quality minimum chars for sAiCalibration reason scoring. */
export const REASON_SUBSTANTIVE_CHARS = 30;

/**
 * Technical-term markers seen in P0 BusinessScenario answers. Used by
 * sBaselineReading (L2/L3 substantivity) and sTechProfile (familiarity).
 * Not exhaustive — the goal is a keyword-coverage signal, so stable coverage
 * of common domain terms matters more than completeness.
 */
export const TECH_TERM_MARKERS: readonly string[] = [
  // Redis / locking domain (most common in P0 fixtures)
  'redis',
  'set',
  'nx',
  'multi',
  'exec',
  'watch',
  'lua',
  'ttl',
  'lock',
  'race',
  'atomic',
  'uuid',
  // Concurrency / correctness
  'idempotent',
  'concurrent',
  '并发',
  '原子',
  '幂等',
  '锁',
  '互斥',
  '死锁',
  '重试',
  // Scaling / perf
  'qps',
  'throughput',
  'latency',
  'p99',
  'bottleneck',
  'scale',
  '瓶颈',
  '性能',
  '吞吐',
  // Storage / infra
  'database',
  'cache',
  'mysql',
  'postgres',
  'kafka',
  'queue',
  'replica',
  '主从',
  '分片',
  '缓存',
  // Tx
  'transaction',
  'rollback',
  'commit',
  '事务',
  '回滚',
  // General substantivity cues
  '函数',
  'function',
  'line',
  '行',
];

const TECH_TERM_LOWER = TECH_TERM_MARKERS.map((t) => t.toLowerCase());

/**
 * Count distinct tech-term markers that appear in `text`. Dedup per term so a
 * candidate can't farm score by repeating the same word.
 */
export function countTechTerms(text: string): { hits: string[]; count: number } {
  if (!text) return { hits: [], count: 0 };
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const term of TECH_TERM_LOWER) {
    if (lower.includes(term)) hits.push(term);
  }
  return { hits, count: hits.length };
}

/**
 * Keyword coverage score: fraction of `keywords` that appear in `text`.
 * Returns 0 when keywords list is empty (caller should use a substantivity
 * fallback in that case — see sBaselineReading L2/L3 logic).
 */
export function keywordCoverage(text: string, keywords: readonly string[]): number {
  if (!text || keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const kw of keywords) {
    if (kw && lower.includes(kw.toLowerCase())) hits += 1;
  }
  return hits / keywords.length;
}

/** Clamp `n` to `[0, 1]`. */
export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function truncate(s: string, max: number = EVIDENCE_EXCERPT_MAX): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/**
 * Build a `SignalResult` with `value === null` — used when the signal is
 * not applicable (module absent, data missing). The caller decides when to
 * return this; per v5-signals.ts contract null evidence is allowed.
 */
export function nullResult(algorithmVersion: string): SignalResult {
  return {
    value: null,
    evidence: [],
    computedAt: Date.now(),
    algorithmVersion,
  };
}

export function finalize(
  value: number,
  evidence: SignalEvidence[],
  algorithmVersion: string,
): SignalResult {
  return {
    value: clamp01(value),
    evidence: evidence.slice(0, SIGNAL_EVIDENCE_LIMIT),
    computedAt: Date.now(),
    algorithmVersion,
  };
}

/** Narrow `examData.P0` (typed as `Record<string, unknown>`) to `P0ModuleSpecific`. */
export function getP0ExamData(
  examData: Partial<Record<string, Record<string, unknown>>>,
): P0ModuleSpecific | null {
  const raw = examData.P0;
  if (!raw) return null;
  return raw as unknown as P0ModuleSpecific;
}
