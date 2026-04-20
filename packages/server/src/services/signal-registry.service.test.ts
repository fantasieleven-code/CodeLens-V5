import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SignalDefinition,
  type SignalInput,
  type SignalResult,
  V5Dimension,
} from '@codelens-v5/shared';

// Mock Langfuse before importing the service so `getLangfuse()` is replaced.
const { traceMock } = vi.hoisted(() => ({ traceMock: vi.fn() }));
vi.mock('../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: traceMock,
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

import { SignalRegistryImpl } from './signal-registry.service.js';
import { registerAllSignals, EXPECTED_SIGNAL_COUNT } from '../signals/index.js';

function ok(value: number, algo = 'test@v1'): SignalResult {
  return { value, evidence: [], computedAt: Date.now(), algorithmVersion: algo };
}

function baseInput(participating: string[] = ['moduleA']): SignalInput {
  return {
    sessionId: 's1',
    suiteId: 'full_stack',
    submissions: {},
    examData: {},
    participatingModules: participating as unknown as SignalInput['participatingModules'],
  };
}

beforeEach(() => {
  traceMock.mockClear();
});

describe('SignalRegistryImpl.register', () => {
  it('stores a SignalDefinition and surfaces it in count/list', () => {
    const reg = new SignalRegistryImpl();
    const def: SignalDefinition = {
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(42),
    };
    reg.register(def);
    expect(reg.getSignalCount()).toBe(1);
    expect(reg.listSignals()).toEqual([def]);
  });

  it('rejects duplicate signal ids', () => {
    const reg = new SignalRegistryImpl();
    const def: SignalDefinition = {
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(42),
    };
    reg.register(def);
    expect(() => reg.register(def)).toThrow(/duplicate/);
  });

  it('groups signals by dimension via getDimensionSignals', () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(1),
    });
    reg.register({
      id: 'sB',
      dimension: V5Dimension.CODE_QUALITY,
      moduleSource: 'MB',
      isLLMWhitelist: false,
      compute: async () => ok(2),
    });
    expect(reg.getDimensionSignals(V5Dimension.TECHNICAL_JUDGMENT)).toHaveLength(1);
    expect(reg.getDimensionSignals(V5Dimension.CODE_QUALITY)).toHaveLength(1);
  });
});

describe('SignalRegistryImpl.computeAll — pure-rule signals', () => {
  it('invokes compute for participating signals and returns the SignalResult', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(75),
    });
    const results = await reg.computeAll(baseInput(['moduleA']));
    expect(results.sA.value).toBe(75);
    expect(results.sA.algorithmVersion).toBe('test@v1');
  });

  it('marks non-participating signals as skipped (value=null, version=skipped)', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(75),
    });
    const results = await reg.computeAll(baseInput(['mb'])); // moduleA not participating
    expect(results.sA.value).toBeNull();
    expect(results.sA.algorithmVersion).toBe('registry@skipped');
  });

  it('catches exceptions and uses fallback when provided', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => {
        throw new Error('boom');
      },
      fallback: () => ok(33, 'fallback@v1'),
    });
    const results = await reg.computeAll(baseInput(['moduleA']));
    expect(results.sA.value).toBe(33);
    expect(results.sA.algorithmVersion).toBe('fallback@v1');
  });

  it('returns failure result when compute throws and no fallback exists', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => {
        throw new Error('boom');
      },
    });
    const results = await reg.computeAll(baseInput(['moduleA']));
    expect(results.sA.value).toBeNull();
    expect(results.sA.algorithmVersion).toBe('registry@failure');
  });
});

