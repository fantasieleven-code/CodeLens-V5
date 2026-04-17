/**
 * SE signal-local helpers.
 *
 * Shared across the SE signals folder (currently just sMetaCognition).
 * Layout mirrors p0/types.ts and md/types.ts.
 */
import type { SignalEvidence, SignalResult } from '@codelens-v5/shared';
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
