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
// MB (Task 13c) — 23 signals
import { sTaskDecomposition } from './mb/stage1/s-task-decomposition.js';
import { sInterfaceDesign } from './mb/stage1/s-interface-design.js';
import { sFailureAnticipation } from './mb/stage1/s-failure-anticipation.js';
import { sPromptQuality } from './mb/stage2-exec/s-prompt-quality.js';
import { sIterationEfficiency } from './mb/stage2-exec/s-iteration-efficiency.js';
import { sPrecisionFix } from './mb/stage2-exec/s-precision-fix.js';
import { sAiCompletionAcceptRate } from './mb/cursor/s-ai-completion-accept-rate.js';
import { sChatVsDirectRatio } from './mb/cursor/s-chat-vs-direct-ratio.js';
import { sFileNavigationEfficiency } from './mb/cursor/s-file-navigation-efficiency.js';
import { sTestFirstBehavior } from './mb/cursor/s-test-first-behavior.js';
import { sEditPatternQuality } from './mb/cursor/s-edit-pattern-quality.js';
import { sDecisionLatencyQuality } from './mb/cursor/s-decision-latency-quality.js';
import { sModifyQuality } from './mb/stage2-quality/s-modify-quality.js';
import { sBlockSelectivity } from './mb/stage2-quality/s-block-selectivity.js';
import { sChallengeComplete } from './mb/stage2-quality/s-challenge-complete.js';
import { sVerifyDiscipline } from './mb/stage2-quality/s-verify-discipline.js';
import { sAiOutputReview } from './mb/stage2-quality/s-ai-output-review.js';
import { sRulesQuality } from './mb/stage3/s-rules-quality.js';
import { sRulesCoverage } from './mb/stage3/s-rules-coverage.js';
import { sRulesSpecificity } from './mb/stage3/s-rules-specificity.js';
import { sAgentGuidance } from './mb/stage3/s-agent-guidance.js';
import { sWritingQuality } from './mb/horizontal/s-writing-quality.js';
import { sRuleEnforcement } from './mb/stage4/s-rule-enforcement.js';
// MD (Task 13d) — 4 signals (3 LLM whitelist + 1 pure rule)
import { sConstraintIdentification } from './md/s-constraint-identification.js';
import { sDesignDecomposition } from './md/s-design-decomposition.js';
import { sTradeoffArticulation } from './md/s-tradeoff-articulation.js';
import { sAiOrchestrationQuality } from './md/s-ai-orchestration-quality.js';
// SE (Task 13d) — 1 signal
import { sMetaCognition } from './se/s-meta-cognition.js';

export const EXPECTED_SIGNAL_COUNT = 47;

/**
 * Register all V5 signals on the given registry.
 *
 * Task 11 wired sBeliefUpdateMagnitude (MC). Task 13a adds the 5 P0 signals.
 * Task 13b adds the 10 MA signals (9 original + sPrincipleAbstraction per
 * Round 2 Part 3 调整 2). Task 13c adds the 23 MB signals across 7
 * subdirectories (stage1 / stage2-exec / cursor / stage2-quality / stage3 /
 * horizontal / stage4). Task 13d adds the 4 MD signals (3 LLM whitelist:
 * sDesignDecomposition / sTradeoffArticulation / sAiOrchestrationQuality
 * plus 1 pure rule: sConstraintIdentification) and 1 SE signal
 * (sMetaCognition). `EXPECTED_SIGNAL_COUNT` is the contract later tasks
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
  // MB Stage 1 planning (Task 13c)
  registry.register(sTaskDecomposition);
  registry.register(sInterfaceDesign);
  registry.register(sFailureAnticipation);
  // MB Stage 2 execution (Task 13c)
  registry.register(sPromptQuality);
  registry.register(sIterationEfficiency);
  registry.register(sPrecisionFix);
  // MB Cursor behavior (Task 13c)
  registry.register(sAiCompletionAcceptRate);
  registry.register(sChatVsDirectRatio);
  registry.register(sFileNavigationEfficiency);
  registry.register(sTestFirstBehavior);
  registry.register(sEditPatternQuality);
  registry.register(sDecisionLatencyQuality);
  // MB Stage 2 quality (Task 13c)
  registry.register(sModifyQuality);
  registry.register(sBlockSelectivity);
  registry.register(sChallengeComplete);
  registry.register(sVerifyDiscipline);
  registry.register(sAiOutputReview);
  // MB Stage 3 standards + AI governance (Task 13c)
  registry.register(sRulesQuality);
  registry.register(sRulesCoverage);
  registry.register(sRulesSpecificity);
  registry.register(sAgentGuidance);
  // MB horizontal writing (Task 13c)
  registry.register(sWritingQuality);
  // MB Stage 4 audit (Task 13c)
  registry.register(sRuleEnforcement);
  // MD (Task 13d)
  registry.register(sConstraintIdentification);
  registry.register(sDesignDecomposition);
  registry.register(sTradeoffArticulation);
  registry.register(sAiOrchestrationQuality);
  // SE (Task 13d)
  registry.register(sMetaCognition);
  // TODO(Task 13e): import remaining 3 MC SignalDefinition files under
  // ./mc/ (sBoundaryAwareness + sCommunicationClarity + sReflectionDepth)
  // and call `registry.register(def)`.
  logger.debug(
    'registerAllSignals: registered 44/47 (1 MC + 5 P0 + 10 MA + 23 MB + 4 MD + 1 SE); Task 13e adds the rest',
  );
}
