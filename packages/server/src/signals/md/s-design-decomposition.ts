/**
 * sDesignDecomposition — Task 13d (MD LLM whitelist).
 *
 * LLM-graded quality of the candidate's MD sub-module decomposition:
 * cohesion, coupling, responsibility clarity, interface completeness.
 * Dimension: SYSTEM_DESIGN. Prompt key: md.llm_whitelist.decomposition.
 *
 * Pure-rule fallback (backend-agent-tasks.md L1440-1456):
 *   moduleCount         = subModules.length
 *   countScore          = min(1.0, moduleCount / 5)
 *   interfaceScore      = has_interfaces / moduleCount
 *   responsibilityScore = has_substantive_responsibility / moduleCount
 *   fallback = count × 0.3 + interface × 0.3 + responsibility × 0.4
 *
 * A "substantive responsibility" has length ≥ 20 chars (CJK-friendly);
 * "has_interfaces" means `interfaces?.length > 0`.
 *
 * LLM / fallback null when `submissions.moduleD` is missing OR has zero
 * subModules.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { gradeWithLLM } from './llm-helper.js';
import { clamp01, finalize, nullResult, truncate } from './types.js';

const LLM_VERSION = 'sDesignDecomposition@v1_llm';
const FALLBACK_VERSION = 'sDesignDecomposition@v1_fallback';
const PROMPT_KEY = 'md.llm_whitelist.decomposition';
const SIGNAL_ID = 'sDesignDecomposition';
const RESPONSIBILITY_MIN_CHARS = 20;
const MODULE_COUNT_TARGET = 5;
const COUNT_WEIGHT = 0.3;
const INTERFACE_WEIGHT = 0.3;
const RESPONSIBILITY_WEIGHT = 0.4;

function formatSubModules(md: { subModules: Array<{ name: string; responsibility: string; interfaces?: string[] }> }): string {
  return md.subModules
    .map((m, i) => {
      const ifs = m.interfaces?.length ? `\n   interfaces: ${m.interfaces.join(', ')}` : '';
      return `${i + 1}. ${m.name}: ${m.responsibility}${ifs}`;
    })
    .join('\n');
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const md = input.submissions.moduleD;
  if (!md || md.subModules.length === 0) return nullResult(LLM_VERSION);

  const excerpt = truncate(formatSubModules(md));

  return gradeWithLLM({
    signalId: SIGNAL_ID,
    promptKey: PROMPT_KEY,
    input,
    variables: {
      subModules: excerpt,
      interfaceDefinitions: md.interfaceDefinitions.join('\n'),
      dataFlowDescription: md.dataFlowDescription,
    },
    llmAlgorithmVersion: LLM_VERSION,
    evidenceSource: 'submissions.moduleD.subModules',
    evidenceExcerpt: excerpt,
  });
}

function fallback(input: SignalInput): SignalResult {
  const md = input.submissions.moduleD;
  if (!md || md.subModules.length === 0) return nullResult(FALLBACK_VERSION);

  const moduleCount = md.subModules.length;
  const hasInterfaces = md.subModules.filter((m) => (m.interfaces?.length ?? 0) > 0).length;
  const hasResponsibility = md.subModules.filter(
    (m) => m.responsibility.length >= RESPONSIBILITY_MIN_CHARS,
  ).length;

  const countScore = clamp01(moduleCount / MODULE_COUNT_TARGET);
  const interfaceScore = hasInterfaces / moduleCount;
  const responsibilityScore = hasResponsibility / moduleCount;

  const value =
    countScore * COUNT_WEIGHT +
    interfaceScore * INTERFACE_WEIGHT +
    responsibilityScore * RESPONSIBILITY_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'submissions.moduleD.subModules',
      excerpt: truncate(formatSubModules(md)),
      contribution: countScore * COUNT_WEIGHT,
      triggeredRule: `module_count:${moduleCount}/${MODULE_COUNT_TARGET}`,
    },
    {
      source: 'submissions.moduleD.subModules[].interfaces',
      excerpt: `has_interfaces=${hasInterfaces}/${moduleCount}`,
      contribution: interfaceScore * INTERFACE_WEIGHT,
      triggeredRule: `interface_ratio:${interfaceScore.toFixed(2)}`,
    },
    {
      source: 'submissions.moduleD.subModules[].responsibility',
      excerpt: `substantive=${hasResponsibility}/${moduleCount} (≥${RESPONSIBILITY_MIN_CHARS} chars)`,
      contribution: responsibilityScore * RESPONSIBILITY_WEIGHT,
      triggeredRule: `responsibility_ratio:${responsibilityScore.toFixed(2)}`,
    },
    {
      source: 'tier',
      excerpt: `count=${countScore.toFixed(2)} ifc=${interfaceScore.toFixed(2)} resp=${responsibilityScore.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(value, evidence, FALLBACK_VERSION);
}

export const sDesignDecomposition: SignalDefinition = {
  id: SIGNAL_ID,
  dimension: V5Dimension.SYSTEM_DESIGN,
  moduleSource: 'MD',
  isLLMWhitelist: true,
  compute,
  fallback,
};

export { LLM_VERSION as DESIGN_DECOMPOSITION_LLM_VERSION };
export { FALLBACK_VERSION as DESIGN_DECOMPOSITION_FALLBACK_VERSION };
