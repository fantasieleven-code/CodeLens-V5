import {
  SUITES,
  V5Dimension,
  type CapabilityProfile,
  type GradeDecision,
} from '@codelens-v5/shared';

import type { CursorBehaviorLabel, ReportViewModel } from '../types.js';
import { MOCK_SIGNAL_DEFS, buildMockSignalResults } from './mock-signals.js';

/**
 * Fixture 3:B + dangerFlag (composite 55.95, TJ/CQ 错配 18 分)。
 * 对应 scoring.service.test.ts「B with danger flag」测例。
 * TJ=48 & CQ=66 触发 V4 DANGER_FLAG(阈值 TJ<=50 / CQ>=60 / gap>=15),
 * 4 画像全部"有潜力",cursorBehaviorLabel=快速粘贴型(AI 接受率偏高但质量偏低)。
 */

const dims = {
  [V5Dimension.TECHNICAL_JUDGMENT]: 48,
  [V5Dimension.AI_ENGINEERING]: 55,
  [V5Dimension.SYSTEM_DESIGN]: 50,
  [V5Dimension.CODE_QUALITY]: 66,
  [V5Dimension.COMMUNICATION]: 60,
  [V5Dimension.METACOGNITION]: 55,
};

const gradeDecision: GradeDecision = {
  grade: 'B',
  composite: 55.95,
  dimensions: dims,
  confidence: 'high',
  boundaryAnalysis: {
    nearestUpperGrade: 'B+',
    distanceToUpper: 9.05,
    blockingFactor: 'composite < 65',
    nearestLowerGrade: 'C',
    distanceToLower: 10.95,
  },
  reasoning:
    'composite 55.95 稳定落入 B 区间,距上下阈值都 >= 9 分;但触发 V4 danger flag,建议复核技术判断深度。',
  dangerFlag: {
    message:
      '技术判断 48 与代码质量 66 存在 18 分断层(V4 风险阈值 >= 15),候选人表面整洁但决策能力不足,需人工深入验证。',
    evidenceSignals: ['sSchemeJudgment', 'sDiagnosisAccuracy', 'sCodeReviewQuality', 'sAiClaimDetection'],
  },
};

const capabilityProfiles: CapabilityProfile[] = [
  {
    id: 'independent_delivery',
    nameZh: '独立交付能力',
    nameEn: 'Independent Delivery',
    score: 56.05,
    label: '有潜力',
    dimensionBreakdown: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 19.2,
      [V5Dimension.CODE_QUALITY]: 23.1,
      [V5Dimension.AI_ENGINEERING]: 13.75,
    },
    evidenceSignals: ['sSchemeJudgment', 'sDiagnosisAccuracy', 'sModifyQuality', 'sCodeReviewQuality'],
    description: '候选人需要较多方向指导,但执行环节可靠',
  },
  {
    id: 'ai_collaboration',
    nameZh: 'AI 协作成熟度',
    nameEn: 'AI Collaboration Maturity',
    score: 58.3,
    label: '有潜力',
    dimensionBreakdown: {
      [V5Dimension.AI_ENGINEERING]: 38.5,
      [V5Dimension.CODE_QUALITY]: 19.8,
    },
    evidenceSignals: [
      'sAiCompletionAcceptRate',
      'sDecisionLatencyQuality',
      'sPromptQuality',
      'sAiClaimDetection',
      'sChatVsDirectRatio',
    ],
    description: '候选人使用 AI 有一定模式但缺少审查深度,需要培训',
  },
  {
    id: 'system_thinking',
    nameZh: '系统思维',
    nameEn: 'System Thinking',
    score: 50.4,
    label: '有潜力',
    dimensionBreakdown: {
      [V5Dimension.SYSTEM_DESIGN]: 25,
      [V5Dimension.TECHNICAL_JUDGMENT]: 14.4,
      [V5Dimension.AI_ENGINEERING]: 11,
    },
    evidenceSignals: ['sDesignDecomposition', 'sPrincipleAbstraction', 'sReasoningDepth', 'sTradeoffArticulation'],
    description: '候选人当前更侧重实现,系统思维有基础但未成熟',
  },
  {
    id: 'learning_agility',
    nameZh: '学习敏捷',
    nameEn: 'Learning Agility',
    score: 55.1,
    label: '有潜力',
    dimensionBreakdown: {
      [V5Dimension.METACOGNITION]: 27.5,
      [V5Dimension.COMMUNICATION]: 18,
      [V5Dimension.TECHNICAL_JUDGMENT]: 9.6,
    },
    evidenceSignals: ['sBeliefUpdateMagnitude', 'sReflectionDepth', 'sMetaCognition', 'sArgumentResilience'],
    description: '候选人有一定自省能力,但受挑战时调整较慢',
  },
];

