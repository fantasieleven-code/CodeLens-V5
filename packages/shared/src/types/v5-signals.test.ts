import { describe, expect, it } from 'vitest';
import { NON_DETERMINISTIC_SIGNAL_IDS } from './v5-signals.js';

describe('NON_DETERMINISTIC_SIGNAL_IDS (Task A14a)', () => {
  // Hard-coded count — a deliberate tripwire. Adding an LLM-whitelist signal
  // MUST update this assertion and the A14a reliability suite in lockstep,
  // otherwise a new non-deterministic signal would silently enter the
  // pure-rule deep-equal gate and begin flaking CI.
  it('size is exactly 3', () => {
    expect(NON_DETERMINISTIC_SIGNAL_IDS.size).toBe(3);
  });

  it('contains the 3 MD LLM-whitelist signal ids verbatim', () => {
    expect(NON_DETERMINISTIC_SIGNAL_IDS.has('sAiOrchestrationQuality')).toBe(true);
    expect(NON_DETERMINISTIC_SIGNAL_IDS.has('sDesignDecomposition')).toBe(true);
    expect(NON_DETERMINISTIC_SIGNAL_IDS.has('sTradeoffArticulation')).toBe(true);
  });
});
