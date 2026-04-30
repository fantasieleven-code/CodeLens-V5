/**
 * mc-probe-engine.ts — V5 signal-driven dynamic probing engine for Module C.
 *
 * Ported from V4 (archive/v4/mc/mc-probe-engine.ts) with three V5 changes:
 *
 *   1. `V5_DIMENSION_SIGNALS` replaces V4's 6-dimension labels — maps the six
 *      V5 dimensions (technicalJudgment / aiEngineering / systemDesign /
 *      codeQuality / communication / metacognition) to the 47 V5 signal ids
 *      (9 + 14 + 3 + 12 + 3 + 6).
 *   2. Probe instruction templates load from `promptRegistry.get('mc.probe_engine.*')`
 *      instead of being hard-coded in the engine. Seed placeholders are
 *      treated as unavailable by PromptRegistry, so the built-in guidance is
 *      the production fallback until real prompt bodies are activated.
 *   3. A Langfuse trace is emitted for each probe decision so we can audit
 *      which strategy fired for which signal shape.
 *
 * Round strategy keys match `V5ProbeStrategy`:
 *   1: baseline       — fixed MA baseline
 *   2: contradiction  — signal-driven: strongest contradiction detected
 *   2-3: weakness     — weakest dimension deep-dive
 *   4: escalation     — upgrade / downgrade boundary
 *   5: transfer       — reflection + cross-domain
 */

import type { V5ProbeStrategy } from '@codelens-v5/shared';
import { logger } from '../lib/logger.js';
import { getLangfuse } from '../lib/langfuse.js';
import { promptRegistry } from './prompt-registry.service.js';

// ─── Types ────────────────────────────────────────────────────────────────

/** Superset of V5ProbeStrategy + `verify` for contradictions (stored as probeType metadata). */
export type ProbeType = V5ProbeStrategy | 'verify' | 'challenge';

export interface ProbeDecision {
  targetDimension: string;
  probeType: ProbeType;
  /** Strategy key used to look up prompt template in PromptRegistry. */
  strategyKey: V5ProbeStrategy;
  reason: string;
  /** Prompt fragment injected into the Emma system prompt for this round. */
  promptGuidance: string;
  round: number;
}

/**
 * Lightweight signal snapshot — same shape as V4, expanded for V5 signals
 * actually used in contradiction / boundary rules. Any V5 signal not keyed
 * here is irrelevant for probe decisions; registration of the full 48 id
 * set lives in `signals/index.ts`.
 */
export interface SignalSnapshot {
  // Technical judgment (MA)
  sSchemeJudgment?: number;
  sReasoningDepth?: number;
  sDiagnosisAccuracy?: number;
  sContextQuality?: number;
  sCriticalThinking?: number;
  sArgumentResilience?: number;
  sPrincipleAbstraction?: number;
  sBaselineReading?: number;
  sAiClaimDetection?: number;

  // AI engineering (MB)
  sTaskDecomposition?: number;
  sInterfaceDesign?: number;
  sFailureAnticipation?: number;
  sPromptQuality?: number;
  sIterationEfficiency?: number;
  sPrecisionFix?: number;
  sAiCompletionAcceptRate?: number;
  sChatVsDirectRatio?: number;
  sFileNavigationEfficiency?: number;
  sTestFirstBehavior?: number;
  sEditPatternQuality?: number;
  sAgentGuidance?: number;
  sAiOrchestrationQuality?: number;
  sDecisionLatencyQuality?: number;

  // Code quality (MB/MA)
  sCodeReviewQuality?: number;
  sHiddenBugFound?: number;
  sReviewPrioritization?: number;
  sModifyQuality?: number;
  sBlockSelectivity?: number;
  sChallengeComplete?: number;
  sVerifyDiscipline?: number;
  sAiOutputReview?: number;
  sRulesQuality?: number;
  sRulesCoverage?: number;
  sRulesSpecificity?: number;
  sRuleEnforcement?: number;

  // Communication (MC)
  sBoundaryAwareness?: number;
  sCommunicationClarity?: number;
  sWritingQuality?: number;

  // Metacognition (SE/MC)
  sMetaCognition?: number;
  sAiCalibration?: number;
  sDecisionStyle?: number;
  sTechProfile?: number;
  sReflectionDepth?: number;
  sBeliefUpdateMagnitude?: number;
  sCalibration?: number;

  // System design (MD)
  sDesignDecomposition?: number;
  sConstraintIdentification?: number;
  sTradeoffArticulation?: number;
}

