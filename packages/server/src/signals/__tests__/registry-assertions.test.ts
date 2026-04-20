/**
 * V5.0 signal catalog gate — Task 13e.
 *
 * This file is the cross-cutting CI contract that all 48 `SignalDefinition`s
 * must satisfy before Task 13e can merge. It asserts the 5 invariants from
 * Round 2 Part 7 and the 1 additional evidence-shape invariant from Round 3
 * 重构 1 (Task A1 raised the contract from 47 → 48 by adding sCalibration):
 *
 *   1. Total count = `EXPECTED_SIGNAL_COUNT` (48).
 *   2. Dimension breakdown — TJ=9, AE=14, CQ=12, Comm=3, Meta=7, SD=3.
 *   3. `isLLMWhitelist === true` signals = exactly 3, namely
 *      `sDesignDecomposition` / `sTradeoffArticulation` /
 *      `sAiOrchestrationQuality` (all MD).
 *   4. Round 3 Part 2 新增 signals are registered (sAiClaimDetection,
 *      sPrincipleAbstraction, sBeliefUpdateMagnitude, sDecisionLatencyQuality).
 *   5. Every signal declares a valid `dimension` + `compute` function; LLM
 *      whitelist signals additionally declare `fallback`.
 *   6. Every signal's `compute` (or `fallback` for LLM signals) returns a
 *      well-formed `SignalResult`: `value` is number|null, `evidence` is a
 *      capped (≤ `SIGNAL_EVIDENCE_LIMIT`) array, `computedAt` is epoch ms,
 *      `algorithmVersion` matches `/^s\w+@v\d+(_\w+)?$/`.
 *
 * Keep this file minimal and metadata-only — archetype calibration lives in
 * each module's own signal suite. If a future task raises the catalog (V5.1+),
 * update `EXPECTED_SIGNAL_COUNT` in `signals/index.ts` and the breakdown here
 * in the same PR.
 */

import { describe, it, expect } from 'vitest';
import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type SignalDefinition,
  type SignalInput,
  type SignalRegistry,
  type SignalResult,
} from '@codelens-v5/shared';
import { registerAllSignals, EXPECTED_SIGNAL_COUNT } from '../index.js';

const ALGORITHM_VERSION_PATTERN = /^s\w+@v\d+(_\w+)?$/;

/**
 * Inline registry avoids importing `SignalRegistryImpl` — that pulls in
 * `lib/langfuse.ts` which loads `config/env.ts` at module scope and
 * `process.exit(1)`s when DATABASE_URL / JWT_SECRET are unset in the
 * vitest `test` job. The gate only needs `register` + read accessors; we
 * do not exercise retry / trace / timeout here (covered by
 * `services/signal-registry.service.test.ts`).
 */
class InlineRegistry implements SignalRegistry {
  private readonly signals = new Map<string, SignalDefinition>();
  register(def: SignalDefinition): void {
    if (this.signals.has(def.id)) throw new Error(`duplicate signal id: ${def.id}`);
    this.signals.set(def.id, def);
  }
  async computeAll() {
    return {};
  }
  getDimensionSignals(dim: V5Dimension): SignalDefinition[] {
    return Array.from(this.signals.values()).filter((s) => s.dimension === dim);
  }
  getSignalCount(): number {
    return this.signals.size;
  }
  listSignals(): SignalDefinition[] {
    return Array.from(this.signals.values());
  }
}

function buildRegistry(): InlineRegistry {
  const registry = new InlineRegistry();
  registerAllSignals(registry);
  return registry;
}

function emptyInput(): SignalInput {
  return {
    sessionId: 'registry-assertions',
    suiteId: 'full_stack',
    submissions: {},
    examData: {},
    participatingModules: [],
  };
}

