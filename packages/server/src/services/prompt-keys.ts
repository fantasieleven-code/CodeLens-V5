/**
 * V5 Prompt Key taxonomy.
 *
 * 17 keys total:
 *   - 9 generator.step0..step8 (exam-generator, Task 10)
 *   - 5 mc.probe_engine.* (MC probe engine, Task 11)
 *   - 3 md.llm_whitelist.* (MD LLM-graded signals, Task 14)
 *
 * Authoritative source: docs/v5-planning/backend-agent-tasks.md §Task 7 L894-L910.
 */

export const V5_PROMPT_KEYS = [
  'generator.step0_scenario',
  'generator.step1_p0',
  'generator.step2_schemes',
  'generator.step3_defects',
  'generator.step4_mb_scaffold',
  'generator.step5_failure',
  'generator.step6_mb_violations',
  'generator.step7_md_design',
  'generator.step8_quality_check',
  'mc.probe_engine.baseline',
  'mc.probe_engine.contradiction',
  'mc.probe_engine.weakness',
  'mc.probe_engine.escalation',
  'mc.probe_engine.transfer',
  'md.llm_whitelist.decomposition',
  'md.llm_whitelist.tradeoff',
  'md.llm_whitelist.ai_orch',
] as const;

export type V5PromptKey = typeof V5_PROMPT_KEYS[number];

export function isV5PromptKey(value: string): value is V5PromptKey {
  return (V5_PROMPT_KEYS as readonly string[]).includes(value);
}
