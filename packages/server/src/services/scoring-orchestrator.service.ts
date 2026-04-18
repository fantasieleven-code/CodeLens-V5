/**
 * ScoringOrchestrator — Task 17 (V5.0 release gate).
 *
 * Wires the 5 pure primitives from `scoring.service.ts` into a single
 * end-to-end call:
 *   signals → dimensions → composite → GradeDecision → capabilityProfiles
 *
 * Gap #1 (Task 17): `scoreSession()` was referenced across Task 4 / 15
 * but never landed — scoring.service only exposed the primitives. This
 * file is the closing piece.
 *
 * Gap #3 (Task 17): input is a flat `ScoreSessionInput` bundle
 * (session-agnostic). A production wrapper (future Task 15 — Admin API)
 * hydrates the bundle from `SessionService` + `ExamDataService` and
 * delegates here, keeping the orchestrator DB-free and the Golden Path
 * fixture-driven.
 *
 * Gap #5 (Task 17): `computeCursorBehaviorLabel` is V5.1 backlog; the
 * orchestrator always returns `cursorBehaviorLabel: undefined` for now.
 */

import type {
  ScoreSessionInput,
  SignalInput,
  SignalRegistry,
  V5ScoringResult,
} from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { registerAllSignals } from '../signals/index.js';
import { SignalRegistryImpl } from './signal-registry.service.js';
import {
  computeAllProfiles,
  computeComposite,
  computeDimensions,
  gradeCandidate,
  participatingDimensionsOf,
} from './scoring.service.js';

/**
 * Singleton registry populated on first `scoreSession` call. Tests can
 * pass a pre-populated `registry` to bypass this lazy init.
 */
let defaultRegistry: SignalRegistry | null = null;

function getDefaultRegistry(): SignalRegistry {
  if (!defaultRegistry) {
    const registry = new SignalRegistryImpl();
    registerAllSignals(registry);
    defaultRegistry = registry;
  }
  return defaultRegistry;
}

/** Test hook — lets a suite reset the cached registry between runs. */
export function __resetDefaultRegistryForTests(): void {
  defaultRegistry = null;
}

export interface ScoreSessionOptions {
  /** Inject a pre-built registry. Falls back to the lazy singleton. */
  registry?: SignalRegistry;
}

/**
 * End-to-end scoring pipeline.
 *
 * Scale contract: signals produce 0-1 values; `computeDimensions`
 * multiplies by 100 at aggregation so dimensions / composite / grade
 * thresholds / capability profile all share 0-100.
 */
export async function scoreSession(
  input: ScoreSessionInput,
  options: ScoreSessionOptions = {},
): Promise<V5ScoringResult> {
  const registry = options.registry ?? getDefaultRegistry();
  const suite = SUITES[input.suiteId];

  const signalInput: SignalInput = {
    sessionId: input.sessionId,
    suiteId: input.suiteId,
    submissions: input.submissions,
    examData: input.examData,
    participatingModules: input.participatingModules,
    behaviorData: input.behaviorData,
  };

  const signals = await registry.computeAll(signalInput);
  const signalDefs = registry.listSignals();
  const dimensions = computeDimensions(signals, signalDefs, suite);
  const composite = computeComposite(dimensions, suite);
  const gradeDecision = gradeCandidate(composite, dimensions, suite);
  const capabilityProfiles = computeAllProfiles(dimensions, participatingDimensionsOf(suite));

  return {
    grade: gradeDecision.grade,
    composite: gradeDecision.composite,
    dimensions: gradeDecision.dimensions,
    confidence: gradeDecision.confidence,
    boundaryAnalysis: gradeDecision.boundaryAnalysis,
    reasoning: gradeDecision.reasoning,
    ...(gradeDecision.dangerFlag ? { dangerFlag: gradeDecision.dangerFlag } : {}),
    signals,
    capabilityProfiles,
    // cursorBehaviorLabel: V5.1 backlog — algorithm per
    // docs/v5-planning/v5-design-clarifications.md L640-700.
    cursorBehaviorLabel: undefined,
  };
}
