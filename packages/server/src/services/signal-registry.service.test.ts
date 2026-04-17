import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type SignalDefinition,
  type SignalInput,
  type SignalResult,
  V5Dimension,
} from '@codelens-v5/shared';
import { SignalRegistryImpl } from './signal-registry.service.js';

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