const cursorBehaviorLabel: CursorBehaviorLabel = {
  label: '快速粘贴型',
  summary:
    'AI Completion 接受率 83% 偏高,决策延迟中位 1.1s 偏短,chat/direct 比 1:5.2;多处接受后未做 diff review,与 TJ 低分吻合。',
  evidenceSignals: ['sAiCompletionAcceptRate', 'sDecisionLatencyQuality', 'sChatVsDirectRatio'],
};

const signalResults = buildMockSignalResults({
  sBaselineReading: 58,
  sAiClaimDetection: 46,
  sSchemeJudgment: 48,
  sArgumentResilience: 52,
  sPrincipleAbstraction: 50,
  sDiagnosisAccuracy: 45,
  sAiCompletionAcceptRate: 55,
  sChatVsDirectRatio: 52,
  sDecisionLatencyQuality: 48,
  sTestFirstBehavior: 54,
  sPromptQuality: 58,
  sCodeReviewQuality: 68,
  sHiddenBugFound: 62,
  sModifyQuality: 66,
  sEditPatternQuality: 64,
  sDesignDecomposition: null,
  sTradeoffArticulation: null,
  sAiOrchestrationQuality: null,
  sBoundaryAwareness: 60,
  sCommunicationClarity: 62,
  sReflectionDepth: 55,
  sBeliefUpdateMagnitude: 50,
  sAiCalibration: 54,
});

export const bFullStackDangerFixture: ReportViewModel = {
  sessionId: 'fixture-b-fullstack-danger',
  candidateName: '示例候选人 · B dangerFlag',
  completedAt: 1_713_405_600_000,
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
        schemeId: 'C',
        reasoning: '方案 C 看起来更新,觉得性能好。',
        structuredForm: {
          scenario: '订单退款场景,并发中等。',
          tradeoff: '没仔细分析,选 C 的理由主要是直觉。',
          decision: '先用 C 跑起来再说。',
          verification: '上线后看监控。',
        },
        challengeResponse: '如果不行就回退到 A,但 C 应该没问题。',
      },
      round2: {
        markedDefects: [
          { defectId: 'd-01', commentType: 'nit', comment: '变量命名可以统一。' },
        ],
      },
      round3: {
        correctVersionChoice: 'failed',
        diffAnalysis: '看着长度差不多,应该是 failed 版本。',
        diagnosisText: '不太确定 rootCause,可能是时序问题。',
      },
      round4: {
        response:
          '新场景应该也选 C 吧,理由差不多。具体参数我没想清楚,先按老办法来。',
        submittedAt: 1_713_401_900_000,
        timeSpentSec: 90,
      },
    },
    mb: {
      planning: {
        decomposition: '先改一下,跑起来看效果。',
        dependencies: '暂无。',
        fallbackStrategy: '回滚。',
      },
      editorBehavior: {
        aiCompletionEvents: [
          { timestamp: 1_713_403_000_000, accepted: true, lineNumber: 22, completionLength: 42 },
          { timestamp: 1_713_403_020_000, accepted: true, lineNumber: 34, completionLength: 36 },
          { timestamp: 1_713_403_050_000, accepted: true, lineNumber: 46, completionLength: 28 },
          { timestamp: 1_713_403_080_000, accepted: true, lineNumber: 62, completionLength: 51 },
        ],
        chatEvents: [
          {
            timestamp: 1_713_403_300_000,
            prompt: '这样写对吗?',
            responseLength: 120,
            duration: 1_600,
          },
        ],
        diffEvents: [
          { timestamp: 1_713_403_600_000, accepted: true, linesAdded: 32, linesRemoved: 8 },
        ],
        fileNavigationHistory: [
          { timestamp: 1_713_403_000_000, filePath: 'src/refund/handler.ts', action: 'open', duration: 60_000 },
        ],
        editSessions: [
          {
            filePath: 'src/refund/handler.ts',
            startTime: 1_713_403_000_000,
            endTime: 1_713_403_060_000,
            keystrokeCount: 88,
          },
        ],
        testRuns: [
          { timestamp: 1_713_403_700_000, passRate: 0.62, duration: 38_000 },
        ],
      },
      finalFiles: [
        { path: 'src/refund/handler.ts', content: '// 见仓库,内容省略' },
      ],
      finalTestPassRate: 0.62,
    },
    selfAssess: {
      confidence: 72,
      reasoning: '大部分细节觉得 OK。',
      reviewedDecisions: ['MA R1 schemeId=C'],
    },
    moduleC: [
      {
        round: 1,
        question: '你怎么判断 C 更合适?',
        answer: '直觉,看起来像新架构。',
        probeStrategy: 'baseline',
      },
      {
        round: 2,
        question: '如果 C 在并发场景下退款重复呢?',
        answer: '可能要加锁?不太确定具体怎么做。',
        probeStrategy: 'weakness',
      },
    ],
  },
};