describe('SignalRegistryImpl.computeAll — excludeIds option (Task A1)', () => {
  function seed(reg: SignalRegistryImpl): void {
    reg.register({
      id: 'sA',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(10, 'sA@v1'),
    });
    reg.register({
      id: 'sB',
      dimension: V5Dimension.CODE_QUALITY,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(20, 'sB@v1'),
    });
    reg.register({
      id: 'sC',
      dimension: V5Dimension.METACOGNITION,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(30, 'sC@v1'),
    });
  }

  it('runs every registered signal when options is undefined (parity with single-arg)', async () => {
    const reg = new SignalRegistryImpl();
    seed(reg);
    const results = await reg.computeAll(baseInput(['moduleA']));
    expect(Object.keys(results).sort()).toEqual(['sA', 'sB', 'sC']);
    expect(results.sA.value).toBe(10);
    expect(results.sB.value).toBe(20);
    expect(results.sC.value).toBe(30);
  });

  it('skips ids listed in excludeIds (no compute, no key in results)', async () => {
    const reg = new SignalRegistryImpl();
    seed(reg);
    const results = await reg.computeAll(baseInput(['moduleA']), { excludeIds: ['sB'] });
    expect(results.sB).toBeUndefined();
    expect(Object.keys(results).sort()).toEqual(['sA', 'sC']);
    expect(results.sA.value).toBe(10);
    expect(results.sC.value).toBe(30);
  });

  it('silently ignores unknown ids in excludeIds (aligned with participatingModules skip)', async () => {
    const reg = new SignalRegistryImpl();
    seed(reg);
    const results = await reg.computeAll(baseInput(['moduleA']), {
      excludeIds: ['never-registered', 'also-unknown'],
    });
    expect(Object.keys(results).sort()).toEqual(['sA', 'sB', 'sC']);
    // No throw; every registered signal still ran.
    expect(results.sA.value).toBe(10);
  });
});

describe('SignalRegistryImpl.computeAll — LLM whitelist timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('falls back to nested fallback() when LLM compute exceeds 30s', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: () =>
        new Promise<SignalResult>((resolve) => {
          setTimeout(() => resolve(ok(88)), 60_000);
        }),
      fallback: () => ok(55, 'fallback@llm-v1'),
    });

    const promise = reg.computeAll(baseInput(['moduleD']));
    await vi.advanceTimersByTimeAsync(31_000);
    const results = await promise;
    expect(results.sLlm.value).toBe(55);
    expect(results.sLlm.algorithmVersion).toBe('fallback@llm-v1');
  });

  it('returns registry@timeout result when LLM compute exceeds 30s and no fallback', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: () =>
        new Promise<SignalResult>((resolve) => {
          setTimeout(() => resolve(ok(88)), 60_000);
        }),
    });

    const promise = reg.computeAll(baseInput(['moduleD']));
    await vi.advanceTimersByTimeAsync(31_000);
    const results = await promise;
    expect(results.sLlm.value).toBeNull();
    expect(results.sLlm.algorithmVersion).toBe('registry@timeout');
  });

  it('returns LLM result when it resolves before the 30s deadline', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: () =>
        new Promise<SignalResult>((resolve) => {
          setTimeout(() => resolve(ok(88)), 5_000);
        }),
      fallback: () => ok(10),
    });

    const promise = reg.computeAll(baseInput(['moduleD']));
    await vi.advanceTimersByTimeAsync(6_000);
    const results = await promise;
    expect(results.sLlm.value).toBe(88);
  });
});

describe('SignalRegistryImpl.computeAll — LLM whitelist retry (error-only)', () => {
  it('retries once on error and returns the second-attempt success', async () => {
    let calls = 0;
    const reg = new SignalRegistryImpl({ sleep: async () => {} });
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return ok(77, 'llm@v1');
      },
    });
    const results = await reg.computeAll(baseInput(['moduleD']));
    expect(calls).toBe(2);
    expect(results.sLlm.value).toBe(77);
    expect(results.sLlm.algorithmVersion).toBe('llm@v1');
  });

  it('retries once on error and falls back when the retry also throws', async () => {
    let calls = 0;
    const reg = new SignalRegistryImpl({ sleep: async () => {} });
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => {
        calls += 1;
        throw new Error('persistent');
      },
      fallback: () => ok(12, 'fallback@v1'),
    });
    const results = await reg.computeAll(baseInput(['moduleD']));
    expect(calls).toBe(2);
    expect(results.sLlm.value).toBe(12);
    expect(results.sLlm.algorithmVersion).toBe('fallback@v1');
  });

  it('exhausted retries with no fallback return registry@failure', async () => {
    let calls = 0;
    const reg = new SignalRegistryImpl({ sleep: async () => {} });
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => {
        calls += 1;
        throw new Error('boom');
      },
    });
    const results = await reg.computeAll(baseInput(['moduleD']));
    expect(calls).toBe(2);
    expect(results.sLlm.value).toBeNull();
    expect(results.sLlm.algorithmVersion).toBe('registry@failure');
  });

  it('waits LLM_RETRY_DELAY_MS between error attempts (sleep is invoked)', async () => {
    const sleep = vi.fn(async () => {});
    let calls = 0;
    const reg = new SignalRegistryImpl({ sleep });
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return ok(1);
      },
    });
    await reg.computeAll(baseInput(['moduleD']));
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(500);
  });
});

