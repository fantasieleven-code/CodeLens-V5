/**
 * V5 Signal registration entry point.
 *
 * Task 8 provides this scaffold; Tasks 11 / 13a / 13b / 13c-e fill in the 47
 * `SignalDefinition` imports and `registry.register(def)` calls. The split
 * keeps the framework independently verifiable before each signal batch
 * lands.
 *
 * Round 3 Part 2 raised the V5.0 signal catalog from 43 → 47
 * (40 pure-rule + 3 MD LLM-whitelist + 4 新增 sAiClaim / sPrinciple /
 * sBelief / sDecisionLatency). `EXPECTED_SIGNAL_COUNT` is the contract
 * Task 13 + Part 7 CI must satisfy once all 47 land:
 *   assert(signalRegistry.getSignalCount() === EXPECTED_SIGNAL_COUNT).
 */

import type { SignalRegistry } from '@codelens-v5/shared';
import { logger } from '../lib/logger.js';
import { sBeliefUpdateMagnitude } from './mc/s-belief-update-magnitude.js';
import { sBaselineReading } from './p0/s-baseline-reading.js';
import { sAiCalibration } from './p0/s-ai-calibration.js';
import { sDecisionStyle } from './p0/s-decision-style.js';
import { sTechProfile } from './p0/s-tech-profile.js';
import { sAiClaimDetection } from './p0/s-ai-claim-detection.js';
import { sSchemeJudgment } from './ma/s-scheme-judgment.js';
import { sReasoningDepth } from './ma/s-reasoning-depth.js';
import { sContextQuality } from './ma/s-context-quality.js';
import { sCriticalThinking } from './ma/s-critical-thinking.js';
import { sArgumentResilience } from './ma/s-argument-resilience.js';
import { sCodeReviewQuality } from './ma/s-code-review-quality.js';
import { sHiddenBugFound } from './ma/s-hidden-bug-found.js';
import { sReviewPrioritization } from './ma/s-review-prioritization.js';
import { sDiagnosisAccuracy } from './ma/s-diagnosis-accuracy.js';
import { sPrincipleAbstraction } from './ma/s-principle-abstraction.js';

export const EXPECTED_SIGNAL_COUNT = 47;

/**
 * Register all V5 signals on the given registry.
 *
 * Task 11 wired sBeliefUpdateMagnitude (MC). Task 13a adds the 5 P0 signals.
 * Task 13b adds the 10 MA signals (9 original + sPrincipleAbstraction per
 * Round 2 Part 3 调整 2). `EXPECTED_SIGNAL_COUNT` is the contract later tasks
 * plus CI must satisfy once all 47 signals land:
 *   assert(signalRegistry.getSignalCount() === EXPECTED_SIGNAL_COUNT).
 */
export function registerAllSignals(registry: SignalRegistry): void {
  // MC (Task 11)
  registry.register(sBeliefUpdateMagnitude);
  // P0 (Task 13a)
  registry.register(sBaselineReading);
  registry.register(sAiCalibration);
  registry.register(sDecisionStyle);
  registry.register(sTechProfile);
  registry.register(sAiClaimDetection);
  // MA (Task 13b)
  registry.register(sSchemeJudgment);
  registry.register(sReasoningDepth);
  registry.register(sContextQuality);
  registry.register(sCriticalThinking);
  registry.register(sArgumentResilience);
  registry.register(sCodeReviewQuality);
  registry.register(sHiddenBugFound);
  registry.register(sReviewPrioritization);
  registry.register(sDiagnosisAccuracy);
  registry.register(sPrincipleAbstraction);
  // TODO(Task 13c-13e): import remaining 31 SignalDefinition files under
  // ./{mb,md,se}/ and call `registry.register(def)` for each.
  logger.debug(
    'registerAllSignals: registered 16/47 (1 MC + 5 P0 + 10 MA); Tasks 13c-13e add the rest',
  );
}
