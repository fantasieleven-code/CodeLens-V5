import {
  SUITES,
  V5Dimension,
  type CapabilityProfile,
  type GradeDecision,
} from '@codelens-v5/shared';

import type { ReportViewModel } from '../types.js';
import { MOCK_SIGNAL_DEFS, buildMockSignalResults } from './mock-signals.js';

/**
 * Fixture 1:S+ architect (composite 96, confidence high, at gradeCap)。
 * 对应 scoring.service.test.ts「S+ candidate well above threshold」测例。
 * 4 画像全部"自主",Architect 无 MB/cursor-behavior-label。
 */

const dims = {
  [V5Dimension.TECHNICAL_JUDGMENT]: 95,
  [V5Dimension.AI_ENGINEERING]: 85,
  [V5Dimension.SYSTEM_DESIGN]: 95,
  [V5Dimension.CODE_QUALITY]: 90,
  [V5Dimension.COMMUNICATION]: 90,
  [V5Dimension.METACOGNITION]: 88,
};

const gradeDecision: GradeDecision = {
  grade: 'S+',
  composite: 96,
  dimensions: dims,
  confidence: 'high',
  boundaryAnalysis: {
    nearestUpperGrade: null,
    distanceToUpper: null,
    blockingFactor: null,
    nearestLowerGrade: 'S',
    distanceToLower: 6,
  },
  reasoning:
    'composite 96.0 稳定落在 S+ 区间,距下一级 S 有 6.0 分余量,所有维度 floor 均以 >= 5 分余量通过。',
};

const capabilityProfiles: CapabilityProfile[] = [
  {
    id: 'independent_delivery',
    nameZh: '独立交付能力',
    nameEn: 'Independent Delivery',
    score: 90.8,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 38,
      [V5Dimension.CODE_QUALITY]: 31.5,
      [V5Dimension.AI_ENGINEERING]: 21.25,
    },
    evidenceSignals: ['sSchemeJudgment', 'sDiagnosisAccuracy', 'sModifyQuality', 'sCodeReviewQuality'],
    description: '候选人能独立拿到需求、拆解、实现、验证,不需要被 handhold',
  },
  {
    id: 'ai_collaboration',
    nameZh: 'AI 协作成熟度',
    nameEn: 'AI Collaboration Maturity',
    score: 86.5,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.AI_ENGINEERING]: 59.5,
      [V5Dimension.CODE_QUALITY]: 27,
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
    score: 93,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.SYSTEM_DESIGN]: 47.5,
      [V5Dimension.TECHNICAL_JUDGMENT]: 28.5,
      [V5Dimension.AI_ENGINEERING]: 17,
    },
    evidenceSignals: ['sDesignDecomposition', 'sPrincipleAbstraction', 'sReasoningDepth', 'sTradeoffArticulation'],
    description: '候选人能从业务场景推导技术架构,识别权衡,迁移场景仍能应用原则',
  },
  {
    id: 'learning_agility',
    nameZh: '学习敏捷',
    nameEn: 'Learning Agility',
    score: 90,
    label: '自主',
    dimensionBreakdown: {
      [V5Dimension.METACOGNITION]: 44,
      [V5Dimension.COMMUNICATION]: 27,
      [V5Dimension.TECHNICAL_JUDGMENT]: 19,
    },
    evidenceSignals: ['sBeliefUpdateMagnitude', 'sReflectionDepth', 'sMetaCognition', 'sArgumentResilience'],
    description: '候选人能面对质疑合理更新立场,有强元认知,学习曲线陡',
  },
];

