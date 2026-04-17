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

export const EXPECTED_SIGNAL_COUNT = 47;

/**
 * Register all V5 signals on the given registry.
 *
 * Task 11 wires sBeliefUpdateMagnitude (Round 3 Part 3 调整 3). Task 13 adds
 * the remaining 46 SignalDefinition imports. `EXPECTED_SIGNAL_COUNT` is the
 * contract Task 13 + CI must satisfy once all signals land:
 *   assert(signalRegistry.getSignalCount() === EXPECTED_SIGNAL_COUNT).
 */
export function registerAllSignals(registry: SignalRegistry): void {
  registry.register(sBeliefUpdateMagnitude);
  // TODO(Task 13): import remaining 46 SignalDefinition files under
  // ./{p0,ma,mb,md,se,mc}/ and call `registry.register(def)` for each.
  logger.debug('registerAllSignals: registered 1/47 (sBeliefUpdateMagnitude); Task 13 will add the rest');
}
