/**
 * MA signal-local helpers.
 *
 * Shared across the 10 MA signals (Task 13b). Layout mirrors p0/types.ts.
 *
 * NOTE — MAModuleSpecific.migrationScenario tech-debt:
 *   The V5.0 spec (v5-design-clarifications.md L285-294) says the exam
 *   generator Step 2.5 will produce `migrationScenario: { newBusinessContext,
 *   relatedDimension, differingDimension, promptText }` and place it on
 *   MAModuleSpecific. Task 10 has not yet extended the shared type; Task 13b
 *   consumes only the `round4.response` + `round1.schemeId` + `round1.reasoning`
 *   paths per the sPrincipleAbstraction pseudocode (L234-272), neither of
 *   which touch migrationScenario. This helper exposes a `getMaMigrationScenario`
 *   via local narrow cast purely so sPrincipleAbstraction can emit an
 *   `evidence` entry citing the scenario context when it is provided by a
 *   forward-compatible exam generator. When Task 10 lands, the narrow cast
 *   can be deleted and replaced with a typed field on MAModuleSpecific.
 *   See PR #39 / Observations #026 in multi-agent-observations.md.
 */

import type {
  MAModuleSpecific,
  SignalEvidence,
  SignalResult,
} from '@codelens-v5/shared';
import { SIGNAL_EVIDENCE_LIMIT } from '@codelens-v5/shared';

/** Excerpt length ceiling for evidence entries (matches p0/types.ts). */
export const EVIDENCE_EXCERPT_MAX = 200;

/** Minimum character thresholds for "substantive" free-text scoring. */
export const REASONING_SUBSTANTIVE_CHARS = 60;
export const VERIFICATION_SUBSTANTIVE_CHARS = 30;
export const DIFF_ANALYSIS_SUBSTANTIVE_CHARS = 50;
export const DIAGNOSIS_SUBSTANTIVE_CHARS = 60;
export const R4_SUBSTANTIVE_CHARS = 100;

/** Markers used by sArgumentResilience per backend-agent-tasks.md L75-76. */
export const QUANTITATIVE_PATTERNS: readonly RegExp[] = [
  /\d+\s*%/, // percentages
  /\d+\s*(qps|tps|rps|iops)/i,
  /\d+\s*(ms|sec|second|min|minute|hour|day|小时|分钟|秒|天)/i,
  /\d{2,}/, // any standalone multi-digit number
];

export const CAUSAL_MARKERS: readonly string[] = [
  '因为',
  '由于',
  '所以',
  '因此',
  '考虑到',
  '基于',
  'because',
  'since',
  'therefore',
  'so that',
];

/** Technical term inventory (reused from p0 + MA specifics). */
export const TECH_TERM_MARKERS: readonly string[] = [
  // Concurrency / locking
  'redis',
  'lock',
  'mutex',
  'atomic',
  'idempotent',
  'concurrent',
  '并发',
  '幂等',
  '锁',
  '互斥',
  '原子',
  // Storage / infra
  'database',
  'cache',
  'queue',
  'mysql',
  'postgres',
  'kafka',
  'replica',
  '缓存',
  '队列',
  '主从',
  '分片',
  // Performance
  'qps',
  'tps',
  'latency',
  'throughput',
  'p99',
  'p95',
  'bottleneck',
  '瓶颈',
  '吞吐',
  '性能',
  // Transactions / correctness
  'transaction',
  'rollback',
  'commit',
  '事务',
  '回滚',
  // Distributed systems
  'consistency',
  'availability',
  'partition',
  '一致性',
  '可用性',
  // Architecture
  'service',
  'api',
  'microservice',
  'monolith',
  '服务',
  '接口',
  '微服务',
  // Reliability
  'timeout',
  'retry',
  'circuit',
  'fallback',
  'degradation',
  '超时',
  '重试',
  '降级',
  '熔断',
];

const TECH_TERM_LOWER = TECH_TERM_MARKERS.map((t) => t.toLowerCase());

export function countTechTerms(text: string): { hits: string[]; count: number } {
  if (!text) return { hits: [], count: 0 };
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const term of TECH_TERM_LOWER) {
    if (lower.includes(term)) hits.push(term);
  }
  return { hits, count: hits.length };
}

export function countQuantitativeMarkers(text: string): { count: number; hits: string[] } {
  if (!text) return { count: 0, hits: [] };
  const hits: string[] = [];
  for (const pat of QUANTITATIVE_PATTERNS) {
    const m = text.match(pat);
    if (m) hits.push(m[0]);
  }
  return { count: hits.length, hits };
}

export function countCausalMarkers(text: string): { count: number; hits: string[] } {
  if (!text) return { count: 0, hits: [] };
  const hits = CAUSAL_MARKERS.filter((m) => text.includes(m));
  return { count: hits.length, hits };
}

export function wordCount(text: string): number {
  if (!text) return 0;
  // Approximate: whitespace split + CJK char count
  const latin = text.trim().split(/\s+/).filter(Boolean).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return Math.max(latin, cjk);
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  if (!Number.isFinite(n)) return 0;
  return n;
}

export function truncate(s: string, max: number = EVIDENCE_EXCERPT_MAX): string {
  if (!s) return '';
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

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

/**
 * Narrow `examData.MA` (typed as `Record<string, unknown>`) to `MAModuleSpecific`.
 * Returns null if MA module not present.
 */
export function getMaExamData(
  examData: Partial<Record<string, Record<string, unknown>>>,
): MAModuleSpecific | null {
  const raw = examData.MA;
  if (!raw) return null;
  return raw as unknown as MAModuleSpecific;
}

/**
 * Local narrow for the migrationScenario field that lives on a forward-
 * compatible MAModuleSpecific (Task 10 pending). Returns null when Task 10
 * hasn't landed yet OR when the specific MA fixture did not include one.
 * Only used by sPrincipleAbstraction for evidence enrichment; scoring logic
 * does not depend on it.
 */
export interface MigrationScenarioNarrow {
  newBusinessContext: string;
  relatedDimension: string;
  differingDimension: string;
  promptText: string;
}

export function getMaMigrationScenario(
  exam: MAModuleSpecific | null,
): MigrationScenarioNarrow | null {
  if (!exam) return null;
  const ms = (exam as unknown as { migrationScenario?: Partial<MigrationScenarioNarrow> })
    .migrationScenario;
  if (!ms || typeof ms.newBusinessContext !== 'string') return null;
  return {
    newBusinessContext: ms.newBusinessContext,
    relatedDimension: ms.relatedDimension ?? '',
    differingDimension: ms.differingDimension ?? '',
    promptText: ms.promptText ?? '',
  };
}

/**
 * Substantivity heuristic: length coverage × 0.5 + tech-term density × 0.5.
 * Shared across sReasoningDepth / sContextQuality / sPrincipleAbstraction
 * when ground-truth keywords are unavailable.
 */
export function substantivity(
  text: string,
  targetChars: number,
  targetTerms: number,
): { value: number; termHits: string[] } {
  const trimmed = text?.trim() ?? '';
  if (trimmed.length === 0) return { value: 0, termHits: [] };
  const lengthCoverage = Math.min(1, trimmed.length / (targetChars * 2));
  const { hits } = countTechTerms(trimmed);
  const densityCoverage = Math.min(1, hits.length / targetTerms);
  const value = 0.5 * lengthCoverage + 0.5 * densityCoverage;
  return { value: clamp01(value), termHits: hits };
}
