import {
  SUITES,
  V5Dimension,
  type CapabilityProfile,
  type GradeDecision,
} from '@codelens-v5/shared';

import type { CursorBehaviorLabel, ReportViewModel } from '../types.js';
import { MOCK_SIGNAL_DEFS, buildMockSignalResults } from './mock-signals.js';

/**
 * Fixture 2:A full_stack boundary (composite 83.8, confidence low)。
 * 对应 scoring.service.test.ts「A candidate near S boundary」测例。
 * composite 距 S(85) 仅 1.2,blockingFactor 为 composite < 85;
 * 4 画像全部自主(都 >=80);cursorBehaviorLabel=熟练接受型。
 */

const dims = {
  [V5Dimension.TECHNICAL_JUDGMENT]: 84,
  [V5Dimension.AI_ENGINEERING]: 85,
  [V5Dimension.SYSTEM_DESIGN]: 82,
  [V5Dimension.CODE_QUALITY]: 82,
  [V5Dimension.COMMUNICATION]: 85,
  [V5Dimension.METACOGNITION]: 83,
};

const gradeDecision: GradeDecision = {
  grade: 'A',
  composite: 83.8,
  dimensions: dims,
  confidence: 'low',
  boundaryAnalysis: {
    nearestUpperGrade: 'S',
    distanceToUpper: 1.2,
    blockingFactor: 'composite < 85',
    nearestLowerGrade: 'B+',
    distanceToLower: 8.8,
  },
  reasoning:
    'composite 83.8 距 S 阈值仅差 1.2 分,被 composite < 85 阻挡,综合判断 A 更稳健;边界候选人建议人工复核。',
};

const capabilityProfiles: CapabilityProfile[] = [
  {
    id: 'independent_delivery',
    nameZh: '独立交付能力',
    nameEn: 'Independent Delivery',
    score: 83.6,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 33.6,
      [V5Dimension.CODE_QUALITY]: 28.7,
      [V5Dimension.AI_ENGINEERING]: 21.25,
    },
    evidenceSignals: ['sSchemeJudgment', 'sDiagnosisAccuracy', 'sModifyQuality', 'sCodeReviewQuality'],
    description: '候选人能独立拿到需求、拆解、实现、验证,不需要被 handhold',
  },
  {
    id: 'ai_collaboration',
    nameZh: 'AI 协作成熟度',
    nameEn: 'AI Collaboration Maturity',
    score: 84.1,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.AI_ENGINEERING]: 59.5,
      [V5Dimension.CODE_QUALITY]: 24.6,
    },
    evidenceSignals: [
      'sAiCompletionAcceptRate',
      'sDecisionLatencyQuality',
      'sPromptQuality',
      'sAiClaimDetection',
      'sChatVsDirectRatio',
    ],
    description: '候选人展现成熟的 AI 协作模式:审查 AI 输出,合理接受率,测试驱动,能识别 AI 胡说八道',
  },
  {
    id: 'system_thinking',
    nameZh: '系统思维',
    nameEn: 'System Thinking',
    score: 83.2,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.SYSTEM_DESIGN]: 41,
      [V5Dimension.TECHNICAL_JUDGMENT]: 25.2,
      [V5Dimension.AI_ENGINEERING]: 17,
    },
    evidenceSignals: ['sDesignDecomposition', 'sPrincipleAbstraction', 'sReasoningDepth', 'sTradeoffArticulation'],
    description: '候选人能从业务场景推导技术架构,识别权衡,迁移场景仍能应用原则',
  },
  {
    id: 'learning_agility',
    nameZh: '学习敏捷',
    nameEn: 'Learning Agility',
    score: 83.8,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.METACOGNITION]: 41.5,
      [V5Dimension.COMMUNICATION]: 25.5,
      [V5Dimension.TECHNICAL_JUDGMENT]: 16.8,
    },
    evidenceSignals: ['sBeliefUpdateMagnitude', 'sReflectionDepth', 'sMetaCognition', 'sArgumentResilience'],
    description: '候选人能面对质疑合理更新立场,有强元认知,学习曲线陡',
  },
];

const cursorBehaviorLabel: CursorBehaviorLabel = {
  label: '熟练接受型',
  summary:
    'AI Completion 接受率 68%,chat/direct 比 1:2.1,延迟决策中位 3.4s,偶有未审查就接受的情况。',
  evidenceSignals: ['sAiCompletionAcceptRate', 'sDecisionLatencyQuality', 'sChatVsDirectRatio'],
};

