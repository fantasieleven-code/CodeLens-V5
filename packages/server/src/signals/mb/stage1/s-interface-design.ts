/**
 * sInterfaceDesign — Task 13c (MB Stage 1 planning).
 *
 * Measures whether the candidate's Stage 1 plan names specific interfaces
 * (function / class / method) from the scaffold. A plan that says "update
 * inventory logic" scores lower than one that says "change
 * `InventoryRepository.decrement` to use a Lua script."
 *
 * backend-agent-tasks.md L95: "scaffold 函数名/类名引用命中数（纯规则）"
 * without weights — V5-native:
 *
 *   extract identifiers from planning.decomposition + planning.dependencies:
 *     - TypeScript-ish tokens: Class names (Pascal), method / function
 *       names (camelCase with parens or `.` prefix).
 *   cross-check against identifiers mined from scaffold.files[].content.
 *
 *   sInterfaceDesign = min(1, hits / max(3, total_candidates / 3))
 *
 * Fallback: null when planning missing OR exam has no scaffold.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMbExamData, nullResult, truncate } from '../types.js';

const ALGORITHM_VERSION = 'sInterfaceDesign@v1';

const IDENTIFIER_PATTERN = /\b([A-Z][a-zA-Z0-9]{2,}|[a-z][a-zA-Z0-9]{2,}(?=\())/g;
const IGNORE_TOKENS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'const',
  'let',
  'var',
  'function',
  'class',
  'return',
  'if',
  'else',
  'for',
  'while',
  'import',
  'export',
  'async',
  'await',
  'this',
  'new',
  'throw',
]);

function extractIdentifiers(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const matches = text.matchAll(IDENTIFIER_PATTERN);
  for (const m of matches) {
    const token = m[1];
    if (!IGNORE_TOKENS.has(token.toLowerCase())) out.add(token);
  }
  return out;
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const planning = input.submissions.mb?.planning;
  if (!planning) return nullResult(ALGORITHM_VERSION);
  const planningText = [planning.decomposition ?? '', planning.dependencies ?? '']
    .filter(Boolean)
    .join('\n');
  if (planningText.trim().length === 0) return nullResult(ALGORITHM_VERSION);

  const exam = getMbExamData(input.examData);
  const scaffoldFiles = exam?.scaffold?.files ?? [];
  if (scaffoldFiles.length === 0) return nullResult(ALGORITHM_VERSION);

  const scaffoldIdentifiers = new Set<string>();
  for (const f of scaffoldFiles) {
    for (const id of extractIdentifiers(f.content)) scaffoldIdentifiers.add(id);
  }
  if (scaffoldIdentifiers.size === 0) return nullResult(ALGORITHM_VERSION);

  const planningIdentifiers = extractIdentifiers(planningText);
  const hits: string[] = [];
  for (const id of planningIdentifiers) if (scaffoldIdentifiers.has(id)) hits.push(id);

  const target = Math.max(3, Math.floor(scaffoldIdentifiers.size / 6));
  const value = clamp01(hits.length / target);

  const evidence: SignalEvidence[] = [
    {
      source: 'examData.MB.scaffold.files[].content',
      excerpt: `scaffold_identifiers=${scaffoldIdentifiers.size}`,
      contribution: 0,
      triggeredRule: `baseline_target:${target}`,
    },
    {
      source: 'submissions.mb.planning',
      excerpt: truncate(`planning_ids=[${Array.from(planningIdentifiers).slice(0, 10).join(',')}]`),
      contribution: 0,
      triggeredRule: `planning_identifier_pool:${planningIdentifiers.size}`,
    },
    {
      source: 'tier',
      excerpt: truncate(`hits=[${hits.slice(0, 8).join(',')}]`),
      contribution: value,
      triggeredRule: `scaffold_refs:${hits.length}/${target}`,
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sInterfaceDesign: SignalDefinition = {
  id: 'sInterfaceDesign',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as INTERFACE_DESIGN_VERSION };
