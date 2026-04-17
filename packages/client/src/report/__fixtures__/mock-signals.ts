import { V5Dimension, type SignalResult } from '@codelens-v5/shared';
import type { SignalViewMeta } from '../types.js';

/**
 * Mock signal catalog — Task 2 期间的占位数据，Task 13 实现真实 47 信号前供 UI 渲染。
 * 每个信号一条 evidence 占位；`signal-bars` section 展开时显示这些 evidence。
 *
 * 命名和 moduleSource / dimension 分布参考 Round 2/3 文档里的信号设计，
 * 数量约 20 条(非 47，足以覆盖 signal-bars 的视觉 / 维度分布/模块分组测试)，
 * 等 Task 13 完成后由 Backend 的 SignalRegistry 替换。
 */

export const MOCK_SIGNAL_DEFS: readonly SignalViewMeta[] = [
  // technicalJudgment(P0 / MA)
  { id: 'sBaselineReading', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'P0', isLLMWhitelist: false },
  { id: 'sAiClaimDetection', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'P0', isLLMWhitelist: false },
  { id: 'sSchemeJudgment', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'MA', isLLMWhitelist: false },
  { id: 'sArgumentResilience', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'MA', isLLMWhitelist: false },
  { id: 'sPrincipleAbstraction', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'MA', isLLMWhitelist: false },
  { id: 'sDiagnosisAccuracy', dimension: V5Dimension.TECHNICAL_JUDGMENT, moduleSource: 'MA', isLLMWhitelist: false },

  // aiEngineering(MB Cursor)
  { id: 'sAiCompletionAcceptRate', dimension: V5Dimension.AI_ENGINEERING, moduleSource: 'MB', isLLMWhitelist: false },
  { id: 'sChatVsDirectRatio', dimension: V5Dimension.AI_ENGINEERING, moduleSource: 'MB', isLLMWhitelist: false },
  { id: 'sDecisionLatencyQuality', dimension: V5Dimension.AI_ENGINEERING, moduleSource: 'MB', isLLMWhitelist: false },
  { id: 'sTestFirstBehavior', dimension: V5Dimension.AI_ENGINEERING, moduleSource: 'MB', isLLMWhitelist: false },
  { id: 'sPromptQuality', dimension: V5Dimension.AI_ENGINEERING, moduleSource: 'MB', isLLMWhitelist: false },

  // codeQuality(MA / MB)
  { id: 'sCodeReviewQuality', dimension: V5Dimension.CODE_QUALITY, moduleSource: 'MA', isLLMWhitelist: false },
  { id: 'sHiddenBugFound', dimension: V5Dimension.CODE_QUALITY, moduleSource: 'MA', isLLMWhitelist: false },
  { id: 'sModifyQuality', dimension: V5Dimension.CODE_QUALITY, moduleSource: 'MB', isLLMWhitelist: false },
  { id: 'sEditPatternQuality', dimension: V5Dimension.CODE_QUALITY, moduleSource: 'MB', isLLMWhitelist: false },

  // systemDesign(MD LLM 白名单)
  { id: 'sDesignDecomposition', dimension: V5Dimension.SYSTEM_DESIGN, moduleSource: 'MD', isLLMWhitelist: true },
  { id: 'sTradeoffArticulation', dimension: V5Dimension.SYSTEM_DESIGN, moduleSource: 'MD', isLLMWhitelist: true },
  { id: 'sAiOrchestrationQuality', dimension: V5Dimension.SYSTEM_DESIGN, moduleSource: 'MD', isLLMWhitelist: true },

  // communication(MC)
  { id: 'sBoundaryAwareness', dimension: V5Dimension.COMMUNICATION, moduleSource: 'MC', isLLMWhitelist: false },
  { id: 'sCommunicationClarity', dimension: V5Dimension.COMMUNICATION, moduleSource: 'MC', isLLMWhitelist: false },

  // metacognition(MC / SE / P0)
  { id: 'sReflectionDepth', dimension: V5Dimension.METACOGNITION, moduleSource: 'MC', isLLMWhitelist: false },
  { id: 'sBeliefUpdateMagnitude', dimension: V5Dimension.METACOGNITION, moduleSource: 'MC', isLLMWhitelist: false },
  { id: 'sAiCalibration', dimension: V5Dimension.METACOGNITION, moduleSource: 'P0', isLLMWhitelist: false },
];

/** 构建单条 mock SignalResult。evidence 至少 3 条,保留 SignalDefinition.id 追溯。 */
export function buildMockSignalResult(
  id: string,
  value: number | null,
  opts?: { module?: string },
): SignalResult {
  const module = opts?.module ?? 'mock';
  return {
    value,
    evidence: value == null
      ? []
      : [
          {
            source: `submissions.${module}.mock`,
            excerpt: `[占位] 候选人在 ${module} 的关键回答片段,命中 ${id} 的第一条判定规则。`,
            contribution: 0.35,
            triggeredRule: 'mock_rule_primary',
          },
          {
            source: `submissions.${module}.mock`,
            excerpt: `[占位] ${id} 第二条触发证据,支撑最终分值。`,
            contribution: 0.2,
            triggeredRule: 'mock_rule_secondary',
          },
          {
            source: `submissions.${module}.mock`,
            excerpt: `[占位] 量化指标命中:数字 / 行号 / 函数名均符合 S 级签名。`,
            contribution: 0.15,
            triggeredRule: 'has_quantitative_marker',
          },
        ],
    computedAt: 0,
    algorithmVersion: `${id}@mock-v0`,
  };
}

/** 构建 SignalResults 全集,给定每个 signal id 的目标分数。 */
export function buildMockSignalResults(
  scores: Record<string, number | null>,
): Record<string, SignalResult> {
  const out: Record<string, SignalResult> = {};
  for (const def of MOCK_SIGNAL_DEFS) {
    const score = scores[def.id];
    const module = def.moduleSource.toLowerCase();
    out[def.id] = buildMockSignalResult(
      def.id,
      score === undefined ? null : score,
      { module },
    );
  }
  return out;
}
