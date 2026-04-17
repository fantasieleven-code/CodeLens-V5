/**
 * V5 Signal registration entry point.
 *
 * Task 8 provides this scaffold; Task 13 fills in the 47 `SignalDefinition`
 * imports and `registry.register(def)` calls. The split keeps the framework
 * independently verifiable before the signal catalog exists.
 *
 * Round 3 Part 2 raised the V5.0 signal catalog from 43 → 47
 * (40 pure-rule + 3 MD LLM-whitelist + 4 新增 sAiClaim / sPrinciple /
 * sBelief / sDecisionLatency). `EXPECTED_SIGNAL_COUNT` is the contract
 * Task 13 + Part 7 CI must satisfy:
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

export const EXPECTED_SIGNAL_COUNT = 47;

/**
 * Register all V5 signals on the given registry.
 *
 * Task 11 wired sBeliefUpdateMagnitude (MC). Task 13a adds the 5 P0 signals
 * (sBaselineReading / sAiCalibration / sDecisionStyle / sTechProfile /
 * sAiClaimDetection). `EXPECTED_SIGNAL_COUNT` is the contract later tasks
 * plus CI must satisfy once all 47 signals land:
 *   assert(signalRegistry.getSignalCount() === EXPECTED_SIGNAL_COUNT).
 */
export function registerAllSignals(registry: SignalRegistry): void {
  registry.register(sBeliefUpdateMagnitude);
  registry.register(sBaselineReading);
  registry.register(sAiCalibration);
  registry.register(sDecisionStyle);
  registry.register(sTechProfile);
  registry.register(sAiClaimDetection);
  // TODO(Task 13b-13e): import remaining 41 SignalDefinition files under
  // ./{ma,mb,md,se,mc}/ and call `registry.register(def)` for each.
  logger.debug(
    'registerAllSignals: registered 6/47 (1 MC + 5 P0); Tasks 13b-13e add the rest',
  );
}
