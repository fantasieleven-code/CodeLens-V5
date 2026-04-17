/**
 * MB signal-local helpers.
 *
 * Shared across the 18 MB signals (Task 13c) under Stage 1 / Stage 2 exec /
 * Cursor / Stage 2 quality / Stage 3 + AI + horizontal / Stage 4. Layout
 * mirrors p0/types.ts and ma/types.ts.
 *
 * Two reference docs govern this module:
 *   1. backend-agent-tasks.md L92-133 — coarse signal list + Cursor pseudocode
 *      (superseded by design-reference-full.md for formulas).
 *   2. design-reference-full.md L1588-1762 (P1-Q16) — authoritative formulas
 *      for the 5 Cursor signals (accept-rate / chat-vs-direct / nav / test-first /
 *      edit-pattern). Implementation follows these.
 *   3. v5-design-clarifications.md L481-588 (Round 2 Part 3 调整 4) —
 *      sDecisionLatencyQuality (Round 3 new signal) + tab-visibility tracking.
 *
 * V5-native deviation (documented):
 *   sChatVsDirectRatio pseudocode (design-reference-full.md L1622-1648) calls
 *   `countKeystrokeSequences(events, 10)` over raw keystrokes. V5 shared shape
 *   aggregates to `editSessions[].keystrokeCount` — no raw keystrokes available.
 *   Substitute: each editSession with keystrokeCount >= 10 counts as one
 *   direct-keystroke-sequence action. Matches the "bursts of typing" intent.
 */
import type { MBModuleSpecific, SignalEvidence, SignalResult } from '@codelens-v5/shared';
import { SIGNAL_EVIDENCE_LIMIT } from '@codelens-v5/shared';

export const EVIDENCE_EXCERPT_MAX = 200;

// ───────────────────────────── generic helpers ─────────────────────────────

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
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

/** CJK-aware word count (latin-tokens OR CJK-chars, whichever is larger). */
export function wordCount(text: string): number {
  if (!text) return 0;
  const latin = text.trim().split(/\s+/).filter(Boolean).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return Math.max(latin, cjk);
}

// ───────────────────────────── MB exam narrow ─────────────────────────────

export function getMbExamData(
  examData: Partial<Record<string, Record<string, unknown>>>,
): MBModuleSpecific | null {
  const raw = examData.MB;
  if (!raw) return null;
  return raw as unknown as MBModuleSpecific;
}

// ───────────────────────────── Kendall tau ─────────────────────────────

/**
 * Kendall tau rank correlation between a candidate order and a reference
 * order over a shared set of items. Items in `candidate` not present in
 * `reference` are discarded. Returns tau in [-1, 1] or null when the filtered
 * candidate has <2 items (no pairs).
 *
 *   tau = (concordant - discordant) / (concordant + discordant)
 *
 * Used by sFileNavigationEfficiency (open order) and sEditPatternQuality
 * (first-edit order). Caller typically maps (tau + 1) / 2 → [0, 1].
 */
export function kendallTau(candidate: string[], reference: string[]): number | null {
  const referenceRank = new Map<string, number>();
  reference.forEach((item, i) => referenceRank.set(item, i));
  const filtered = candidate.filter((item) => referenceRank.has(item));
  if (filtered.length < 2) return null;

  let concordant = 0;
  let discordant = 0;
  for (let i = 0; i < filtered.length; i++) {
    for (let j = i + 1; j < filtered.length; j++) {
      const ri = referenceRank.get(filtered[i])!;
      const rj = referenceRank.get(filtered[j])!;
      if (ri < rj) concordant += 1;
      else if (ri > rj) discordant += 1;
    }
  }
  const total = concordant + discordant;
  if (total === 0) return 0;
  return (concordant - discordant) / total;
}

// ───────────────────────────── rules parsing markers ─────────────────────────────

/**
 * Categories used by sRulesCoverage. A `rulesContent` is considered to
 * cover a category if any marker from that category's keyword list appears
 * (case-insensitive, CJK-match direct).
 *
 * Matches the coverage categories in design-reference-full.md "standards"
 * section + Task 13c brief's 5 categories: bug 防范 / 代码质量 / 测试 /
 * 日志 / 错误处理.
 */
