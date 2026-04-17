/**
 * mc-probe-engine.ts — Signal-driven dynamic probing engine for Module C
 *
 * Analyzes the candidate's v4 submissions (signals snapshot) to decide
 * what to probe in each voice/text round. This is what makes CodeLens MC
 * uniquely valuable: every candidate gets a different probing path.
 *
 * Decision priority: suspicious contradiction > upgrade opportunity > weakest dimension
 *
 * Round strategy:
 *   1: Fixed — MA scheme choice reasoning (baseline establishment)
 *   2: Signal-driven — most suspicious contradiction
 *   3: Signal-driven — weakest dimension deep-dive
 *   4: Signal-driven — upgrade/downgrade boundary probe
 *   5: Fixed — cross-domain transfer (Chollet-style)
 */

import { logger } from '../lib/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────

export type ProbeType = 'verify' | 'upgrade' | 'challenge' | 'baseline' | 'transfer';

export interface ProbeDecision {
  targetDimension: string;
  probeType: ProbeType;
  reason: string;
  promptGuidance: string;   // Injected into system prompt for LLM
  round: number;
}

/** Lightweight signal snapshot — we don't need full SignalOutputV4, just the scores. */
export interface SignalSnapshot {
  // MA signals
  sSchemeJudgment?: number;
  sReasoningDepth?: number;
  sDefectDetection?: number;
  sSeverityRanking?: number;
  sDiagnosisAccuracy?: number;
  sContextQuality?: number;
  sHiddenBugFound?: number;
  sCriticalThinking?: number;
  // MB1 signals
  sPromptQuality?: number;
  sIterationEfficiency?: number;
  sVerifyDiscipline?: number;
  sModifyQuality?: number;
  sChallengeComplete?: number;
  sBlockSelectivity?: number;
  sPrecisionFix?: number;
  // MB2 signals
  sRulesQuality?: number;
  sRulesCoverage?: number;
  sRulesSpecificity?: number;
  sAgentGuidance?: number;
  // P0 signals
  sAiCalibration?: number;
  sBaselineReading?: number;
  // SE signals
  sMetaCognition?: number;
  sDecisionStyle?: number;
  // MC signals (from earlier rounds)
  sBoundaryAwareness?: number;
  sCommunicationClarity?: number;
  sReflectionDepth?: number;
}

export interface DimensionScore {
  dim: string;
  label: string;
  score: number;
  signalNames: string[];
}

// ─── Signal → Dimension mapping ──────────────────────────────────────────

const DIMENSION_SIGNALS: Record<string, { label: string; signals: (keyof SignalSnapshot)[] }> = {
  technicalDecision:      { label: '技术决策力', signals: ['sSchemeJudgment', 'sDefectDetection', 'sSeverityRanking', 'sHiddenBugFound', 'sDiagnosisAccuracy'] },
  requirementExpression:  { label: '需求表达力', signals: ['sPromptQuality', 'sIterationEfficiency', 'sModifyQuality', 'sBlockSelectivity', 'sChallengeComplete'] },
  qualityControl:         { label: '质量把控力', signals: ['sVerifyDiscipline', 'sContextQuality', 'sCriticalThinking', 'sPrecisionFix'] },
  systemDesign:           { label: '系统设计力', signals: ['sRulesQuality', 'sRulesCoverage', 'sRulesSpecificity', 'sAgentGuidance'] },
  aiAwareness:            { label: 'AI 认知力', signals: ['sAiCalibration', 'sBaselineReading'] },
  technicalDepth:         { label: '技术深度', signals: ['sBoundaryAwareness', 'sReasoningDepth'] },
};

// ─── Core engine ─────────────────────────────────────────────────────────

