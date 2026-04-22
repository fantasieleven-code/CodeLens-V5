/**
 * Task A14a · Pure-rule signal reliability gate.
 *
 * Asserts the 45 non-LLM signals (48 registered − 3 in
 * `NON_DETERMINISTIC_SIGNAL_IDS`) return deep-equal results on back-to-back
 * `computeAll` calls against identical input. The 4 Golden Path fixtures
 * (Liam S / Steve A / Emma B / Max C) drive coverage: 4 × 45 = 180 invariant
 * checks + 1 algorithm-version-format sweep + 1 A14b placeholder = 182 total.
 *
 * Determinism = no `Date.now()` / `Math.random()` / iteration-order hazards
 * baked into a signal's `value` / `evidence` / `algorithmVersion`. The
 * `SignalResult.computedAt` metadata stamp is intentionally stripped before
 * comparison (three-view ratify OQ4-α) because it is written by the signal
 * or registry at call time — not part of the deterministic payload. V5.0.5
 * candidate (observation #142): move the `computedAt` stamp to the
 * orchestrator/hydrator layer so `signal.compute` returns pure data.
 *
 * Drift note — brief Appendix A listed 4 LLM signals; grep on
 * `isLLMWhitelist: true` + cross-check with md-se-signals.test.ts confirmed
 * 3 (`sAiOrchestrationQuality`, `sDesignDecomposition`,
 * `sTradeoffArticulation`). `sConstraintIdentification` is pure-rule and is
 * covered by this gate.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  NON_DETERMINISTIC_SIGNAL_IDS,
  type SignalInput,
  type SignalResult,
  type SignalResults,
} from '@codelens-v5/shared';

// Registry → langfuse → env loader would `process.exit(1)` without
// DATABASE_URL / JWT_SECRET. Same mock the cold-start-validation harness uses;
// the registry's LLM path never fires in this suite (all MD signals non-
// participating under GOLDEN_PATH_PARTICIPATING_MODULES), but the static
// import chain still pulls env loading unless we short-circuit here.
vi.mock('../../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));
import { SignalRegistryImpl } from '../../services/signal-registry.service.js';
import { EXPECTED_SIGNAL_COUNT, registerAllSignals } from '../../signals/index.js';
import { liamSGradeFixture } from '../../tests/fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../../tests/fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../../tests/fixtures/golden-path/emma-b-grade.js';
import { maxCGradeFixture } from '../../tests/fixtures/golden-path/max-c-grade.js';

// OQ4-α helper: compare the deterministic payload; drop the `computedAt`
// timestamp. Matches brief §5 D5 verbatim.
const stripTs = (r: SignalResult) => ({
  value: r.value,
  evidence: r.evidence,
  algorithmVersion: r.algorithmVersion,
});

const FIXTURES = [
  { name: 'Liam · S-grade', input: liamSGradeFixture as SignalInput },
  { name: 'Steve · A-grade', input: steveAGradeFixture as SignalInput },
  { name: 'Emma · B-grade', input: emmaBGradeFixture as SignalInput },
  { name: 'Max · C-grade', input: maxCGradeFixture as SignalInput },
] as const;

const registry = new SignalRegistryImpl();
registerAllSignals(registry);

const PURE_RULE_SIGNAL_IDS = registry
  .listSignals()
  .filter((def) => !def.isLLMWhitelist)
  .map((def) => def.id)
  .sort();

describe('A14a · registry ↔ NON_DETERMINISTIC_SIGNAL_IDS invariants', () => {
  it('registry holds the full 48-signal catalog', () => {
    expect(registry.getSignalCount()).toBe(EXPECTED_SIGNAL_COUNT);
  });

  it('NON_DETERMINISTIC_SIGNAL_IDS matches isLLMWhitelist=true signals exactly', () => {
    const llmIds = registry
      .listSignals()
      .filter((def) => def.isLLMWhitelist)
      .map((def) => def.id)
      .sort();
    expect(llmIds).toEqual(Array.from(NON_DETERMINISTIC_SIGNAL_IDS).sort());
  });

  it('pure-rule signal count is 45 (48 − 3 LLM)', () => {
    expect(PURE_RULE_SIGNAL_IDS).toHaveLength(45);
  });
});

describe.each(FIXTURES)('A14a · pure-rule determinism · $name', ({ input }) => {
  let run1: SignalResults;
  let run2: SignalResults;

  beforeAll(async () => {
    run1 = await registry.computeAll(input);
    run2 = await registry.computeAll(input);
  });

  it.each(PURE_RULE_SIGNAL_IDS)(
    '%s returns deep-equal payload across repeated computeAll',
    (signalId) => {
      expect(run1[signalId], `run1 missing ${signalId}`).toBeDefined();
      expect(run2[signalId], `run2 missing ${signalId}`).toBeDefined();
      expect(stripTs(run2[signalId]!)).toEqual(stripTs(run1[signalId]!));
    },
  );
});

describe('A14a · pure-rule algorithm version format', () => {
  const PURE_RULE_VERSION_REGEX = /^s\w+@v\d+$/;

  it('all 45 pure-rule signals stamp algorithmVersion matching ^s\\w+@v\\d+$', async () => {
    const results = await registry.computeAll(liamSGradeFixture as SignalInput);
    const offenders: Array<{ id: string; version: string }> = [];
    for (const id of PURE_RULE_SIGNAL_IDS) {
      const version = results[id]?.algorithmVersion ?? '<missing>';
      // `registry@skipped` is stamped when a signal's moduleSource is not in
      // participatingModules (Golden Path omits moduleD → sConstraintIdentification
      // is skipped). Brief §3 D5 invariant: the signal's OWN versioned stamp,
      // read via a direct compute, must match the canonical format.
      if (version === 'registry@skipped') {
        const def = registry.listSignals().find((d) => d.id === id)!;
        const direct = await def.compute(liamSGradeFixture as SignalInput);
        if (!PURE_RULE_VERSION_REGEX.test(direct.algorithmVersion)) {
          offenders.push({ id, version: direct.algorithmVersion });
        }
        continue;
      }
      if (!PURE_RULE_VERSION_REGEX.test(version)) {
        offenders.push({ id, version });
      }
    }
    expect(offenders).toEqual([]);
  });
});

// A14b (V5.0.5) will layer variance monitoring on top of the 3 LLM-whitelist
// signals. Deferred here on purpose: LLM variance needs a different
// contract — tolerance band, not deep-equal — and lives in the scoring-quality
// backlog rather than the V5.0 ship gate. The skip placeholder is an
// explicit marker so future readers see the gap is a known V5.0.5 slot, not
// an oversight.
describe.skip('A14b · LLM signal variance monitoring (V5.0.5 deferred)', () => {
  it('LLM signal results remain within tolerance band across repeated runs', () => {
    // Placeholder — implementation deferred to V5.0.5 Task A14b.
  });
});
