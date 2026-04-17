/**
 * sRuleEnforcement — Task 13c (MB Stage 4 audit).
 *
 * Measures the candidate's accuracy identifying rule violations in 3 AI
 * execution samples during Stage 4 audit. Replaces V4's sConvergenceResult
 * (which depended on sandbox).
 *
 * Pseudocode: backend-agent-tasks.md L1409-1435.
 *
 *   For each audit.violations[i]:
 *     example = examData.MB.violationExamples[v.exampleIndex]
 *     if v.markedAsViolation === example.isViolation:
 *       if example.isViolation === true && v.violatedRuleId:
 *         expectedRuleId = matchRuleByExample(example, candidateRules)
 *         if v.violatedRuleId === expectedRuleId → correct += 1
 *       else if example.isViolation === false:
 *         correct += 1
 *
 *   sRuleEnforcement = correctCount / audit.violations.length
 *
 * V5-native matchRuleByExample (no V4 impl available):
 *   - parseRules: split rulesContent into candidate rule entries
 *     (one per line with imperative marker OR explicit numbering).
 *   - match: rule entry whose keyword overlap with example.violationType OR
 *     example.explanation is highest. Keywords drawn from
 *     RULES_CATEGORY_MARKERS (same ones used by sRulesCoverage).
 *
 * Fallback: null when audit missing OR audit.violations empty OR
 * examData.MB.violationExamples missing.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import {
  finalize,
  getMbExamData,
  IMPERATIVE_MARKERS,
  markerHits,
  nullResult,
  RULES_CATEGORY_MARKERS,
} from '../types.js';

const ALGORITHM_VERSION = 'sRuleEnforcement@v1';

interface ParsedRule {
  id: string;
  text: string;
  keywords: string[];
}

function parseRules(rulesContent: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  const lines = rulesContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let idx = 0;
  for (const line of lines) {
    const hasImperative = markerHits(line, IMPERATIVE_MARKERS).length > 0;
    const hasNumber = /^(\d+[.)、]|[-*])\s*/.test(line);
    if (!hasImperative && !hasNumber) continue;
    const text = line.replace(/^(\d+[.)、]|[-*])\s*/, '').trim();
    if (text.length < 4) continue;
    const kws: string[] = [];
    for (const markers of Object.values(RULES_CATEGORY_MARKERS)) {
      for (const m of markers) {
        if (text.toLowerCase().includes(m.toLowerCase()) || text.includes(m)) kws.push(m);
      }
    }
    rules.push({ id: `rule_${idx}`, text, keywords: kws });
    idx += 1;
  }
  return rules;
}

function matchRuleByExample(
  example: { violationType?: string; explanation: string },
  rules: ParsedRule[],
): string | null {
  if (rules.length === 0) return null;
  const exampleText = `${example.violationType ?? ''} ${example.explanation}`.toLowerCase();

  let best: ParsedRule | null = null;
  let bestScore = 0;
  for (const rule of rules) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (exampleText.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return bestScore > 0 ? best!.id : null;
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const mb = input.submissions.mb;
  const audit = mb?.audit;
  if (!audit || audit.violations.length === 0) return nullResult(ALGORITHM_VERSION);

  const exam = getMbExamData(input.examData);
  const examples = exam?.violationExamples ?? [];
  if (examples.length === 0) return nullResult(ALGORITHM_VERSION);

  const rulesContent = mb?.standards?.rulesContent ?? '';
  const parsedRules = rulesContent ? parseRules(rulesContent) : [];

  let correctCount = 0;
  const details: string[] = [];

  for (const v of audit.violations) {
    const example = examples[v.exampleIndex];
    if (!example) continue;

    const markedMatchesTruth = v.markedAsViolation === example.isViolation;
    if (!markedMatchesTruth) {
      details.push(`idx=${v.exampleIndex}:wrong_mark`);
      continue;
    }

    if (example.isViolation === true) {
      if (!v.violatedRuleId) {
        details.push(`idx=${v.exampleIndex}:missing_rule_id`);
        continue;
      }
      const expectedId = matchRuleByExample(example, parsedRules);
      if (expectedId === null) {
        // Candidate's rules don't cover this example — give partial credit for
        // correctly spotting the violation even if their rule list is thin.
        correctCount += 0.5;
        details.push(`idx=${v.exampleIndex}:partial_no_match_rule`);
        continue;
      }
      if (v.violatedRuleId === expectedId) {
        correctCount += 1;
        details.push(`idx=${v.exampleIndex}:full`);
      } else {
        correctCount += 0.5;
        details.push(`idx=${v.exampleIndex}:partial_rule_mismatch`);
      }
    } else {
      correctCount += 1;
      details.push(`idx=${v.exampleIndex}:correct_non_violation`);
    }
  }

  const value = correctCount / audit.violations.length;

  const evidence = [
    {
      source: 'submissions.mb.audit.violations',
      excerpt: `violations=${audit.violations.length} correct=${correctCount.toFixed(1)}`,
      contribution: value,
      triggeredRule: `audit_accuracy:${correctCount.toFixed(1)}/${audit.violations.length}`,
    },
    {
      source: 'submissions.mb.standards.rulesContent',
      excerpt: `parsed_rules=${parsedRules.length}`,
      contribution: 0,
      triggeredRule: 'rule_parse_count',
    },
    {
      source: 'tier',
      excerpt: details.slice(0, 4).join(' | '),
      contribution: 0,
      triggeredRule: 'per_violation_outcome',
    },
  ];

  return finalize(value, evidence, ALGORITHM_VERSION);
}

export const sRuleEnforcement: SignalDefinition = {
  id: 'sRuleEnforcement',
  dimension: V5Dimension.CODE_QUALITY,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as RULE_ENFORCEMENT_VERSION };