function avg(signals: (keyof SignalSnapshot)[], snapshot: SignalSnapshot): number {
  const vals = signals.map(s => snapshot[s]).filter((v): v is number => v != null);
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function computeDimensionScores(snapshot: SignalSnapshot): DimensionScore[] {
  return Object.entries(DIMENSION_SIGNALS).map(([dim, { label, signals }]) => ({
    dim,
    label,
    score: avg(signals, snapshot),
    signalNames: signals,
  }));
}

function computeComposite(dims: DimensionScore[]): number {
  const defined = dims.filter(d => d.score > 0);
  if (defined.length === 0) return 0;
  return (defined.reduce((s, d) => s + d.score, 0) / defined.length) * 100;
}

/** Detect suspicious contradictions between signals. */
function detectContradictions(snapshot: SignalSnapshot): ProbeDecision[] {
  const results: ProbeDecision[] = [];

  // MA high score + MC boundary awareness low → may have copied MA answers
  if ((snapshot.sSchemeJudgment ?? 0) >= 0.85 && (snapshot.sBoundaryAwareness ?? 0.5) < 0.3) {
    results.push({
      targetDimension: 'technicalDecision',
      probeType: 'verify',
      reason: '方案选型高分但边界意识很低，需核实判断力真实性',
      promptGuidance: '追问方向：让候选人具体描述他选的方案在极端情况下的行为。比如"你选的方案在并发量突然飙升10倍时会怎样？你当时考虑过这个场景吗？"如果回答模糊或回避，说明MA可能不是独立完成的。',
      round: 2,
    });
  }

  // MB1 challenge complete but prompt quality low → brute-force retry
  if ((snapshot.sChallengeComplete ?? 0) >= 0.8 && (snapshot.sPromptQuality ?? 0.5) < 0.4) {
    results.push({
      targetDimension: 'requirementExpression',
      probeType: 'verify',
      reason: 'MB1 最终通过但 prompt 质量低，可能是暴力重试',
      promptGuidance: '追问方向："你在指挥 AI 实现需求时，第一轮给 AI 的指令是怎么组织的？你有没有先分析需求再给指令，还是直接把需求原文丢给 AI？" 关注候选人能否描述结构化的指挥策略。',
      round: 2,
    });
  }

  // High defect detection but low reasoning depth → may have guessed
  if ((snapshot.sDefectDetection ?? 0) >= 0.8 && (snapshot.sReasoningDepth ?? 0.5) < 0.35) {
    results.push({
      targetDimension: 'technicalDecision',
      probeType: 'verify',
      reason: '缺陷发现多但理由浅，可能是猜测而非真正理解',
      promptGuidance: '追问方向：挑一个候选人标记的缺陷，问"这个缺陷你是怎么发现的？是看代码逻辑推断出来的，还是凭经验觉得这里可能有问题？" 关注候选人能否还原发现过程。',
      round: 2,
    });
  }

  // Self-assessment far from reality → metacognition issue
  const meta = snapshot.sMetaCognition ?? 0.5;
  if (meta < 0.3 || meta > 0.9) {
    results.push({
      targetDimension: 'metacognition',
      probeType: 'verify',
      reason: `自评和实际差距过大 (sMetaCognition=${(meta * 100).toFixed(0)})`,
      promptGuidance: '追问方向："你给自己的自评是多少分？你觉得哪个环节做得最好，哪个最差？如果重来一次你会怎么调整？" 关注候选人自我认知的准确度。',
      round: 2,
    });
  }

  return results;
}

/** Find upgrade/downgrade boundary opportunities. */
function detectBoundaryOpportunities(
  composite: number,
  dims: DimensionScore[],
): ProbeDecision | null {
  const weakest = [...dims].sort((a, b) => a.score - b.score);

  // B+ → A boundary (composite 62-70)
  if (composite >= 62 && composite < 72) {
    const target = weakest[0];
    return {
      targetDimension: target.dim,
      probeType: 'upgrade',
      reason: `综合分 ${composite.toFixed(0)} 接近 A 级门槛(70)，${target.label}最弱(${(target.score * 100).toFixed(0)})，追问看是否有隐藏实力`,
      promptGuidance: `这个候选人综合分接近 A 级门槛。${target.label}是他的短板。追问方向：给一个${target.label}相关的具体场景，看候选人能否展现比书面答案更深的理解。如果能，这个维度可以提升；如果不能，确认这是真实水平。`,
      round: 4,
    };
  }

  // A → S boundary (composite 80-88)
  if (composite >= 80 && composite < 88) {
    const target = weakest[0];
    return {
      targetDimension: target.dim,
      probeType: 'upgrade',
      reason: `综合分 ${composite.toFixed(0)} 接近 S 级门槛(85)，${target.label}最弱(${(target.score * 100).toFixed(0)})`,
      promptGuidance: `这个候选人表现优异，接近 S 级。追问他最弱的维度 ${target.label}——给一个高难度的开放式问题，看他的思维深度能否匹配 S 级标准。`,
      round: 4,
    };
  }

  // B/B- danger zone — check if requirementExpression > technicalDecision by a lot
  const td = dims.find(d => d.dim === 'technicalDecision');
  const re = dims.find(d => d.dim === 'requirementExpression');
  if (td && re && re.score - td.score > 0.2 && composite >= 55) {
    return {
      targetDimension: 'technicalDecision',
      probeType: 'verify',
      reason: `B- 危险信号：需求表达力(${(re.score * 100).toFixed(0)})远高于技术决策力(${(td.score * 100).toFixed(0)})，会指挥AI但判断力不足`,
      promptGuidance: '这个候选人可能是"B-危险型"——擅长指挥AI但判断力不足。追问一个需要独立技术判断的问题（不涉及AI），比如"如果没有AI帮你，你怎么判断一段代码是否有并发安全问题？"',
      round: 4,
    };
  }

  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Analyze current signal snapshot and decide what to probe in the given round.
 *
 * @param snapshot - Current signal values (0-1 scale, from partial scoring)
 * @param round - Current round number (1-5)
 * @param previousProbes - Previously executed probe decisions (for dimension dedup)
 */
export function analyzeSignalsForProbing(
  snapshot: SignalSnapshot,
  round: number,
  previousProbes?: ProbeDecision[],
): ProbeDecision {
  const dims = computeDimensionScores(snapshot);
  const composite = computeComposite(dims);
  const askedDims = new Set((previousProbes || []).map(p => p.targetDimension));

  // Deduplicated weakest sort — unasked dimensions first, then by score ascending
  const weakest = [...dims].sort((a, b) => {
    const aAsked = askedDims.has(a.dim) ? 1 : 0;
    const bAsked = askedDims.has(b.dim) ? 1 : 0;
    if (aAsked !== bAsked) return aAsked - bAsked;
    return a.score - b.score;
  });

  // Round 1: Always baseline — MA scheme choice reasoning
  if (round <= 1) {
    return {
      targetDimension: 'technicalDecision',
      probeType: 'baseline',
      reason: '第 1 轮：基线建立，了解候选人的判断思路',
      promptGuidance: '这是第 1 轮追问。先简短自我介绍（"我是 Emma，你的 AI 面试官"），然后提示候选人"如果语音不方便表达，随时可以切换到页面下方的文字输入框，语音和文字的评分权重完全相同"。然后开放性地问候选人在 Module A 选型时最纠结的点是什么。不要直接问"你为什么选方案X"——他已经写过了。换一个角度，比如"做选型时有没有某个点让你特别犹豫？最终是什么让你下定决心的？"',
      round: 1,
    };
  }

  // Round 5: Always transfer — reflection + cross-domain
  if (round >= 5) {
    return {
      targetDimension: 'technicalDepth',
      probeType: 'transfer',
      reason: '第 5 轮：跨领域迁移 + 反思',
      promptGuidance: '最后一轮。先让候选人反思："回头看第一个问题，你的回答到现在有没有什么想修正的？" 然后出一个跨领域问题——从题目的主技术栈之外选一个方向（比如分布式一致性、可观测性、安全审计），问"如果让你设计这个场景的解决方案，你会怎么拆解？" 评价标准是推理路径的严谨度，不是答案正确性。',
      round: 5,
    };
  }

  // Rounds 2-4: Signal-driven decisions

  const contradictions = detectContradictions(snapshot);
  const boundary = detectBoundaryOpportunities(composite, dims);

  // Any round 2-4: if a strong contradiction exists, use it (prefer unasked dims)
  if (contradictions.length > 0) {
    // Sort: prefer contradictions targeting unasked dimensions
    const sorted = [...contradictions].sort((a, b) => {
      const aAsked = askedDims.has(a.targetDimension) ? 1 : 0;
      const bAsked = askedDims.has(b.targetDimension) ? 1 : 0;
      return aAsked - bAsked;
    });
    // Use contradiction if it targets a fresh dimension, or if round 2 (first signal-driven)
    if (round === 2 || !askedDims.has(sorted[0].targetDimension)) {
      const pick = sorted[0];
      logger.info(`[mc-probe] Round ${round} contradiction: ${pick.reason}`);
      return { ...pick, round };
    }
  }

  // Weakest dimension deep-dive (prefer unasked dimension)
  if (round === 3 || (round === 2 && contradictions.length === 0)) {
    const target = weakest[0];
    return {
      targetDimension: target.dim,
      probeType: 'challenge',
      reason: `第 ${round} 轮：${target.label}得分最低(${(target.score * 100).toFixed(0)})${askedDims.has(target.dim) ? '(已追问过，无新维度可选)' : ''}，深入追问确认`,
      promptGuidance: `候选人在${target.label}维度上表现最弱。追问一个这个维度的核心能力点。比如${
        target.dim === 'qualityControl' ? '"你在审阅 AI 生成的代码时，一般先看什么？有没有遇到过 AI 代码看着对但实际有问题的情况？"' :
        target.dim === 'systemDesign' ? '"你写 RULES.md 时是怎么决定哪些约束要写、哪些不用写的？你怎么判断一个约束是不是太宽泛？"' :
        target.dim === 'aiAwareness' ? '"你觉得 AI 在什么类型的编程任务上最不可靠？你有没有遇到过 AI 自信但错误的情况？"' :
        '"针对这个维度的核心能力追问具体的场景和经验"'
      }`,
      round,
    };
  }

  // Round 4: upgrade/downgrade boundary, or next weakest unasked dimension
  if (round === 4 && boundary && !askedDims.has(boundary.targetDimension)) {
    logger.info(`[mc-probe] Round 4 boundary: ${boundary.reason}`);
    return { ...boundary, round: 4 };
  }

  // Fallback: next weakest unasked dimension, or second weakest overall
  const target = weakest[0];
  if (contradictions.length > 0 && !askedDims.has(contradictions[0].targetDimension)) {
    return { ...contradictions[0], round };
  }
  return {
    targetDimension: target.dim,
    probeType: 'challenge',
    reason: `第 ${round} 轮：${target.label}(${(target.score * 100).toFixed(0)})${askedDims.has(target.dim) ? '(重复追问)' : ''}`,
    promptGuidance: `追问候选人在${target.label}方面的具体经验。关注他能否把抽象判断落到具体场景。`,
    round,
  };
}

/**
 * Build a signal snapshot from v4 submissions WITHOUT running the full scoring pipeline.
 * This is a lightweight extraction that reads pre-computed signal values from
 * the latest scoring result, or falls back to raw submission heuristics.
 */
export async function buildSignalSnapshot(
  sessionId: string,
  prismaClient: { session: { findUnique: (args: any) => Promise<any> } },
): Promise<SignalSnapshot> {
  try {
    const session = await prismaClient.session.findUnique({
      where: { id: sessionId },
      select: { metadata: true },
    });
    if (!session?.metadata) return {};

    const meta = session.metadata as Record<string, any>;
    const v4 = meta.v4 as Record<string, any> | undefined;
    if (!v4) return {};

    // Try to read from cached scoring result (populated after self-assess or rescore)
    const scoring = v4.scoringResult as Record<string, any> | undefined;
    if (scoring?.signals) {
      // signals is the full SignalOutputV4 object, just pick the numeric values
      const signals = scoring.signals as Record<string, unknown>;
      const snapshot: SignalSnapshot = {};
      for (const [key, val] of Object.entries(signals)) {
        if (typeof val === 'number' && key.startsWith('s')) {
          (snapshot as any)[key] = val;
        }
      }
      return snapshot;
    }

    // No cached scoring — build lightweight heuristics from raw submissions
    const subs = v4.submissions as Record<string, any> | undefined;
    if (!subs) return {};

    const snapshot: SignalSnapshot = {};

    // P0 heuristics
    if (subs.phase0) {
      const p0 = subs.phase0 as Record<string, any>;
      if (p0.predictions) {
        const preds = p0.predictions as Array<Record<string, any>>;
        const correctCount = preds.filter(p => {
          const guess = Number(p.confidence ?? p.answer ?? 50);
          const expected = p.expected?.toLowerCase?.() === 'yes' ? 80 : 20;
          return Math.abs(guess - expected) < 30;
        }).length;
        snapshot.sAiCalibration = Math.min(1, correctCount / Math.max(1, preds.length));
      }
    }

    // MA heuristics
    if (subs.moduleA) {
      const ma = subs.moduleA as Record<string, any>;
      if (ma.round1?.choice) snapshot.sSchemeJudgment = 0.5; // Placeholder — can't evaluate without ground truth
      if (ma.round2?.markedDefects) {
        const defects = ma.round2.markedDefects as any[];
        snapshot.sDefectDetection = Math.min(1, defects.length / 4);
      }
    }

    // MB1 heuristics
    if (subs.mb1?.rounds) {
      const rounds = subs.mb1.rounds as any[];
      if (rounds.length > 0) {
        snapshot.sChallengeComplete = rounds.some((r: any) => r.testResult?.passRate >= 0.8) ? 0.8 : 0.3;
        snapshot.sPromptQuality = Math.min(1, rounds.filter((r: any) => (r.prompt?.length ?? 0) > 50).length / Math.max(1, rounds.length));
      }
    }

    // MB2 heuristics
    if (subs.mb2?.rulesContent) {
      const rules = String(subs.mb2.rulesContent);
      snapshot.sRulesQuality = rules.length > 200 ? 0.5 : 0.2;
    }

    return snapshot;
  } catch (err) {
    logger.warn('[mc-probe] Failed to build signal snapshot:', err);
    return {};
  }
}
