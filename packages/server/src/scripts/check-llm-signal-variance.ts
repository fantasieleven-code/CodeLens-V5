import {
  NON_DETERMINISTIC_SIGNAL_IDS,
  type SignalInput,
} from '@codelens-v5/shared';

import { SignalRegistryImpl } from '../services/signal-registry.service.js';
import { modelFactory } from '../services/model/index.js';
import { registerAllSignals } from '../signals/index.js';
import {
  LLMVarianceDiagnosticError,
  classifyLLMVarianceError,
  summarizeLLMSignalSamples,
  type LLMSignalSample,
} from './llm-variance-diagnostics.js';

const RUNS = Number.parseInt(process.env.LLM_VARIANCE_RUNS ?? '3', 10);
const TOLERANCE = Number.parseFloat(process.env.LLM_VARIANCE_TOLERANCE ?? '0.08');
const FAIL_ON_SKIP = process.env.LLM_VARIANCE_FAIL_ON_SKIP === 'true';

const MD_VARIANCE_INPUT: SignalInput = {
  sessionId: 'nightly-md-llm-variance',
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

function ensureConfig(): void {
  if (!Number.isInteger(RUNS) || RUNS < 2) {
    throw new Error(
      `LLM_VARIANCE_RUNS must be an integer >= 2, got ${process.env.LLM_VARIANCE_RUNS}`,
    );
  }
  if (!Number.isFinite(TOLERANCE) || TOLERANCE <= 0 || TOLERANCE > 1) {
    throw new Error(
      `LLM_VARIANCE_TOLERANCE must be a number in (0, 1], got ${process.env.LLM_VARIANCE_TOLERANCE}`,
    );
  }
}

function scoringProvidersAvailable(): boolean {
  const available = modelFactory.getStatus().filter((provider) => provider.available);
  return available.some((provider) => provider.id === 'glm' || provider.id === 'claude');
}

async function main(): Promise<void> {
  ensureConfig();

  if (!scoringProvidersAvailable()) {
    const message =
      'Skipping real LLM signal variance: no GLM/Claude scoring provider secret is configured.';
    if (FAIL_ON_SKIP) {
      throw new Error(message);
    }
    console.log(`::notice::${message}`);
    return;
  }

  const registry = new SignalRegistryImpl();
  registerAllSignals(registry);

  const llmSignalIds = registry
    .listSignals()
    .filter((signal) => signal.isLLMWhitelist)
    .map((signal) => signal.id)
    .sort();
  const expected = Array.from(NON_DETERMINISTIC_SIGNAL_IDS).sort();
  if (JSON.stringify(llmSignalIds) !== JSON.stringify(expected)) {
    throw new Error(
      `LLM whitelist drift: registry=${JSON.stringify(llmSignalIds)} expected=${JSON.stringify(expected)}`,
    );
  }

  const llmSignals = registry
    .listSignals()
    .filter((signal) => signal.isLLMWhitelist)
    .sort((a, b) => a.id.localeCompare(b.id));

  const samplesBySignal = new Map<string, LLMSignalSample[]>();
  for (const signal of llmSignals) {
    const samples: LLMSignalSample[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      try {
        const result = await signal.compute(MD_VARIANCE_INPUT);
        samples.push({ value: result.value, algorithmVersion: result.algorithmVersion });
      } catch (err) {
        throw new LLMVarianceDiagnosticError(
          classifyLLMVarianceError(err),
          `${signal.id} live LLM sample ${i + 1}/${RUNS} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
          { signalId: signal.id, sample: i + 1 },
        );
      }
    }
    samplesBySignal.set(signal.id, samples);
  }

  const summary = llmSignalIds.map((signalId) =>
    summarizeLLMSignalSamples(signalId, samplesBySignal.get(signalId) ?? [], TOLERANCE),
  );

  console.log(
    JSON.stringify(
      {
        gate: 'md-llm-signal-variance',
        runs: RUNS,
        tolerance: TOLERANCE,
        summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof LLMVarianceDiagnosticError) {
    console.error(
      JSON.stringify(
        {
          gate: 'md-llm-signal-variance',
          status: 'failed',
          diagnosis: error.diagnosis,
          message: error.message,
          details: error.details,
        },
        null,
        2,
      ),
    );
  } else {
    console.error(error);
  }
  process.exit(1);
});
