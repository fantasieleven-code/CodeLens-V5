/**
 * sPrecisionFix — Task 13c (MB Stage 2 execution).
 *
 * Measures precision of the candidate's fix: did they edit the lines that
 * needed editing (per scaffold.files[].knownIssueLines) without scattering
 * changes across unrelated files?
 *
 * backend-agent-tasks.md L101: "修改行数 / 需要修改行数（纯规则）" —
 * V5-native 2-factor:
 *
 *   coverage     = hitLines / expectedLines
 *     hitLines  = knownIssueLines where scaffoldLine !== finalLine
 *   fileAccuracy = targetModifiedFiles / modifiedFiles
 *     targetModifiedFiles = modified files that carry knownIssueLines
 *
 *   sPrecisionFix = coverage × 0.7 + fileAccuracy × 0.3
 *
 * Fallback: null when scaffold has no knownIssueLines OR submission has no
 * finalFiles.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { clamp01, finalize, getMbExamData, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sPrecisionFix@v1';
const COVERAGE_WEIGHT = 0.7;
const FILE_ACCURACY_WEIGHT = 0.3;

async function compute(input: SignalInput): Promise<SignalResult> {
  const exam = getMbExamData(input.examData);
  const mb = input.submissions.mb;
  if (!exam || !mb) return nullResult(ALGORITHM_VERSION);

  const scaffoldFiles = exam.scaffold?.files ?? [];
  if (scaffoldFiles.length === 0) return nullResult(ALGORITHM_VERSION);

  const filesWithIssues = scaffoldFiles.filter(
    (f) => f.knownIssueLines && f.knownIssueLines.length > 0,
  );
  if (filesWithIssues.length === 0) return nullResult(ALGORITHM_VERSION);

  const finalFiles = mb.finalFiles ?? [];
  if (finalFiles.length === 0) return nullResult(ALGORITHM_VERSION);

  const finalByPath = new Map(finalFiles.map((f) => [f.path, f.content]));

  let expectedLines = 0;
  let hitLines = 0;
  const hitFiles: string[] = [];

  for (const scaffoldFile of filesWithIssues) {
    const finalContent = finalByPath.get(scaffoldFile.path);
    const issueLines = scaffoldFile.knownIssueLines ?? [];
    expectedLines += issueLines.length;
    if (finalContent === undefined) continue;

    const scaffoldLines = scaffoldFile.content.split('\n');
    const finalLinesArr = finalContent.split('\n');
    let fileHits = 0;

    for (const ln of issueLines) {
      const s = scaffoldLines[ln - 1] ?? '';
      const f = finalLinesArr[ln - 1] ?? '';
      if (s !== f) {
        hitLines += 1;
        fileHits += 1;
      }
    }
    if (fileHits > 0) hitFiles.push(scaffoldFile.path);
  }

  if (expectedLines === 0) return nullResult(ALGORITHM_VERSION);

  const modifiedPaths: string[] = [];
  for (const scaffoldFile of scaffoldFiles) {
    const finalContent = finalByPath.get(scaffoldFile.path);
    if (finalContent !== undefined && finalContent !== scaffoldFile.content) {
      modifiedPaths.push(scaffoldFile.path);
    }
  }

  const targetPaths = new Set(filesWithIssues.map((f) => f.path));
  const targetModifiedCount = modifiedPaths.filter((p) => targetPaths.has(p)).length;

  const coverage = clamp01(hitLines / expectedLines);
  const fileAccuracy =
    modifiedPaths.length === 0 ? 0 : clamp01(targetModifiedCount / modifiedPaths.length);

  const value = coverage * COVERAGE_WEIGHT + fileAccuracy * FILE_ACCURACY_WEIGHT;

  const evidence: SignalEvidence[] = [
    {
      source: 'examData.MB.scaffold.files[].knownIssueLines',
      excerpt: `expected_lines=${expectedLines} hit_lines=${hitLines} hit_files=[${hitFiles.slice(0, 3).join(',')}]`,
      contribution: coverage * COVERAGE_WEIGHT,
      triggeredRule: `coverage:${hitLines}/${expectedLines}`,
    },
    {
      source: 'submissions.mb.finalFiles',
      excerpt: `modified_files=${modifiedPaths.length} target_modified=${targetModifiedCount}`,
      contribution: fileAccuracy * FILE_ACCURACY_WEIGHT,
      triggeredRule: `file_accuracy:${targetModifiedCount}/${modifiedPaths.length}`,
    },
    {
      source: 'tier',
      excerpt: `cov=${coverage.toFixed(2)} acc=${fileAccuracy.toFixed(2)} → ${value.toFixed(3)}`,
      contribution: 0,
      triggeredRule: 'weighted_composite',
    },
  ];

  return finalize(clamp01(value), evidence, ALGORITHM_VERSION);
}

export const sPrecisionFix: SignalDefinition = {
  id: 'sPrecisionFix',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as PRECISION_FIX_VERSION };
