/**
 * Task A14a · Pure-rule signal reliability gate.
 *
 * Asserts the 45 non-LLM signals (48 registered − 3 in
 * `NON_DETERMINISTIC_SIGNAL_IDS`) return deep-equal results on back-to-back
 * `computeAll` calls against identical input. The 4 Golden Path fixtures
 * (Liam S / Steve A / Emma B / Max D) drive coverage: 4 × 45 = 180 invariant
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

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NON_DETERMINISTIC_SIGNAL_IDS,
  type SignalInput,
  type SignalResult,
  type SignalResults,
} from '@codelens-v5/shared';

const llmMockState = vi.hoisted(() => ({
  scoresByPromptKey: new Map<string, number[]>(),
  calls: [] as Array<{ promptKey: string; score: number }>,
}));

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

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(
      async (key: string) =>
        `promptKey=${key}\nsubmission={{subModules}}{{tradeoffText}}{{aiOrchestrationPrompts}}`,
    ),
  },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(
      async (_role: string, req: { messages: Array<{ role: string; content: string }> }) => {
        const userPrompt = req.messages.find((m) => m.role === 'user')?.content ?? '';
        const promptKey = userPrompt.match(/promptKey=([^\n]+)/)?.[1];
        if (!promptKey) throw new Error('A14b mock missing promptKey marker');
        const sequence = llmMockState.scoresByPromptKey.get(promptKey);
        const score = sequence?.shift();
        if (score === undefined) {
          throw new Error(`A14b mock score exhausted for ${promptKey}`);
        }
        llmMockState.calls.push({ promptKey, score });
        return {
          content: JSON.stringify({
            score,
            notes: `A14b deterministic variance sample for ${promptKey}`,
          }),
          providerId: 'a14b-mock',
          model: 'mock-md-variance',
          latencyMs: 12,
        };
      },
    ),
  },
}));
import { SignalRegistryImpl } from '../../services/signal-registry.service.js';
import { EXPECTED_SIGNAL_COUNT, registerAllSignals } from '../../signals/index.js';
import { liamSGradeFixture } from '../../tests/fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../../tests/fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../../tests/fixtures/golden-path/emma-b-grade.js';
import { maxDGradeFixture } from '../../tests/fixtures/golden-path/max-d-grade.js';
import { modelFactory } from '../../services/model/index.js';

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
  { name: 'Max · D-grade', input: maxDGradeFixture as SignalInput },
] as const;

const registry = new SignalRegistryImpl();
registerAllSignals(registry);

const PURE_RULE_SIGNAL_IDS = registry
  .listSignals()
  .filter((def) => !def.isLLMWhitelist)
  .map((def) => def.id)
  .sort();

const LLM_SIGNAL_IDS = registry
  .listSignals()
  .filter((def) => def.isLLMWhitelist)
  .map((def) => def.id)
  .sort();

const LLM_VARIANCE_RUNS = 3;
const LLM_VARIANCE_TOLERANCE = 0.04;

const A14B_MD_INPUT: SignalInput = {
  sessionId: 'a14b-md-variance',
  suiteId: 'architect',
  participatingModules: ['moduleD'],
  examData: {},
  submissions: {
    moduleD: {
      subModules: [
        {
          name: 'OrderController',
          responsibility:
            'Validates write requests, applies rate limits, and delegates order creation.',
          interfaces: ['POST /orders'],
        },
        {
          name: 'InventoryReservationService',
          responsibility:
            'Uses Redis Lua to reserve stock atomically and emits compensation events.',
          interfaces: ['reserve(skuId, qty)', 'release(orderId)'],
        },
        {
          name: 'OrderPersistence',
          responsibility:
            'Persists idempotent order records in MySQL and exposes reconciliation queries.',
          interfaces: ['create(order)', 'findByRequestId(requestId)'],
        },
      ],
      interfaceDefinitions: [
        'POST /orders {skuId, qty, requestId} -> 200 {orderId} / 409 Oversold',
        'reserve(skuId, qty) -> Promise<{ok, remain}>',
      ],
      dataFlowDescription:
        'Client -> OrderController -> InventoryReservationService -> OrderPersistence -> event bus -> reconciliation worker.',
      constraintsSelected: ['性能', '一致性', '可用性', '可维护性'],
      tradeoffText:
        'Option A keeps all writes in MySQL for strong consistency but cannot meet peak QPS. Option B uses Redis only and is fast but risks reconciliation gaps. I recommend Option C: Redis reservation plus MySQL final persistence, accepting reconciliation complexity to keep latency and correctness balanced.',
      aiOrchestrationPrompts: [
        'Goal: implement reserve(skuId, qty). Constraints: atomic, idempotent, timeout below 300ms. Output: typed result and OversoldError branch.',
        'Task: generate compensation worker pseudocode. Steps: read failed event, release reservation, retry three times, then alert.',
        'Objective: review OrderPersistence for idempotency. Must check unique requestId and transaction boundaries.',
      ],
    },
  },
};

function seedA14bScoreSequences(): void {
  llmMockState.calls.length = 0;
  llmMockState.scoresByPromptKey = new Map([
    ['md.llm_whitelist.decomposition', [0.82, 0.84, 0.81]],
    ['md.llm_whitelist.tradeoff', [0.91, 0.89, 0.92]],
    ['md.llm_whitelist.ai_orch', [0.77, 0.79, 0.76]],
  ]);
}

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

describe('A14b · LLM signal variance monitoring', () => {
  beforeEach(() => {
    vi.mocked(modelFactory.generate).mockClear();
    seedA14bScoreSequences();
  });

  it('covers all 3 LLM-whitelist signals', () => {
    expect(LLM_SIGNAL_IDS).toEqual([
      'sAiOrchestrationQuality',
      'sDesignDecomposition',
      'sTradeoffArticulation',
    ]);
  });

  it('keeps repeated LLM samples inside the ratified tolerance band', async () => {
    const runs: SignalResults[] = [];
    for (let i = 0; i < LLM_VARIANCE_RUNS; i++) {
      runs.push(await registry.computeAll(A14B_MD_INPUT));
    }

    for (const signalId of LLM_SIGNAL_IDS) {
      const values = runs.map((r) => r[signalId]?.value);
      expect(values, `${signalId} missing LLM values`).toHaveLength(LLM_VARIANCE_RUNS);
      const numeric = values.filter((v): v is number => typeof v === 'number');
      expect(numeric, `${signalId} non-numeric LLM values`).toHaveLength(LLM_VARIANCE_RUNS);

      const spread = Math.max(...numeric) - Math.min(...numeric);
      expect(spread, `${signalId} spread ${spread}`).toBeLessThanOrEqual(LLM_VARIANCE_TOLERANCE);

      const versions = runs.map((r) => r[signalId]?.algorithmVersion);
      expect(versions.every((v) => v?.endsWith('_llm'))).toBe(true);
    }

    expect(vi.mocked(modelFactory.generate)).toHaveBeenCalledTimes(
      LLM_SIGNAL_IDS.length * LLM_VARIANCE_RUNS,
    );
  });
});