describe('SignalRegistryImpl — Langfuse tracing', () => {
  it('emits one trace on LLM success with outcome=success and retries=0', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => ok(77, 'llm@v1'),
    });
    await reg.computeAll(baseInput(['moduleD']));
    expect(traceMock).toHaveBeenCalledTimes(1);
    const arg = traceMock.mock.calls[0][0];
    expect(arg.name).toBe('signal.sLlm');
    expect(arg.output.outcome).toBe('success');
    expect(arg.output.retries).toBe(0);
    expect(arg.output.algorithmVersion).toBe('llm@v1');
  });

  it('emits two traces on retry-then-success with retries 0 then 1', async () => {
    let calls = 0;
    const reg = new SignalRegistryImpl({ sleep: async () => {} });
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return ok(77);
      },
    });
    await reg.computeAll(baseInput(['moduleD']));
    expect(traceMock).toHaveBeenCalledTimes(2);
    expect(traceMock.mock.calls[0][0].output.outcome).toBe('error');
    expect(traceMock.mock.calls[0][0].output.retries).toBe(0);
    expect(traceMock.mock.calls[1][0].output.outcome).toBe('success');
    expect(traceMock.mock.calls[1][0].output.retries).toBe(1);
  });

  it('does NOT call trace for pure-rule signals', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sPure',
      dimension: V5Dimension.TECHNICAL_JUDGMENT,
      moduleSource: 'MA',
      isLLMWhitelist: false,
      compute: async () => ok(5),
    });
    await reg.computeAll(baseInput(['moduleA']));
    expect(traceMock).not.toHaveBeenCalled();
  });

  it('propagates sessionId and moduleSource into the trace payload', async () => {
    const reg = new SignalRegistryImpl();
    reg.register({
      id: 'sLlm',
      dimension: V5Dimension.AI_ENGINEERING,
      moduleSource: 'MD',
      isLLMWhitelist: true,
      compute: async () => ok(9),
    });
    const input = baseInput(['moduleD']);
    input.sessionId = 'sess-xyz';
    await reg.computeAll(input);
    const arg = traceMock.mock.calls[0][0];
    expect(arg.sessionId).toBe('sess-xyz');
    expect(arg.input.moduleSource).toBe('MD');
    expect(arg.input.signalId).toBe('sLlm');
  });
});

describe('registerAllSignals scaffold', () => {
  it('exposes EXPECTED_SIGNAL_COUNT = 47 (Round 3 Part 2)', () => {
    expect(EXPECTED_SIGNAL_COUNT).toBe(47);
  });

  it('is callable without throwing on a fresh registry (Task 13e closes at 47)', () => {
    const reg = new SignalRegistryImpl();
    expect(() => registerAllSignals(reg)).not.toThrow();
    // Task 11 Step 4G registered sBeliefUpdateMagnitude (1/47); Task 13a added
    // 5 P0 signals (6/47); Task 13b added 10 MA signals (16/47); Task 13c added
    // 23 MB signals (39/47); Task 13d added 4 MD + 1 SE signals (44/47); Task
    // 13e adds the remaining 3 MC signals, matching EXPECTED_SIGNAL_COUNT.
    expect(reg.getSignalCount()).toBe(47);
  });

  it('registers sBeliefUpdateMagnitude on the metacognition dimension (Task 11)', () => {
    const reg = new SignalRegistryImpl();
    registerAllSignals(reg);
    const metaSignals = reg.getDimensionSignals(V5Dimension.METACOGNITION);
    expect(metaSignals.map((s) => s.id)).toContain('sBeliefUpdateMagnitude');
  });
});
