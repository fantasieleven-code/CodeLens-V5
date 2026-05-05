import type { SignalResult } from '@codelens-v5/shared';

export type LLMVarianceDiagnosis =
  | 'prompt_drift'
  | 'provider_failure'
  | 'provider_variance'
  | 'parser_schema_drift'
  | 'live_path_drift';

export interface LLMSignalSample {
  value: SignalResult['value'];
  algorithmVersion?: string;
}

export interface LLMVarianceSummary {
  signalId: string;
  values: number[];
  spread: number;
  algorithmVersions: string[];
}

export class LLMVarianceDiagnosticError extends Error {
  constructor(
    readonly diagnosis: LLMVarianceDiagnosis,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LLMVarianceDiagnosticError';
  }
}

export function classifyLLMVarianceError(err: unknown): LLMVarianceDiagnosis {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);
  const text = `${name} ${message}`;

  if (/Prompt(NotFound|Placeholder)Error|No active prompt|seed placeholder|still a seed placeholder/i.test(text)) {
    return 'prompt_drift';
  }
  if (/parse|schema|json|rubric/i.test(text)) {
    return 'parser_schema_drift';
  }
  return 'provider_failure';
}

export function summarizeLLMSignalSamples(
  signalId: string,
  samples: LLMSignalSample[],
  tolerance: number,
): LLMVarianceSummary {
  const values = samples.map((sample) => sample.value);
  const numeric = values.filter((value): value is number => typeof value === 'number');
  if (numeric.length !== samples.length) {
    throw new LLMVarianceDiagnosticError(
      'parser_schema_drift',
      `${signalId} returned missing/non-numeric values`,
      { signalId, values },
    );
  }

  const algorithmVersions = samples.map((sample) => sample.algorithmVersion ?? '<missing>');
  const nonLiveVersions = algorithmVersions.filter((version) => !version.endsWith('_llm'));
  if (nonLiveVersions.length > 0) {
    throw new LLMVarianceDiagnosticError(
      'live_path_drift',
      `${signalId} did not use the live LLM path`,
      { signalId, algorithmVersions },
    );
  }

  const spread = Math.max(...numeric) - Math.min(...numeric);
  if (spread > tolerance) {
    throw new LLMVarianceDiagnosticError(
      'provider_variance',
      `${signalId} spread ${spread.toFixed(4)} exceeds tolerance ${tolerance.toFixed(4)}`,
      { signalId, values: numeric, spread, tolerance },
    );
  }

  return { signalId, values: numeric, spread, algorithmVersions };
}
