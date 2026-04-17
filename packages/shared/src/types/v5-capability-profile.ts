import { V5Dimension } from './v5-dimensions.js';

/**
 * Round 3 重构 4(Capability Profiles)——能力画像。
 *
 * 在 6 维度和 grade 之间加一层"画像",把内部维度聚合成 HR 能直接读懂的 4 个能力向:
 *   independent_delivery / ai_collaboration / system_thinking / learning_agility
 *
 * 每个画像是 2-3 个维度的加权聚合,权重总和 1.0;score 0-100,label 四档(自主/熟练/有潜力/待发展)。
 * 画像的 evidenceSignalIds 用于前端展开详情时显示支撑信号(依赖重构 1)。
 */

export type CapabilityProfileId =
  | 'independent_delivery'
  | 'ai_collaboration'
  | 'system_thinking'
  | 'learning_agility';

export type CapabilityLabel = '自主' | '熟练' | '有潜力' | '待发展';

export interface CapabilityProfile {
  id: CapabilityProfileId;
  nameZh: string;
  nameEn: string;
  /** 0-100 的聚合分数(保留 1 位小数)。 */
  score: number;
  label: CapabilityLabel;
  /** 依据的维度 → 对该画像分数的加权贡献(weight × dim score)。 */
  dimensionBreakdown: Partial<Record<V5Dimension, number>>;
  /** 最能说明该画像的 3-5 个信号 id,前端展开时查询其 SignalResult.evidence。 */
  evidenceSignals: string[];
  /** 人类可读描述,1-2 句。 */
  description: string;
}

export interface CapabilityProfileDefinition {
  nameZh: string;
  nameEn: string;
  /** 维度 → 权重,未列出的维度贡献 0;权重之和应接近 1.0。 */
  dimensions: Partial<Record<V5Dimension, number>>;
  evidenceSignalIds: string[];
  descriptionTemplate: (label: CapabilityLabel) => string;
}

export const CAPABILITY_PROFILE_DEFINITIONS: Record<
  CapabilityProfileId,
  CapabilityProfileDefinition
> = {
  independent_delivery: {
    nameZh: '独立交付能力',
    nameEn: 'Independent Delivery',
    dimensions: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.4,
      [V5Dimension.CODE_QUALITY]: 0.35,
      [V5Dimension.AI_ENGINEERING]: 0.25,
    },
    evidenceSignalIds: [
      'sSchemeJudgment',
      'sDiagnosisAccuracy',
      'sModifyQuality',
      'sCodeReviewQuality',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主':
          return '候选人能独立拿到需求、拆解、实现、验证,不需要被 handhold';
        case '熟练':
          return '候选人能完成大部分交付,偶尔需要方向指导';
        case '有潜力':
          return '候选人需要较多方向指导,但执行环节可靠';
        case '待发展':
          return '候选人当前独立交付能力不足,需要 mentor 同步跟进';
      }
    },
  },

  ai_collaboration: {
    nameZh: 'AI 协作成熟度',
    nameEn: 'AI Collaboration Maturity',
    dimensions: {
      [V5Dimension.AI_ENGINEERING]: 0.7,
      [V5Dimension.CODE_QUALITY]: 0.3,
    },
    evidenceSignalIds: [
      'sAiCompletionAcceptRate',
      'sDecisionLatencyQuality',
      'sPromptQuality',
      'sAiClaimDetection',
      'sChatVsDirectRatio',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主':
          return '候选人展现成熟的 AI 协作模式:审查 AI 输出,合理接受率,测试驱动,能识别 AI 胡说八道';
        case '熟练':
          return '候选人能高效使用 AI,大部分情况审查到位,偶有懒惰接受';
        case '有潜力':
          return '候选人使用 AI 有一定模式但缺少审查深度,需要培训';
        case '待发展':
          return '候选人的 AI 协作模式偏极端(全接受或全拒绝),这是 AI 时代的警示信号';
      }
    },
  },

  system_thinking: {
    nameZh: '系统思维',
    nameEn: 'System Thinking',
    dimensions: {
      [V5Dimension.SYSTEM_DESIGN]: 0.5,
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.3,
      [V5Dimension.AI_ENGINEERING]: 0.2,
    },
    evidenceSignalIds: [
      'sDesignDecomposition',
      'sPrincipleAbstraction',
      'sReasoningDepth',
      'sTradeoffArticulation',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主':
          return '候选人能从业务场景推导技术架构,识别权衡,迁移场景仍能应用原则';
        case '熟练':
          return '候选人有系统视角,单场景下表现稳定,跨场景迁移略弱';
        case '有潜力':
          return '候选人当前更侧重实现,系统思维有基础但未成熟';
        case '待发展':
          return '候选人当前系统思维较弱,适合在明确框架下执行';
      }
    },
  },

  learning_agility: {
    nameZh: '学习敏捷',
    nameEn: 'Learning Agility',
    dimensions: {
      [V5Dimension.METACOGNITION]: 0.5,
      [V5Dimension.COMMUNICATION]: 0.3,
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.2,
    },
    evidenceSignalIds: [
      'sBeliefUpdateMagnitude',
      'sReflectionDepth',
      'sMetaCognition',
      'sArgumentResilience',
    ],
    descriptionTemplate: (label) => {
      switch (label) {
        case '自主':
          return '候选人能面对质疑合理更新立场,有强元认知,学习曲线陡';
        case '熟练':
          return '候选人对自己的能力和局限有清晰认知,学习动机强';
        case '有潜力':
          return '候选人有一定自省能力,但受挑战时调整较慢';
        case '待发展':
          return '候选人当前自我认知偏差较大,需要反馈机制辅助';
      }
    },
  },
};

export const CAPABILITY_PROFILE_IDS: readonly CapabilityProfileId[] = [
  'independent_delivery',
  'ai_collaboration',
  'system_thinking',
  'learning_agility',
] as const;

/** Score → Label 阈值(与 Round 3 文档完全一致)。 */
export const CAPABILITY_LABEL_THRESHOLDS = {
  AUTONOMOUS: 80, // '自主'
  PROFICIENT: 65, // '熟练'
  EMERGING: 50, // '有潜力'
} as const;

export function scoreToCapabilityLabel(score: number): CapabilityLabel {
  if (score >= CAPABILITY_LABEL_THRESHOLDS.AUTONOMOUS) return '自主';
  if (score >= CAPABILITY_LABEL_THRESHOLDS.PROFICIENT) return '熟练';
  if (score >= CAPABILITY_LABEL_THRESHOLDS.EMERGING) return '有潜力';
  return '待发展';
}