export const RULES_CATEGORY_MARKERS: Record<string, readonly string[]> = {
  bug_prevention: [
    'bug',
    '错误',
    '异常',
    'validate',
    'validation',
    '校验',
    'null',
    'undefined',
    '边界',
    'boundary',
    'crash',
    'defensive',
  ],
  code_quality: [
    '命名',
    'naming',
    '可读',
    'readab',
    'maintain',
    '可维护',
    'refactor',
    '重构',
    'complexity',
    '复杂度',
    'dry',
    'single responsibility',
    '职责',
  ],
  testing: [
    'test',
    '测试',
    'unit test',
    'integration',
    'coverage',
    '覆盖率',
    'assertion',
    '断言',
    'mock',
    'stub',
    'spec',
  ],
  logging: [
    'log',
    '日志',
    'logger',
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    '记录',
    'observ',
  ],
  error_handling: [
    'try',
    'catch',
    'throw',
    'error handl',
    '错误处理',
    '异常处理',
    'fallback',
    '降级',
    'retry',
    '重试',
    'timeout',
    '超时',
    'recover',
  ],
};

/**
 * Imperative markers (command voice). sRulesQuality prefers imperative
 * phrasing ("Do X" / "不要 Y") over narrative ("我觉得").
 */
export const IMPERATIVE_MARKERS: readonly string[] = [
  '必须',
  '应该',
  '不要',
  '禁止',
  '需要',
  '确保',
  '请',
  '避免',
  '始终',
  '永远',
  'must',
  'should',
  'do not',
  "don't",
  'always',
  'never',
  'ensure',
  'require',
  'avoid',
  'prefer',
  'use',
];

/**
 * Example-indication markers. sRulesQuality rewards rules that illustrate
 * with examples ("比如" / "e.g." / ":") over abstract rules-only text.
 */
export const EXAMPLE_MARKERS: readonly string[] = [
  '比如',
  '例如',
  '举例',
  '示例',
  'e.g.',
  'for example',
  'example:',
  '如:',
  '如：',
];

/**
 * Specificity penalty markers (泛泛而谈 / generic filler). sRulesSpecificity
 * penalizes rules that lean on these without concrete conditions / thresholds.
 */
export const GENERIC_FILLER_MARKERS: readonly string[] = [
  '尽量',
  '尽可能',
  '适当',
  '合理',
  '注意',
  '一些',
  '某些',
  'try to',
  'as much as possible',
  'appropriate',
  'reasonable',
  'some',
];

/**
 * Specificity reward markers: concrete thresholds, numbers, specific APIs.
 * sRulesSpecificity rewards rules that include:
 *   - numeric thresholds (N ms / N lines / N%)
 *   - specific library / function names
 *   - "if X then Y" conditionals
 */
export const SPECIFICITY_REWARD_PATTERNS: readonly RegExp[] = [
  /\d+\s*(ms|seconds?|minutes?|hours?|lines?|chars?|%|秒|分钟|小时|行|字符)/i,
  /\b(if|when|如果|当)\b/i,
  /\b\w+\(\)/,
  /`[^`]+`/,
];

// ───────────────────────────── direct-action counting ─────────────────────────────

/**
 * V5-native substitute for design-reference-full.md L1644's
 * `countKeystrokeSequences(events, minLength)`. The shared schema aggregates
 * keystrokes into `editSessions[].keystrokeCount`, so "sequences" ≈ sessions
 * with non-trivial keystroke volume. `minKeystrokes` threshold preserves the
 * "bursts of typing only" intent.
 */
export function countDirectActionSessions(
  sessions: Array<{ keystrokeCount: number }>,
  minKeystrokes = 10,
): number {
  return sessions.filter((s) => s.keystrokeCount >= minKeystrokes).length;
}

// ───────────────────────────── text-scan helpers ─────────────────────────────

export function markerHits(text: string, markers: readonly string[]): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  return markers.filter((m) => lower.includes(m.toLowerCase()) || text.includes(m));
}

export function regexHits(text: string, patterns: readonly RegExp[]): number {
  if (!text) return 0;
  let n = 0;
  for (const p of patterns) if (p.test(text)) n += 1;
  return n;
}

/**
 * Count how many of the category keys in `markers` have at least one hit
 * in `text`. Used by sRulesCoverage (5-category coverage).
 */
export function categoryCoverage(
  text: string,
  markers: Record<string, readonly string[]>,
): { covered: number; total: number; hitCategories: string[] } {
  const hitCategories: string[] = [];
  for (const [category, words] of Object.entries(markers)) {
    if (markerHits(text, words).length > 0) hitCategories.push(category);
  }
  return { covered: hitCategories.length, total: Object.keys(markers).length, hitCategories };
}
