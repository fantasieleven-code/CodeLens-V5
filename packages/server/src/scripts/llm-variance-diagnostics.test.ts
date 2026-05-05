import { describe, expect, it } from 'vitest';

import {
  LLMVarianceDiagnosticError,
  classifyLLMVarianceError,
  summarizeLLMSignalSamples,
} from './llm-variance-diagnostics.js';

describe('llm variance diagnostics', () => {
  it('classifies missing or placeholder prompts as prompt drift', () => {
    const err = Object.assign(new Error('Active prompt for key "md.llm_whitelist.tradeoff" is still a seed placeholder'), {
      name: 'PromptPlaceholderError',
    });

    expect(classifyLLMVarianceError(err)).toBe('prompt_drift');
  });

  it('classifies rubric JSON parse failures as parser/schema drift', () => {
    expect(classifyLLMVarianceError(new Error('LLM rubric parse failed for sDesignDecomposition'))).toBe(
      'parser_schema_drift',
    );
  });

  it('classifies provider/runtime failures separately from prompt and parser drift', () => {
    expect(classifyLLMVarianceError(new Error('429 rate limit exceeded'))).toBe('provider_failure');
  });

  it('summarizes live LLM samples inside tolerance', () => {
    const summary = summarizeLLMSignalSamples(
      'sTradeoffArticulation',
      [
        { value: 0.9, algorithmVersion: 'sTradeoffArticulation@v1_llm' },
        { value: 0.87, algorithmVersion: 'sTradeoffArticulation@v1_llm' },
        { value: 0.91, algorithmVersion: 'sTradeoffArticulation@v1_llm' },
      ],
      0.05,
    );

    expect(summary).toMatchObject({
      signalId: 'sTradeoffArticulation',
      values: [0.9, 0.87, 0.91],
    });
    expect(summary.spread).toBeCloseTo(0.04);
  });

  it('diagnoses provider variance when spread breaches tolerance', () => {
    expect.assertions(2);
    try {
      summarizeLLMSignalSamples(
        'sAiOrchestrationQuality',
        [
          { value: 0.65, algorithmVersion: 'sAiOrchestrationQuality@v1_llm' },
          { value: 0.78, algorithmVersion: 'sAiOrchestrationQuality@v1_llm' },
        ],
        0.08,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMVarianceDiagnosticError);
      expect((err as LLMVarianceDiagnosticError).diagnosis).toBe('provider_variance');
    }
  });

  it('diagnoses parser/schema drift for non-numeric samples', () => {
    expect.assertions(2);
    try {
      summarizeLLMSignalSamples(
        'sDesignDecomposition',
        [
          { value: 0.8, algorithmVersion: 'sDesignDecomposition@v1_llm' },
          { value: null, algorithmVersion: 'sDesignDecomposition@v1_llm' },
        ],
        0.08,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMVarianceDiagnosticError);
      expect((err as LLMVarianceDiagnosticError).diagnosis).toBe('parser_schema_drift');
    }
  });

  it('diagnoses live-path drift when samples fall back instead of using LLM versions', () => {
    expect.assertions(2);
    try {
      summarizeLLMSignalSamples(
        'sDesignDecomposition',
        [
          { value: 0.8, algorithmVersion: 'sDesignDecomposition@v1_llm' },
          { value: 0.7, algorithmVersion: 'sDesignDecomposition@v1_fallback' },
        ],
        0.08,
      );
    } catch (err) {
      expect(err).toBeInstanceOf(LLMVarianceDiagnosticError);
      expect((err as LLMVarianceDiagnosticError).diagnosis).toBe('live_path_drift');
    }
  });
});
