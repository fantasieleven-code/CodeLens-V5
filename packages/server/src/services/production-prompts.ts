import type { V5PromptKey } from './prompt-keys.js';

export const LIVE_PRODUCTION_PROMPT_VERSION = 2;

export interface ProductionPromptDefinition {
  key: V5PromptKey;
  content: string;
  metadata: {
    placeholder: false;
    seededBy: 'v5.1-live-prompts';
    runtimeSurface: 'mb-chat' | 'mc-probe' | 'md-llm-whitelist';
  };
}

const mdJsonContract =
  'Return ONLY JSON with shape {"score": <number 0-1>, "notes": "<=2 concise sentences>"}. No markdown fences, no prose outside JSON.';

export const LIVE_PRODUCTION_PROMPTS: readonly ProductionPromptDefinition[] = [
  {
    key: 'mb.chat_generate',
    content: [
      'You are CodeLens Module B coding assistant for a senior engineering evaluation.',
      'Return practical implementation help grounded only in the provided files context and user request.',
      'When code changes are requested, prefer a concise unified diff or clearly delimited replacement block.',
      'Call out assumptions, edge cases, and test commands when relevant.',
      'Do not invent files, APIs, or prior context that is not present in the prompt.',
    ].join('\n'),
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mb-chat',
    },
  },
  {
    key: 'mc.probe_engine.baseline',
    content:
      'Baseline probe: ask the candidate to explain the reasoning behind one important prior decision in concrete terms. Favor short, open questions that require evidence from their own work.',
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mc-probe',
    },
  },
  {
    key: 'mc.probe_engine.contradiction',
    content:
      'Contradiction probe: focus on the mismatch between strong and weak signals. Ask the candidate to reconcile the inconsistency with a specific example, not a generic self-assessment.',
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mc-probe',
    },
  },
  {
    key: 'mc.probe_engine.weakness',
    content:
      'Weakness probe: target the lowest reliable dimension. Ask one scenario question that exposes whether the weakness is a true skill gap or a shallow written answer.',
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mc-probe',
    },
  },
  {
    key: 'mc.probe_engine.escalation',
    content:
      'Escalation probe: when the candidate is near an upper grade boundary, ask a harder follow-up in their weakest relevant dimension. The question should reveal depth, tradeoffs, and failure-mode awareness.',
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mc-probe',
    },
  },
  {
    key: 'mc.probe_engine.transfer',
    content:
      'Transfer probe: ask the candidate to apply one demonstrated skill to a nearby but different engineering context. Look for abstraction, constraints, and adaptation rather than memorized wording.',
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'mc-probe',
    },
  },
  {
    key: 'md.llm_whitelist.decomposition',
    content: [
      mdJsonContract,
      'Grade the module decomposition for cohesion, coupling, responsibility clarity, interface completeness, and whether the data flow can be implemented by a senior engineer.',
      'Use the candidate sub-modules, interfaces, and data flow below.',
      'Candidate sub-modules:',
      '{{subModules}}',
      'Candidate interface definitions:',
      '{{interfaceDefinitions}}',
      'Candidate data flow:',
      '{{dataFlowDescription}}',
    ].join('\n\n'),
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'md-llm-whitelist',
    },
  },
  {
    key: 'md.llm_whitelist.tradeoff',
    content: [
      mdJsonContract,
      'Grade the tradeoff narrative for explicit alternatives, named constraints, failure modes, and a defensible recommendation.',
      'Do not reward volume alone; reward concrete comparison and consequence awareness.',
      'Candidate tradeoff narrative:',
      '{{tradeoffText}}',
      'Candidate sub-modules:',
      '{{subModules}}',
      'Selected constraints:',
      '{{constraintsSelected}}',
    ].join('\n\n'),
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'md-llm-whitelist',
    },
  },
  {
    key: 'md.llm_whitelist.ai_orch',
    content: [
      mdJsonContract,
      'Grade the AI orchestration prompts for clear goals, constraints, inputs, outputs, decomposition across agents, and failure handling.',
      'Reward prompts that would let another coding agent produce safer, testable work.',
      'Candidate AI orchestration prompts:',
      '{{aiOrchestrationPrompts}}',
      'Candidate sub-modules:',
      '{{subModules}}',
    ].join('\n\n'),
    metadata: {
      placeholder: false,
      seededBy: 'v5.1-live-prompts',
      runtimeSurface: 'md-llm-whitelist',
    },
  },
];

export const LIVE_PRODUCTION_PROMPT_KEYS = LIVE_PRODUCTION_PROMPTS.map((p) => p.key);