export interface DimensionScore {
  dim: string;
  label: string;
  score: number;
  signalIds: (keyof SignalSnapshot)[];
}

// ─── V5 six-dimension → 48 signal map (Task A1 adds sCalibration) ───────

export const V5_DIMENSION_SIGNALS: Record<
  string,
  { label: string; signals: (keyof SignalSnapshot)[] }
> = {
  technicalJudgment: {
    label: '技术判断力',
    signals: [
      'sSchemeJudgment',
      'sReasoningDepth',
      'sContextQuality',
      'sCriticalThinking',
      'sArgumentResilience',
      'sDiagnosisAccuracy',
      'sPrincipleAbstraction',
      'sBaselineReading',
      'sAiClaimDetection',
    ],
  },
  aiEngineering: {
    label: 'AI 工程力',
    signals: [
      'sTaskDecomposition',
      'sInterfaceDesign',
      'sFailureAnticipation',
      'sPromptQuality',
      'sIterationEfficiency',
      'sPrecisionFix',
      'sAiCompletionAcceptRate',
      'sChatVsDirectRatio',
      'sFileNavigationEfficiency',
      'sTestFirstBehavior',
      'sEditPatternQuality',
      'sAgentGuidance',
      'sAiOrchestrationQuality',
      'sDecisionLatencyQuality',
    ],
  },
  codeQuality: {
    label: '代码质量',
    signals: [
      'sCodeReviewQuality',
      'sHiddenBugFound',
      'sReviewPrioritization',
      'sModifyQuality',
      'sBlockSelectivity',
      'sChallengeComplete',
      'sVerifyDiscipline',
      'sAiOutputReview',
      'sRulesQuality',
      'sRulesCoverage',
      'sRulesSpecificity',
      'sRuleEnforcement',
    ],
  },
  communication: {
    label: '沟通表达',
    signals: ['sBoundaryAwareness', 'sCommunicationClarity', 'sWritingQuality'],
  },
  metacognition: {
    label: '元认知',
    signals: [
      'sMetaCognition',
      'sAiCalibration',
      'sDecisionStyle',
      'sTechProfile',
      'sReflectionDepth',
      'sBeliefUpdateMagnitude',
      'sCalibration',
    ],
  },
  systemDesign: {
    label: '系统设计',
    signals: ['sDesignDecomposition', 'sConstraintIdentification', 'sTradeoffArticulation'],
  },
};

export const V5_DIMENSION_SIGNAL_TOTAL = Object.values(V5_DIMENSION_SIGNALS).reduce(
  (acc, d) => acc + d.signals.length,
  0,
);

// ─── Prompt template keys ────────────────────────────────────────────────

const PROMPT_KEY_BY_STRATEGY: Record<V5ProbeStrategy, string> = {
  baseline: 'mc.probe_engine.baseline',
  contradiction: 'mc.probe_engine.contradiction',
  weakness: 'mc.probe_engine.weakness',
  escalation: 'mc.probe_engine.escalation',
  transfer: 'mc.probe_engine.transfer',
};

// ─── Scoring helpers ─────────────────────────────────────────────────────

