/**
 * MD signal-local helpers.
 *
 * Shared across the 4 MD signals (Task 13d) — sConstraintIdentification
 * (pure rule) plus the 3 LLM-whitelist signals (sDesignDecomposition,
 * sTradeoffArticulation, sAiOrchestrationQuality). Layout mirrors p0/types.ts
 * and mb/types.ts.
 *
 * Reference docs:
 *   - backend-agent-tasks.md L137-145 — MD signal summary + LLM strategy
 *     (30s timeout → fallback, 1x retry, Langfuse trace).
 *   - design-reference-full.md L996-999 — MD dimension mapping.
 */

import type { MDModuleSpecific, SignalEvidence, SignalResult } from '@codelens-v5/shared';
import { SIGNAL_EVIDENCE_LIMIT } from '@codelens-v5/shared';

export const EVIDENCE_EXCERPT_MAX = 200;

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

export function getMdExamData(
  examData: Partial<Record<string, Record<string, unknown>>>,
): MDModuleSpecific | null {
  const raw = examData.MD;
  if (!raw) return null;
  return raw as unknown as MDModuleSpecific;
}

/**
 * CJK-aware text length proxy. Returns the larger of latin-token count and
 * CJK-character count, so a 200-char Chinese essay scores comparably to a
 * 200-token English essay.
 */
export function textVolume(text: string): number {
  if (!text) return 0;
  const latin = text.trim().split(/\s+/).filter(Boolean).length;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return Math.max(latin, cjk);
}