function assertResultShape(result: SignalResult, signalId: string): void {
  const { value, evidence, computedAt, algorithmVersion } = result;
  if (value !== null) {
    expect(typeof value, `${signalId}: value must be number|null`).toBe('number');
    expect(Number.isFinite(value), `${signalId}: value must be finite`).toBe(true);
  }
  expect(Array.isArray(evidence), `${signalId}: evidence must be array`).toBe(true);
  expect(evidence.length, `${signalId}: evidence cap`).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
  expect(typeof computedAt, `${signalId}: computedAt must be number`).toBe('number');
  expect(Number.isFinite(computedAt), `${signalId}: computedAt finite`).toBe(true);
  expect(algorithmVersion, `${signalId}: algorithmVersion pattern`).toMatch(
    ALGORITHM_VERSION_PATTERN,
  );
}

// ────────────────────── 1. Total count ──────────────────────

describe('V5.0 gate — total signal count', () => {
  it(`EXPECTED_SIGNAL_COUNT === 48`, () => {
    expect(EXPECTED_SIGNAL_COUNT).toBe(48);
  });

  it('registerAllSignals registers exactly 48 signals', () => {
    const registry = buildRegistry();
    expect(registry.getSignalCount()).toBe(EXPECTED_SIGNAL_COUNT);
  });

  it('no duplicate signal ids', () => {
    const registry = buildRegistry();
    const ids = registry.listSignals().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ────────────────────── 2. Dimension breakdown ──────────────────────

describe('V5.0 gate — dimension breakdown', () => {
  const EXPECTED: Record<V5Dimension, number> = {
    [V5Dimension.TECHNICAL_JUDGMENT]: 9,
    [V5Dimension.AI_ENGINEERING]: 14,
    [V5Dimension.CODE_QUALITY]: 12,
    [V5Dimension.COMMUNICATION]: 3,
    [V5Dimension.METACOGNITION]: 7,
    [V5Dimension.SYSTEM_DESIGN]: 3,
  };

  for (const [dim, expected] of Object.entries(EXPECTED) as Array<[V5Dimension, number]>) {
    it(`${dim} has exactly ${expected} signal(s)`, () => {
      const registry = buildRegistry();
      const signals = registry.getDimensionSignals(dim);
      expect(signals.length).toBe(expected);
    });
  }

  it('dimension counts sum to 48', () => {
    const sum = Object.values(EXPECTED).reduce((a, b) => a + b, 0);
    expect(sum).toBe(EXPECTED_SIGNAL_COUNT);
  });

  it('every registered signal has a dimension from V5Dimension enum', () => {
    const registry = buildRegistry();
    const allowed = new Set<string>(Object.values(V5Dimension));
    for (const sig of registry.listSignals()) {
      expect(allowed.has(sig.dimension), `${sig.id} dimension=${sig.dimension}`).toBe(true);
    }
  });
});

// ────────────────────── 3. LLM whitelist ──────────────────────

describe('V5.0 gate — LLM whitelist', () => {
  const EXPECTED_LLM_IDS = [
    'sAiOrchestrationQuality',
    'sDesignDecomposition',
    'sTradeoffArticulation',
  ];

  it('exactly 3 signals carry isLLMWhitelist=true', () => {
    const registry = buildRegistry();
    const llm = registry.listSignals().filter((s) => s.isLLMWhitelist);
    expect(llm.length).toBe(3);
  });

  it('LLM whitelist members are the 3 MD signals (sorted)', () => {
    const registry = buildRegistry();
    const ids = registry
      .listSignals()
      .filter((s) => s.isLLMWhitelist)
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual(EXPECTED_LLM_IDS);
  });

  it('every LLM whitelist signal has a fallback + is sourced from MD', () => {
    const registry = buildRegistry();
    for (const sig of registry.listSignals().filter((s) => s.isLLMWhitelist)) {
      expect(typeof sig.fallback, `${sig.id} must have fallback`).toBe('function');
      expect(sig.moduleSource, `${sig.id} moduleSource`).toBe('MD');
    }
  });

  it('no pure-rule signal has isLLMWhitelist=true', () => {
    const registry = buildRegistry();
    const nonMd = registry.listSignals().filter((s) => s.moduleSource !== 'MD');
    for (const sig of nonMd) {
      expect(sig.isLLMWhitelist, `${sig.id} must be pure-rule`).toBe(false);
    }
  });
});

// ────────────────────── 4. Round 3 Part 2 新增 signals ──────────────────────

describe('V5.0 gate — Round 3 新增 signals registered', () => {
  const ROUND3_NEW_SIGNALS = [
    'sAiClaimDetection',
    'sPrincipleAbstraction',
    'sBeliefUpdateMagnitude',
    'sDecisionLatencyQuality',
  ];

  it.each(ROUND3_NEW_SIGNALS)('%s is registered', (id) => {
    const registry = buildRegistry();
    const ids = new Set(registry.listSignals().map((s) => s.id));
    expect(ids.has(id), `missing: ${id}`).toBe(true);
  });
});

// ────────────────────── 5. SignalDefinition integrity ──────────────────────

describe('V5.0 gate — SignalDefinition integrity', () => {
  it('every signal exposes id / dimension / moduleSource / compute / isLLMWhitelist', () => {
    const registry = buildRegistry();
    for (const sig of registry.listSignals()) {
      expect(typeof sig.id, 'id').toBe('string');
      expect(sig.id.length, `${sig.id} id non-empty`).toBeGreaterThan(0);
      expect(typeof sig.dimension, `${sig.id} dimension`).toBe('string');
      expect(typeof sig.moduleSource, `${sig.id} moduleSource`).toBe('string');
      expect(typeof sig.compute, `${sig.id} compute`).toBe('function');
      expect(typeof sig.isLLMWhitelist, `${sig.id} isLLMWhitelist`).toBe('boolean');
    }
  });

  it('moduleSource is one of the 6 V5 module types', () => {
    const registry = buildRegistry();
    const allowed = new Set(['P0', 'MA', 'MB', 'MC', 'MD', 'SE']);
    for (const sig of registry.listSignals()) {
      expect(allowed.has(sig.moduleSource), `${sig.id} moduleSource=${sig.moduleSource}`).toBe(
        true,
      );
    }
  });

  it('signal ids are camelCase and prefixed with "s"', () => {
    const registry = buildRegistry();
    for (const sig of registry.listSignals()) {
      expect(sig.id, `${sig.id}`).toMatch(/^s[A-Z][A-Za-z0-9]+$/);
    }
  });
});

// ────────────────────── 6. Evidence shape contract (Round 3 重构 1) ──────────────────────

describe('V5.0 gate — SignalResult shape contract', () => {
  /**
   * Every signal's compute must short-circuit cleanly on an empty input and
   * return a well-formed SignalResult; LLM signals call `fallback` here to
   * avoid provider-mocking in the gate file (per-signal suites cover the
   * live-LLM path).
   */
  it('all 48 signals return well-formed SignalResult on empty input', async () => {
    const registry = buildRegistry();
    const input = emptyInput();
    const signals: SignalDefinition[] = registry.listSignals();
    expect(signals.length).toBe(EXPECTED_SIGNAL_COUNT);

    for (const sig of signals) {
      const result =
        sig.isLLMWhitelist && sig.fallback ? sig.fallback(input) : await sig.compute(input);
      assertResultShape(result, sig.id);
    }
  });

  it('empty-input computes return value=null (signal not applicable)', async () => {
    const registry = buildRegistry();
    const input = emptyInput();
    for (const sig of registry.listSignals()) {
      const result =
        sig.isLLMWhitelist && sig.fallback ? sig.fallback(input) : await sig.compute(input);
      expect(result.value, `${sig.id} should null-gate on empty input`).toBeNull();
      expect(result.evidence.length, `${sig.id} empty-evidence on null`).toBeLessThanOrEqual(
        SIGNAL_EVIDENCE_LIMIT,
      );
    }
  });
});
