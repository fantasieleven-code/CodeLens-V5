/**
 * sCommunicationClarity — Task 13e (MC, communication dimension).
 *
 * Per-round score = len × 0.3 + structure × 0.3 + technical × 0.4 averaged
 * across substantive (≥30 char) answers (design-reference-full.md L2029-2070).
 *
 * Factor 1 — length reasonableness (30%):
 *   len in [30, 150]            → 1.0
 *   len <= 30                   → len / 30
 *   len > 150                   → max(0, 1 - (len - 150) / 300)  (0 at 450+)
 *
 * Factor 2 — structure markers (30%):
 *   count in ['首先','其次','最后','另外','原因','方法','结果']
 *   normalized as min(1, count / 2)
 *
 * Factor 3 — technical-term density (40%):
 *   `extractTechnicalTerms` returns a count, normalized min(1, n / 3).
 *   Implementation notes on the heuristics live above the function below.
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
  clamp01,
  countMarkers,
  finalize,
  nullResult,
  substantiveAnswers,
  truncate,
} from './types.js';

const ALGORITHM_VERSION = 'sCommunicationClarity@v1';

const STRUCTURE_MARKERS = [
  '首先',
  '其次',
  '最后',
  '另外',
  '原因',
  '方法',
  '结果',
] as const;

/**
 * Heuristics for "technical term" density. LLM-extraction is out of scope
 * for the pure-rule path; design-reference-full.md calls it "具体技术术语
 * (数据库名/框架名/算法名/具体数字)". We approximate with:
 *
 *   (a) CamelCase tokens (e.g. `PostgreSQL`, `RedisCluster`, `B+Tree`)
 *   (b) Lowercase identifiers with digits or dashes (`gpt-4o`, `v5.2`)
 *   (c) Common DB / tooling keyword list (case-insensitive)
 *   (d) Numeric literals with units / % / ms / qps / GB etc.
 *
 * Each class is counted (not unique) but capped at 10 per class to avoid
 * runaway numbers on repetitive copy-paste answers. Total = sum of class
 * counts.
 */
const TECHNICAL_KEYWORDS = [
  'postgres',
  'postgresql',
  'mysql',
  'redis',
  'mongodb',
  'elasticsearch',
  'kafka',
  'rabbitmq',
  'nginx',
  'docker',
  'kubernetes',
  'k8s',
  'react',
  'vue',
  'angular',
  'node',
  'nodejs',
  'typescript',
  'javascript',
  'python',
  'golang',
  'rust',
  'java',
  'grpc',
  'rest',
  'graphql',
  'websocket',
  'oauth',
  'jwt',
  'http',
  'https',
  'tcp',
  'udp',
  'sql',
  'nosql',
  'orm',
  'cdn',
  'gpu',
  'cpu',
  'ssd',
  'cache',
  'throttle',
  'rate limit',
  'b-tree',
  'b+树',
  '哈希',
  '索引',
  '事务',
  '主从',
  '分片',
  '消息队列',
  '缓存',
  '异步',
  '并发',
  '分布式',
  '微服务',
  'p99',
  'p95',
  'qps',
  'tps',
  'rps',
] as const;

const CAMEL_CASE = /\b[A-Z][a-z]+(?:[A-Z][a-z]+|\d+)+\b/g;
const LOWER_WITH_VERSION = /\b[a-z]{2,}[-.]\d+(?:\.\d+)?\b/g;
const NUMERIC_WITH_UNIT = /\b\d+(?:\.\d+)?\s?(?:%|ms|s|min|h|gb|mb|tb|k|qps|tps|x)\b/gi;

function countPattern(text: string, re: RegExp, cap = 10): number {
  const m = text.match(re);
  if (!m) return 0;
  return Math.min(m.length, cap);
}

export function extractTechnicalTerms(text: string): number {
  const lc = text.toLowerCase();
  let keywordHits = 0;
  for (const kw of TECHNICAL_KEYWORDS) {
    if (lc.includes(kw)) keywordHits += 1;
  }
  keywordHits = Math.min(keywordHits, 10);

  return (
    countPattern(text, CAMEL_CASE) +
    countPattern(text, LOWER_WITH_VERSION) +
    countPattern(text, NUMERIC_WITH_UNIT) +
    keywordHits
  );
}

function lengthScore(len: number): number {
  if (len >= 30 && len <= 150) return 1;
  if (len < 30) return len / 30;
  return Math.max(0, 1 - (len - 150) / 300);
}

async function computeCommunicationClarity(input: SignalInput): Promise<SignalResult> {
  const mc = input.submissions.moduleC;
  if (!mc || mc.length < MIN_MC_ROUNDS) return nullResult(ALGORITHM_VERSION);

  const substantive = substantiveAnswers(mc);
  if (substantive.length === 0) return nullResult(ALGORITHM_VERSION);

  let totalScore = 0;
  const evidence: SignalEvidence[] = [];

  for (const a of substantive) {
    const lenFactor = lengthScore(a.answer.length);
    const structureCount = countMarkers(a.answer, STRUCTURE_MARKERS);
    const structureFactor = Math.min(1, structureCount / 2);
    const techCount = extractTechnicalTerms(a.answer);
    const techFactor = Math.min(1, techCount / 3);

    const score = clamp01(lenFactor * 0.3 + structureFactor * 0.3 + techFactor * 0.4);
    totalScore += score;

    if (evidence.length < 5) {
      evidence.push({
        source: `submissions.moduleC.answers[round=${a.round}]`,
        excerpt: truncate(a.answer),
        contribution: score,
        triggeredRule: `clarity_len=${a.answer.length}_struct=${structureCount}_tech=${techCount}`,
      });
    }
  }

  const value = totalScore / substantive.length;
  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sCommunicationClarity: SignalDefinition = {
  id: 'sCommunicationClarity',
  dimension: V5Dimension.COMMUNICATION,
  moduleSource: 'MC',
  isLLMWhitelist: false,
  compute: computeCommunicationClarity,
};

export {
  ALGORITHM_VERSION as COMMUNICATION_CLARITY_VERSION,
  STRUCTURE_MARKERS,
  lengthScore,
};
