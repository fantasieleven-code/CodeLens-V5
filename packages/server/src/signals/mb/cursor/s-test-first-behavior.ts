/**
 * sTestFirstBehavior — Task 13c (MB Cursor behavior).
 *
 * Did the candidate open a test file in the first 60 s of the module?
 * Three-band score: 1.0 (within 60 s) / 0.5 (within 5 min) / 0.0 (never).
 *
 * Pseudocode: design-reference-full.md L1686-1719.
 *
 *   startTime = earliest timestamp across editorBehavior events
 *   testOpen  = first fileNavigationHistory event with action='open' and
 *               filePath starts with 'tests/'
 *
 * V5-native: startTime inferred from the earliest editorBehavior event
 * (SignalInput has no explicit session start timestamp); falls back to the
 * first fileNavigationHistory entry when other lists are empty.
 *
 * Fallback: null when fileNavigationHistory empty.
 */
import {
  V5Dimension,
  type SignalDefinition,
  type SignalEvidence,
  type SignalInput,
  type SignalResult,
} from '@codelens-v5/shared';
import { finalize, nullResult } from '../types.js';

const ALGORITHM_VERSION = 'sTestFirstBehavior@v1';
const EARLY_WINDOW_MS = 60_000;
const LATE_WINDOW_MS = 300_000;

function isTestPath(path: string): boolean {
  const p = path.toLowerCase();
  return p.startsWith('tests/') || p.startsWith('test/') || p.includes('/tests/') || p.includes('/test/') || p.includes('.test.') || p.includes('.spec.');
}

function inferStartTime(behavior: {
  aiCompletionEvents?: Array<{ timestamp: number }>;
  chatEvents?: Array<{ timestamp: number }>;
  fileNavigationHistory?: Array<{ timestamp: number }>;
  editSessions?: Array<{ startTime: number }>;
  testRuns?: Array<{ timestamp: number }>;
}): number | null {
  const candidates: number[] = [];
  for (const e of behavior.aiCompletionEvents ?? []) candidates.push(e.timestamp);
  for (const e of behavior.chatEvents ?? []) candidates.push(e.timestamp);
  for (const e of behavior.fileNavigationHistory ?? []) candidates.push(e.timestamp);
  for (const e of behavior.editSessions ?? []) candidates.push(e.startTime);
  for (const e of behavior.testRuns ?? []) candidates.push(e.timestamp);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

async function compute(input: SignalInput): Promise<SignalResult> {
  const behavior = input.submissions.mb?.editorBehavior;
  if (!behavior) return nullResult(ALGORITHM_VERSION);

  const history = behavior.fileNavigationHistory ?? [];
  if (history.length === 0) return nullResult(ALGORITHM_VERSION);

  const startTime = inferStartTime(behavior);
  if (startTime === null) return nullResult(ALGORITHM_VERSION);

  const earlyOpen = history.find(
    (e) => e.action === 'open' && isTestPath(e.filePath) && e.timestamp - startTime < EARLY_WINDOW_MS,
  );
  if (earlyOpen) {
    return finalize(
      1.0,
      [
        {
          source: 'submissions.mb.editorBehavior.fileNavigationHistory',
          excerpt: `first_test_open=${earlyOpen.filePath} Δt=${earlyOpen.timestamp - startTime}ms`,
          contribution: 1.0,
          triggeredRule: `test_opened_within_${EARLY_WINDOW_MS}ms`,
        },
      ],
      ALGORITHM_VERSION,
    );
  }

  const lateOpen = history.find(
    (e) => e.action === 'open' && isTestPath(e.filePath) && e.timestamp - startTime < LATE_WINDOW_MS,
  );
  if (lateOpen) {
    return finalize(
      0.5,
      [
        {
          source: 'submissions.mb.editorBehavior.fileNavigationHistory',
          excerpt: `first_test_open=${lateOpen.filePath} Δt=${lateOpen.timestamp - startTime}ms`,
          contribution: 0.5,
          triggeredRule: `test_opened_within_${LATE_WINDOW_MS}ms`,
        },
      ],
      ALGORITHM_VERSION,
    );
  }

  return finalize(
    0,
    [
      {
        source: 'submissions.mb.editorBehavior.fileNavigationHistory',
        excerpt: `no_test_open_within_${LATE_WINDOW_MS}ms`,
        contribution: 0,
        triggeredRule: 'no_test_first_signal',
      },
    ],
    ALGORITHM_VERSION,
  );
}

export const sTestFirstBehavior: SignalDefinition = {
  id: 'sTestFirstBehavior',
  dimension: V5Dimension.AI_ENGINEERING,
  moduleSource: 'MB',
  isLLMWhitelist: false,
  compute,
};

export { ALGORITHM_VERSION as TEST_FIRST_BEHAVIOR_VERSION };