function avg(signals: (keyof SignalSnapshot)[], snapshot: SignalSnapshot): number {
  const vals = signals.map((s) => snapshot[s]).filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeDimensionScores(snapshot: SignalSnapshot): DimensionScore[] {
  return Object.entries(V5_DIMENSION_SIGNALS).map(([dim, { label, signals }]) => ({
    dim,
    label,
    score: avg(signals, snapshot),
    signalIds: signals,
  }));
}

function computeComposite(dims: DimensionScore[]): number {
  const defined = dims.filter((d) => d.score > 0);
  if (defined.length === 0) return 0;
  return (defined.reduce((s, d) => s + d.score, 0) / defined.length) * 100;
}

// ─── Contradiction detection (V5 signal vocabulary) ──────────────────────

interface RawDecision {
  targetDimension: string;
  probeType: ProbeType;
  strategyKey: V5ProbeStrategy;
  reason: string;
  promptGuidance: string;
  round: number;
}

function detectContradictions(snapshot: SignalSnapshot): RawDecision[] {
  const out: RawDecision[] = [];

  // MA scheme judgment high but MC boundary awareness low → possibly copied MA answers.
  if ((snapshot.sSchemeJudgment ?? 0) >= 0.85 && (snapshot.sBoundaryAwareness ?? 0.5) < 0.3) {
    out.push({
      targetDimension: 'technicalJudgment',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: '方案选型高分但边界意识很低，需核实判断力真实性',
      promptGuidance:
        '追问方向：让候选人具体描述他选的方案在极端情况下的行为。比如"你选的方案在并发量突然飙升10倍时会怎样？你当时考虑过这个场景吗？"如果回答模糊或回避，说明 MA 可能不是独立完成的。',
      round: 2,
    });
  }

  // MB challenge complete but prompt quality low → brute-force retry.
  if ((snapshot.sChallengeComplete ?? 0) >= 0.8 && (snapshot.sPromptQuality ?? 0.5) < 0.4) {
    out.push({
      targetDimension: 'aiEngineering',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: 'MB 最终通过但 prompt 质量低，可能是暴力重试',
      promptGuidance:
        '追问方向："你在指挥 AI 实现需求时，第一轮给 AI 的指令是怎么组织的？你有没有先分析需求再给指令，还是直接把需求原文丢给 AI？" 关注候选人能否描述结构化的指挥策略。',
      round: 2,
    });
  }

  // High code-review signals but low reasoning depth → may have guessed defects.
  if (
    (snapshot.sCodeReviewQuality ?? 0) >= 0.8 &&
    (snapshot.sReasoningDepth ?? 0.5) < 0.35
  ) {
    out.push({
      targetDimension: 'codeQuality',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: '代码审查高分但理由浅，可能是猜测而非真正理解',
      promptGuidance:
        '追问方向：挑一个候选人标记的缺陷，问"这个缺陷你是怎么发现的？是看代码逻辑推断出来的，还是凭经验觉得这里可能有问题？" 关注候选人能否还原发现过程。',
      round: 2,
    });
  }

  // Self-assessment wildly off → metacognition issue.
  const meta = snapshot.sMetaCognition ?? 0.5;
  if (meta < 0.3 || meta > 0.9) {
    out.push({
      targetDimension: 'metacognition',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: `自评和实际差距过大 (sMetaCognition=${(meta * 100).toFixed(0)})`,
      promptGuidance:
        '追问方向："你给自己的自评是多少分？你觉得哪个环节做得最好，哪个最差？如果重来一次你会怎么调整？" 关注候选人自我认知的准确度。',
      round: 2,
    });
  }

  // MD tradeoff articulation low but design decomposition high → architectural intuition without reasoning.
  if (
    (snapshot.sDesignDecomposition ?? 0) >= 0.75 &&
    (snapshot.sTradeoffArticulation ?? 0.5) < 0.35
  ) {
    out.push({
      targetDimension: 'systemDesign',
      probeType: 'verify',
      strategyKey: 'contradiction',
      reason: 'MD 模块拆分高分但权衡表达低，设计直觉但缺推理',
      promptGuidance:
        '追问方向："你选这个分层时，放弃了什么？如果团队规模再加 3 个人，你这个拆分方式会不会成为瓶颈？" 评估候选人能否把设计决策背后的权衡讲清楚。',
      round: 2,
    });
  }

  return out;
}

// ─── Upgrade / downgrade boundary detection ──────────────────────────────

function detectBoundaryOpportunities(
  composite: number,
  dims: DimensionScore[],
): RawDecision | null {
  const weakest = [...dims].sort((a, b) => a.score - b.score);

  if (composite >= 62 && composite < 72) {
    const target = weakest[0];
    return {
      targetDimension: target.dim,
      probeType: 'escalation',
      strategyKey: 'escalation',
      reason: `综合分 ${composite.toFixed(0)} 接近 A 级门槛(70)，${target.label}最弱(${(target.score * 100).toFixed(0)})，追问看是否有隐藏实力`,
      promptGuidance: `这个候选人综合分接近 A 级门槛。${target.label}是他的短板。追问方向：给一个${target.label}相关的具体场景，看候选人能否展现比书面答案更深的理解。如果能，这个维度可以提升；如果不能，确认这是真实水平。`,
      round: 4,
    };
  }

  if (composite >= 80 && composite < 88) {
    const target = weakest[0];
    return {
      targetDimension: target.dim,
      probeType: 'escalation',
      strategyKey: 'escalation',
      reason: `综合分 ${composite.toFixed(0)} 接近 S 级门槛(85)，${target.label}最弱(${(target.score * 100).toFixed(0)})`,
      promptGuidance: `这个候选人表现优异，接近 S 级。追问他最弱的维度 ${target.label}——给一个高难度的开放式问题，看他的思维深度能否匹配 S 级标准。`,
      round: 4,
    };
  }

  // B- danger zone: AI engineering >> technicalJudgment by a lot.
  const tj = dims.find((d) => d.dim === 'technicalJudgment');
  const ae = dims.find((d) => d.dim === 'aiEngineering');
  if (tj && ae && ae.score - tj.score > 0.2 && composite >= 55) {
    return {
      targetDimension: 'technicalJudgment',
      probeType: 'verify',
      strategyKey: 'escalation',
      reason: `B- 危险信号：AI 工程力(${(ae.score * 100).toFixed(0)})远高于技术判断力(${(tj.score * 100).toFixed(0)})，会指挥 AI 但判断力不足`,
      promptGuidance:
        '这个候选人可能是"B-危险型"——擅长指挥AI但判断力不足。追问一个需要独立技术判断的问题（不涉及AI），比如"如果没有AI帮你，你怎么判断一段代码是否有并发安全问题？"',
      round: 4,
    };
  }

  return null;
}

// ─── Prompt template loading ─────────────────────────────────────────────

async function loadStrategyTemplate(strategy: V5ProbeStrategy): Promise<string> {
  const key = PROMPT_KEY_BY_STRATEGY[strategy];
  try {
    return await promptRegistry.get(key);
  } catch (err) {
    logger.warn('[mc-probe] prompt registry lookup failed', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return '';
  }
}

function composePromptGuidance(baseGuidance: string, template: string): string {
  if (!template) return baseGuidance;
  return `${baseGuidance}\n\n[策略模板]\n${template}`;
}

// ─── Langfuse trace (non-blocking, mirror of signal-registry pattern) ────

async function traceProbeDecision(
  sessionId: string,
  snapshot: SignalSnapshot,
  decision: RawDecision,
): Promise<void> {
  try {
    const langfuse = await getLangfuse();
    langfuse.trace({
      name: `mc.probe.${decision.strategyKey}`,
      sessionId,
      input: {
        round: decision.round,
        signalKeysSeen: Object.keys(snapshot).length,
      },
      output: {
        targetDimension: decision.targetDimension,
        probeType: decision.probeType,
        strategyKey: decision.strategyKey,
        reason: decision.reason,
      },
      metadata: {
        isLLMWhitelist: false,
      },
    });
  } catch (err) {
    logger.debug('[mc-probe] langfuse trace failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Analyze signal snapshot + decide what to probe in the given round. Loads
 * the strategy prompt template from PromptRegistry and emits a Langfuse
 * trace before returning. Safe to call before real prompt bodies are active:
 * PromptRegistry rejects seed placeholders and this engine falls back to its
 * built-in guidance without throwing.
 *
 * @param sessionId       Session id (for trace correlation).
 * @param snapshot        Current signal values (0–1 scale).
 * @param round           Current round number (1–5).
 * @param previousProbes  Previously executed probe decisions (for dedup).
 */
export async function analyzeSignalsForProbing(
  sessionId: string,
  snapshot: SignalSnapshot,
  round: number,
  previousProbes: ProbeDecision[] = [],
): Promise<ProbeDecision> {
  const dims = computeDimensionScores(snapshot);
  const composite = computeComposite(dims);
  const askedDims = new Set(previousProbes.map((p) => p.targetDimension));

  const weakest = [...dims].sort((a, b) => {
    const aAsked = askedDims.has(a.dim) ? 1 : 0;
    const bAsked = askedDims.has(b.dim) ? 1 : 0;
    if (aAsked !== bAsked) return aAsked - bAsked;
    return a.score - b.score;
  });

  let decision: RawDecision;

  if (round <= 1) {
    decision = {
      targetDimension: 'technicalJudgment',
      probeType: 'baseline',
      strategyKey: 'baseline',
      reason: '第 1 轮：基线建立，了解候选人的判断思路',
      promptGuidance:
        '这是第 1 轮追问。先简短自我介绍（"我是 Emma，你的 AI 面试官"），然后提示候选人"如果语音不方便表达，随时可以切换到页面下方的文字输入框，语音和文字的评分权重完全相同"。然后开放性地问候选人在 Module A 选型时最纠结的点是什么。不要直接问"你为什么选方案X"——他已经写过了。换一个角度，比如"做选型时有没有某个点让你特别犹豫？最终是什么让你下定决心的？"',
      round: 1,
    };
  } else if (round >= 5) {
    decision = {
      targetDimension: 'metacognition',
      probeType: 'transfer',
      strategyKey: 'transfer',
      reason: '第 5 轮：跨领域迁移 + 反思',
      promptGuidance:
        '最后一轮。先让候选人反思："回头看第一个问题，你的回答到现在有没有什么想修正的？" 然后出一个跨领域问题——从题目的主技术栈之外选一个方向（比如分布式一致性、可观测性、安全审计），问"如果让你设计这个场景的解决方案，你会怎么拆解？" 评价标准是推理路径的严谨度，不是答案正确性。',
      round: 5,
    };
  } else {
    const contradictions = detectContradictions(snapshot);
    const boundary = detectBoundaryOpportunities(composite, dims);

    if (contradictions.length > 0) {
      const sorted = [...contradictions].sort((a, b) => {
        const aAsked = askedDims.has(a.targetDimension) ? 1 : 0;
        const bAsked = askedDims.has(b.targetDimension) ? 1 : 0;
        return aAsked - bAsked;
      });
      if (round === 2 || !askedDims.has(sorted[0].targetDimension)) {
        decision = { ...sorted[0], round };
        logger.info(`[mc-probe] round ${round} contradiction: ${decision.reason}`);
      } else {
        decision = buildWeaknessDecision(weakest[0], round, askedDims);
      }
    } else if (round === 3 || round === 2) {
      decision = buildWeaknessDecision(weakest[0], round, askedDims);
    } else if (round === 4 && boundary && !askedDims.has(boundary.targetDimension)) {
      decision = { ...boundary, round: 4 };
      logger.info(`[mc-probe] round 4 boundary: ${decision.reason}`);
    } else {
      decision = buildWeaknessDecision(weakest[0], round, askedDims);
    }
  }

  const template = await loadStrategyTemplate(decision.strategyKey);
  decision.promptGuidance = composePromptGuidance(decision.promptGuidance, template);

  traceProbeDecision(sessionId, snapshot, decision).catch(() => {});

  return decision;
}

function buildWeaknessDecision(
  target: DimensionScore,
  round: number,
  askedDims: Set<string>,
): RawDecision {
  const hint =
    target.dim === 'codeQuality'
      ? '"你在审阅 AI 生成的代码时，一般先看什么？有没有遇到过 AI 代码看着对但实际有问题的情况？"'
      : target.dim === 'aiEngineering'
        ? '"你写给 AI 的 prompt，一般是先拆任务还是直接抛需求？一次不行你会怎么调整？"'
        : target.dim === 'systemDesign'
          ? '"你在做模块拆分时是怎么决定哪些要写成独立模块的？你怎么判断一个模块职责是不是太大？"'
          : target.dim === 'communication'
            ? '"你在跟不熟的同事解释一个方案时，最常用的切入方式是什么？"'
            : '"针对这个维度的核心能力追问具体的场景和经验"';

  return {
    targetDimension: target.dim,
    probeType: 'weakness',
    strategyKey: 'weakness',
    reason: `第 ${round} 轮：${target.label}得分最低(${(target.score * 100).toFixed(0)})${askedDims.has(target.dim) ? '(已追问过，无新维度可选)' : ''}，深入追问确认`,
    promptGuidance: `候选人在${target.label}维度上表现最弱。追问一个这个维度的核心能力点。比如${hint}`,
    round,
  };
}

/**
 * Build a signal snapshot from V5 submissions WITHOUT running the full
 * scoring pipeline. Reads pre-computed signal values from
 * `session.metadata.signalResults`; falls back to an empty snapshot so the
 * probe engine still works when no scoring has run yet.
 *
 * Note: raw-submission heuristics (V4's fallback) are deliberately dropped
 * in V5 — signals land through the registry only; the engine never tries to
 * guess signal values from raw submissions.
 */
export async function buildSignalSnapshot(sessionId: string): Promise<SignalSnapshot> {
  try {
    const { prisma } = await import('../config/db.js');
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });

    if (!session?.metadata) return {};

    const meta = session.metadata as Record<string, unknown>;
    const signalResults = meta.signalResults as
      | Record<string, { value?: number | null }>
      | undefined;

    if (!signalResults) return {};

    const snapshot: SignalSnapshot = {};
    for (const [key, result] of Object.entries(signalResults)) {
      if (typeof result?.value === 'number') {
        (snapshot as Record<string, number>)[key] = result.value;
      }
    }
    return snapshot;
  } catch (err) {
    logger.warn('[mc-probe] Failed to build signal snapshot:', err);
    return {};
  }
}