const signalResults = buildMockSignalResults({
  sBaselineReading: 92,
  sAiClaimDetection: 90,
  sSchemeJudgment: 93,
  sArgumentResilience: 90,
  sPrincipleAbstraction: 92,
  sDiagnosisAccuracy: 94,
  // architect 无 MB,aiEngineering 仍有少量参与(P0 / MD 的隐性贡献由维度均值带动)
  sAiCompletionAcceptRate: null,
  sChatVsDirectRatio: null,
  sDecisionLatencyQuality: null,
  sTestFirstBehavior: null,
  sPromptQuality: null,
  sCodeReviewQuality: 91,
  sHiddenBugFound: 88,
  sModifyQuality: null,
  sEditPatternQuality: null,
  sDesignDecomposition: 96,
  sTradeoffArticulation: 94,
  sAiOrchestrationQuality: 92,
  sBoundaryAwareness: 91,
  sCommunicationClarity: 90,
  sReflectionDepth: 89,
  sBeliefUpdateMagnitude: 88,
  sAiCalibration: 90,
});

export const sPlusArchitectFixture: ReportViewModel = {
  sessionId: 'fixture-s-plus-architect',
  candidateName: '示例候选人 · S+ 架构师',
  completedAt: 1_713_398_400_000,
  suite: SUITES.architect,
  participatingModules: SUITES.architect.modules,
  gradeDecision,
  capabilityProfiles,
  dimensions: dims,
  signalResults,
  signalDefinitions: MOCK_SIGNAL_DEFS,
  submissions: {
    moduleA: {
      round1: {
        schemeId: 'B',
        reasoning: '选择方案 B,基于方案 A 锁粒度过粗和方案 C 实现复杂度过高的权衡。',
        structuredForm: {
          scenario: '高并发场景下的订单扣减,1000 QPS。',
          tradeoff: '锁粒度 vs 实现复杂度:B 在 200ms 内完成扣减,且实现成本可控。',
          decision: '采用 Redis SETNX + 补偿事务。',
          verification: '通过压测验证 P99 < 50ms。',
        },
        challengeResponse:
          '如果锁超时,fallback 到悲观事务;30% 失败率时由异步补偿恢复,数据最终一致。',
      },
      round2: {
        markedDefects: [
          { defectId: 'd-01', commentType: 'bug', comment: 'SETNX 后 TTL 设置不是原子的。', fixSuggestion: '使用 SET NX EX 合并。' },
          { defectId: 'd-02', commentType: 'suggestion', comment: '异常分支未清理 lock。' },
        ],
      },
      round3: {
        correctVersionChoice: 'failed',
        diffAnalysis: '失败版本缺少补偿事务的幂等键,重试会双扣。',
        diagnosisText: 'rootCause 在 L142 补偿函数未校验 requestId。',
      },
    },
    moduleD: {
      subModules: [
        { name: 'OrderIngress', responsibility: '接入订单请求,限流 + 幂等。' },
        { name: 'StockLock', responsibility: '扣减锁管理。' },
        { name: 'Reconciler', responsibility: '异步补偿最终一致。' },
      ],
      interfaceDefinitions: ['POST /order', 'POST /stock/lock', 'GET /stock/status'],
      dataFlowDescription: '订单 → Ingress 限流 → StockLock 加锁 → 写入主库 → Reconciler 订阅补偿。',
      constraintsSelected: ['最终一致', 'P99 < 200ms', '单点故障可恢复'],
      tradeoffText: '一致性 vs 延迟:选择最终一致 + 异步补偿,避免同步跨服务事务。',
      aiOrchestrationPrompts: ['Prompt 1:Ingress 限流...', 'Prompt 2:StockLock 伪代码...'],
    },
    selfAssess: {
      confidence: 85,
      reasoning: '方案选型和设计拆分都有量化依据,元认知自评略保守。',
      reviewedDecisions: ['MA R1 schemeId=B', 'MD subModules=3'],
    },
    moduleC: [
      { round: 1, question: '你提到 P99 50ms,这个数字如何得到?', answer: '压测环境 1000 QPS 持续 10 分钟,P99 稳定在 48-52ms。', probeStrategy: 'baseline' },
      { round: 2, question: '如果换到 10000 QPS,方案 B 还成立吗?', answer: '需要切换到分片锁;原则不变但参数调整:锁粒度从全局降到 productId。', probeStrategy: 'transfer' },
    ],
  },
};