const signalResults = buildMockSignalResults({
  sBaselineReading: 84,
  sAiClaimDetection: 82,
  sSchemeJudgment: 83,
  sArgumentResilience: 84,
  sPrincipleAbstraction: 82,
  sDiagnosisAccuracy: 85,
  sAiCompletionAcceptRate: 84,
  sChatVsDirectRatio: 83,
  sDecisionLatencyQuality: 85,
  sTestFirstBehavior: 86,
  sPromptQuality: 87,
  sCodeReviewQuality: 82,
  sHiddenBugFound: 81,
  sModifyQuality: 82,
  sEditPatternQuality: 83,
  // full_stack 无 MD,SD 信号占位为 null
  sDesignDecomposition: null,
  sTradeoffArticulation: null,
  sAiOrchestrationQuality: null,
  sBoundaryAwareness: 85,
  sCommunicationClarity: 84,
  sReflectionDepth: 82,
  sBeliefUpdateMagnitude: 83,
  sAiCalibration: 84,
});

export const aFullStackBoundaryFixture: ReportViewModel = {
  sessionId: 'fixture-a-fullstack-boundary',
  candidateName: '示例候选人 · A 边界 full_stack',
  completedAt: 1_713_402_000_000,
  suite: SUITES.full_stack,
  participatingModules: SUITES.full_stack.modules,
  gradeDecision,
  capabilityProfiles,
  dimensions: dims,
  signalResults,
  signalDefinitions: MOCK_SIGNAL_DEFS,
  cursorBehaviorLabel,
  submissions: {
    moduleA: {
      round1: {
        schemeId: 'A',
        reasoning: '选择方案 A:团队经验充分,时间有限。',
        structuredForm: {
          scenario: 'OAuth 回调失败率 2%,需要补偿与告警。',
          tradeoff: '补偿策略 vs 实现成本:A 的队列补偿在 2 周内可上线,B 需要引入事件总线。',
          decision: '短期 A + 监控告警,长期评估 B。',
          verification: 'P95 回调成功率 >= 99%。',
        },
        challengeResponse: '监控告警覆盖了漏补偿的场景,最终一致时间 < 5 分钟。',
      },
      round2: {
        markedDefects: [
          { defectId: 'd-01', commentType: 'bug', comment: '重试逻辑未设上限。', fixSuggestion: '加入 retry ceiling = 5。' },
          { defectId: 'd-02', commentType: 'suggestion', comment: '日志粒度粗,难以排障。' },
          { defectId: 'd-03', commentType: 'nit', comment: '变量命名 tmp 过于随意。' },
        ],
      },
      round3: {
        correctVersionChoice: 'success',
        diffAnalysis: '成功版本加入了 retry ceiling,和幂等 key 校验一致。',
        diagnosisText: '失败版本在 L87 未校验 requestId,重试会重复扣款。',
      },
      round4: {
        response:
          '迁移到"短信重发"场景同样成立,核心原则是"幂等 + 重试上限"。参数需要调整:短信网关有全局限流,retry ceiling 要降到 3,同时加入 backoff。',
        submittedAt: 1_713_401_900_000,
        timeSpentSec: 240,
      },
    },
    mb: {
      planning: {
        decomposition: '先补回调幂等 → 再加重试上限 → 最后补告警。',
        dependencies: 'Redis 幂等键、监控平台 API。',
        fallbackStrategy: '回调失败写入死信队列,运维手动恢复。',
      },
      editorBehavior: {
        aiCompletionEvents: [
          { timestamp: 1_713_400_000_000, accepted: true, lineNumber: 42, completionLength: 18 },
          { timestamp: 1_713_400_120_000, accepted: false, lineNumber: 58, completionLength: 35 },
        ],
        chatEvents: [
          {
            timestamp: 1_713_400_300_000,
            prompt: 'OAuth 回调幂等如何设计?',
            responseLength: 420,
            duration: 5400,
          },
        ],
        diffEvents: [
          { timestamp: 1_713_400_600_000, accepted: true, linesAdded: 12, linesRemoved: 4 },
        ],
        fileNavigationHistory: [
          { timestamp: 1_713_400_000_000, filePath: 'src/oauth/callback.ts', action: 'open', duration: 180_000 },
        ],
        editSessions: [
          {
            filePath: 'src/oauth/callback.ts',
            startTime: 1_713_400_000_000,
            endTime: 1_713_400_180_000,
            keystrokeCount: 342,
          },
        ],
        testRuns: [
          { timestamp: 1_713_400_700_000, passRate: 0.92, duration: 45_000 },
        ],
      },
      finalFiles: [
        { path: 'src/oauth/callback.ts', content: '// 见仓库,内容省略' },
      ],
      finalTestPassRate: 0.92,
    },
    selfAssess: {
      confidence: 78,
      reasoning: '主方向有把握,但告警细节没充分验证,给自己留出改进空间。',
      reviewedDecisions: ['MA R1 schemeId=A', 'MB 补偿幂等键'],
    },
    moduleC: [
      {
        round: 1,
        question: 'P95 99% 的数字是怎么得到的?',
        answer: '生产数据上月均值,补偿后回归到 99.1%。',
        probeStrategy: 'baseline',
      },
      {
        round: 2,
        question: '如果补偿本身也失败?',
        answer: '进死信队列触发 oncall,手动冲销;同时给出告警规则 MTTR 15 分钟。',
        probeStrategy: 'contradiction',
      },
    ],
  },
};
