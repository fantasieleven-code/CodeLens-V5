/**
 * ScoringOrchestrator — Task 17 (V5.0 release gate) + Task A1 two-pass.
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
 *
 * Task A1 two-pass (Commit 2 seam · Commit 3 sCalibration consumer):
 *   Meta-signals need the 47-signal pass-1 composite as compute input.
 *   scoreSession runs pass-1 = registry.computeAll(input, {
 *     excludeIds: META_SIGNAL_IDS }), derives partialComposite from the
 *   pass-1 dimensions, then runs pass-2 = computeMetaSignals(registry,
 *   input, partialComposite). Results merge before the final dimension +
 *   composite + grade computation. At Commit 2 HEAD sCalibration is not
 *   yet registered, so pass-1 excludeIds silently skips (unknown id) and
 *   computeMetaSignals returns {} — behavior identical to single-pass.
 *   Commit 3 atomically registers sCalibration + activates the path.
 */

import type {
  ScoreSessionInput,
  SignalInput,
  SignalRegistry,
  SignalResults,
  V5ScoringResult,
} from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { logger } from '../lib/logger.js';
import { registerAllSignals } from '../signals/index.js';
import { SignalRegistryImpl } from './signal-registry.service.js';
import {
  computeAllProfiles,
  computeComposite,
  computeDimensions,
  gradeCandidate,
  participatingDimensionsOf,
} from './scoring.service.js';

export const SCORING_RESULT_ALGORITHM_VERSION = 'scoreSession@v1';

/**
 * Meta-signals — V5.0 A1 guardrail constant (Gemini-ratified naming).
 *
 * Meta-signals compute their value from the pass-1 composite of the
 * ordinary signals, not from raw submissions. This requires a two-pass
 * orchestrator (pass-1 ordinary → partialComposite → pass-2 meta).
 *
 * Hard cap: ≤ 3 meta-signals through V5.x to keep the two-pass cost
 * linear and the seam surface minimal. Predicted consumers:
 *   - V5.0 `sCalibration` — gap between selfConfidence and measured
 *     composite (registered in Commit 3 of Task A1).
 *   - V5.1 A7 candidate (TBD).
 *   - V5.1 A8 cross-pattern — `direction` evidence consumer.
 *
 * Adding a 4th meta-signal requires plan-side re-ratify; the constant is
 * typed `as const` so type narrowing holds at orchestrator call sites.
 * 4 explicit markers for this seam:
 *   (1) `META_SIGNAL_IDS` (this constant)
 *   (2) `computeMetaSignals` (seam function below)
 *   (3) Registry `ComputeAllOptions.excludeIds` (Commit 1)
 *   (4) `SignalDefinition.compute(input, partialComposite?)` (Commit 1)
 */
export const META_SIGNAL_IDS = ['sCalibration'] as const;
export type MetaSignalId = (typeof META_SIGNAL_IDS)[number];

/**
 * computeMetaSignals — pass-2 of the two-pass orchestrator.
 *
 * Iterates `META_SIGNAL_IDS`, looks each up in the registry, and calls
 * its `compute(input, partialComposite)`. Unregistered meta-signal ids
 * are silently skipped — allowing `META_SIGNAL_IDS` to list a name
 * before the implementation lands (Commit 2 ships the seam; Commit 3
 * registers `sCalibration`).
 *
 * Errors from an individual meta-signal compute fall through to the
 * signal's own `fallback` if present, else to a null SignalResult with
 * `algorithmVersion = 'registry@meta-failure'`. This mirrors the
 * single-pass pure-rule fallback behavior in signal-registry.service.ts.
 */
export async function computeMetaSignals(
  registry: SignalRegistry,
  input: SignalInput,
  partialComposite: number,
): Promise<SignalResults> {
  const results: SignalResults = {};
  const defs = registry.listSignals();
  for (const id of META_SIGNAL_IDS) {
    const def = defs.find((s) => s.id === id);
    if (!def) continue;
    try {
      results[id] = await def.compute(input, partialComposite);
    } catch (err) {
      logger.warn('meta-signal compute failed', {
        signalId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (def.fallback) {
        try {
          results[id] = def.fallback(input);
          continue;
        } catch (fallbackErr) {
          logger.warn('meta-signal fallback failed', {
            signalId: id,
            error:
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      }
      results[id] = {
        value: null,
        evidence: [],
        computedAt: Date.now(),
        algorithmVersion: 'registry@meta-failure',
      };
    }
  }
  return results;
}

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

  // Pass 1 — compute the 47 ordinary signals, excluding meta-signals.
  const pass1Signals = await registry.computeAll(signalInput, {
    excludeIds: META_SIGNAL_IDS,
  });
  const signalDefs = registry.listSignals();
  const pass1Dimensions = computeDimensions(pass1Signals, signalDefs, suite);
  const partialComposite = computeComposite(pass1Dimensions, suite);

  // Pass 2 — compute meta-signals with the pass-1 composite as input.
  const metaSignals = await computeMetaSignals(registry, signalInput, partialComposite);

  // Merge and recompute the final dimensions/composite from the full set.
  const signals: SignalResults = { ...pass1Signals, ...metaSignals };
  const dimensions = computeDimensions(signals, signalDefs, suite);
  const composite = computeComposite(dimensions, suite);
  const gradeDecision = gradeCandidate(composite, dimensions, suite);
  const capabilityProfiles = computeAllProfiles(dimensions, participatingDimensionsOf(suite));

  return {
    computedAt: Date.now(),
    algorithmVersion: SCORING_RESULT_ALGORITHM_VERSION,
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
