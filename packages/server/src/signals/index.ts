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

export const EXPECTED_SIGNAL_COUNT = 47;

/**
 * Register all V5 signals on the given registry.
 *
 * Task 13 replaces the empty body with 47 imports + register() calls. Until
 * then this is intentionally a no-op so the rest of the wiring (bootstrap,
 * computeAll, Langfuse tracing) can be exercised in isolation.
 */
export function registerAllSignals(_registry: SignalRegistry): void {
  // TODO(Task 13): import 47 SignalDefinition files under ./{p0,ma,mb,md,se,mc}/
  // and call `_registry.register(def)` for each. Keep this function side-effect-
  // free except for registry mutation so it is safe to call during app boot.
  logger.debug('registerAllSignals called — Task 13 will populate 47 signals');
}
