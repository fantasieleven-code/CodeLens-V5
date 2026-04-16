import { V5Dimension, type V5Grade } from './v5-dimensions.js';
import type { V5ModuleKey } from '../constants/module-keys.js';

/**
 * 5 个套件定义。每个套件锁定 modules / weightProfile / gradeCap / dimensionFloors / reportSections。
 *
 * weightProfile: 维度权重，未参与的维度权重为 0，composite 计算时通过 N/A rescaling 分散。
 * gradeCap: 该套件能达到的最高等级上限（quick_screen cap 'A'，architect/deep_dive cap 'S+'）。
 * dimensionFloors: 每个等级对每个"参与维度"的最低门槛，未达标则降级。
 * reportSections: 报告需要渲染的 section（前端按此数据驱动 Layer1/Layer2）。
 */

export type SuiteId = 'full_stack' | 'architect' | 'ai_engineer' | 'quick_screen' | 'deep_dive';

export interface SuiteDefinition {
  id: SuiteId;
  nameZh: string;
  nameEn: string;
  /** 参与模块列表，按照 moduleOrder 顺序呈现给候选人。 */
  modules: readonly V5ModuleKey[];
  estimatedMinutes: number;
  gradeCap: V5Grade;
  /** 六维度权重，总和通常为 1.0，未参与维度为 0。 */
  weightProfile: Record<V5Dimension, number>;
  /** 每个目标等级下，每个维度的最低分（只对"参与维度"生效）。 */
  dimensionFloors: Partial<Record<V5Grade, Partial<Record<V5Dimension, number>>>>;
  /** 前端报告 section 渲染清单。 */
  reportSections: readonly string[];
}

export const SUITES: Readonly<Record<SuiteId, SuiteDefinition>> = {
  full_stack: {
    id: 'full_stack',
    nameZh: '全面评估',
    nameEn: 'Full Stack Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    estimatedMinutes: 60,
    gradeCap: 'S',
    weightProfile: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.25,
      [V5Dimension.AI_ENGINEERING]: 0.25,
      [V5Dimension.CODE_QUALITY]: 0.2,
      [V5Dimension.COMMUNICATION]: 0.15,
      [V5Dimension.METACOGNITION]: 0.1,
      // systemDesign 无 MD 参与，权重通过 N/A rescaling 分散。
      [V5Dimension.SYSTEM_DESIGN]: 0.05,
    },
    dimensionFloors: {
      S: {
        [V5Dimension.TECHNICAL_JUDGMENT]: 80,
        [V5Dimension.AI_ENGINEERING]: 80,
        [V5Dimension.CODE_QUALITY]: 75,
      },
      A: {
        [V5Dimension.TECHNICAL_JUDGMENT]: 70,
        [V5Dimension.AI_ENGINEERING]: 70,
        [V5Dimension.CODE_QUALITY]: 65,
      },
    },
    reportSections: [
      'hero',
      'radar',
      'recommendation',
      'ma-detail',
      'mb-detail',
      'mb-cursor-behavior',
      'mc-transcript',
      'dimensions',
      'signal-bars',
      'compliance',
    ],
  },

  architect: {
    id: 'architect',
    nameZh: '架构师评估',
    nameEn: 'Architect Assessment',
    modules: ['phase0', 'moduleA', 'moduleD', 'selfAssess', 'moduleC'],
    estimatedMinutes: 63,
    gradeCap: 'S+',
    weightProfile: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.25,
      [V5Dimension.SYSTEM_DESIGN]: 0.3,
      [V5Dimension.COMMUNICATION]: 0.2,
      [V5Dimension.CODE_QUALITY]: 0.1,
      [V5Dimension.METACOGNITION]: 0.1,
      [V5Dimension.AI_ENGINEERING]: 0.05,
    },
    dimensionFloors: {
      'S+': {
        [V5Dimension.TECHNICAL_JUDGMENT]: 85,
        [V5Dimension.SYSTEM_DESIGN]: 85,
        [V5Dimension.COMMUNICATION]: 80,
      },
      S: {
        [V5Dimension.TECHNICAL_JUDGMENT]: 78,
        [V5Dimension.SYSTEM_DESIGN]: 78,
        [V5Dimension.COMMUNICATION]: 72,
      },
    },
    reportSections: [
      'hero',
      'radar',
      'recommendation',
      'ma-detail',
      'md-hero',
      'mc-transcript',
      'dimensions',
      'signal-bars',
      'compliance',
    ],
  },

  ai_engineer: {
    id: 'ai_engineer',
    nameZh: 'AI 工程师评估',
    nameEn: 'AI Engineer Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'moduleC'],
    estimatedMinutes: 60,
    gradeCap: 'S',
    weightProfile: {
      // aiEngineering 权重翻倍为主评维度。
      [V5Dimension.AI_ENGINEERING]: 0.4,
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.2,
      [V5Dimension.CODE_QUALITY]: 0.15,
      [V5Dimension.COMMUNICATION]: 0.15,
      [V5Dimension.METACOGNITION]: 0.05,
      [V5Dimension.SYSTEM_DESIGN]: 0.05,
    },
    dimensionFloors: {
      S: {
        [V5Dimension.AI_ENGINEERING]: 85,
        [V5Dimension.TECHNICAL_JUDGMENT]: 75,
        [V5Dimension.CODE_QUALITY]: 70,
      },
      A: {
        [V5Dimension.AI_ENGINEERING]: 75,
        [V5Dimension.TECHNICAL_JUDGMENT]: 65,
        [V5Dimension.CODE_QUALITY]: 60,
      },
    },
    reportSections: [
      'hero',
      'radar',
      'recommendation',
      'ma-detail',
      'mb-detail',
      'mb-cursor-behavior',
      'mc-transcript',
      'dimensions',
      'signal-bars',
      'compliance',
    ],
  },

  quick_screen: {
    id: 'quick_screen',
    nameZh: '快速筛选',
    nameEn: 'Quick Screen',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess'],
    estimatedMinutes: 35,
    gradeCap: 'A',
    weightProfile: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.35,
      [V5Dimension.AI_ENGINEERING]: 0.3,
      [V5Dimension.CODE_QUALITY]: 0.2,
      [V5Dimension.METACOGNITION]: 0.15,
      [V5Dimension.COMMUNICATION]: 0,
      [V5Dimension.SYSTEM_DESIGN]: 0,
    },
    dimensionFloors: {
      A: {
        [V5Dimension.TECHNICAL_JUDGMENT]: 70,
        [V5Dimension.AI_ENGINEERING]: 65,
        [V5Dimension.CODE_QUALITY]: 60,
      },
      'B+': {
        [V5Dimension.TECHNICAL_JUDGMENT]: 60,
        [V5Dimension.AI_ENGINEERING]: 55,
        [V5Dimension.CODE_QUALITY]: 50,
      },
    },
    reportSections: [
      'hero',
      'radar',
      'recommendation',
      'ma-detail',
      'mb-detail',
      'dimensions',
      'signal-bars',
      'compliance',
    ],
  },

  deep_dive: {
    id: 'deep_dive',
    nameZh: '深度评估',
    nameEn: 'Deep Dive Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'moduleC'],
    estimatedMinutes: 85,
    gradeCap: 'S+',
    weightProfile: {
      [V5Dimension.TECHNICAL_JUDGMENT]: 0.2,
      [V5Dimension.AI_ENGINEERING]: 0.2,
      [V5Dimension.SYSTEM_DESIGN]: 0.2,
      [V5Dimension.CODE_QUALITY]: 0.15,
      [V5Dimension.COMMUNICATION]: 0.15,
      [V5Dimension.METACOGNITION]: 0.1,
    },
    dimensionFloors: {
      'S+': {
        [V5Dimension.TECHNICAL_JUDGMENT]: 85,
        [V5Dimension.AI_ENGINEERING]: 80,
        [V5Dimension.SYSTEM_DESIGN]: 85,
        [V5Dimension.COMMUNICATION]: 80,
      },
      S: {
        [V5Dimension.TECHNICAL_JUDGMENT]: 78,
        [V5Dimension.AI_ENGINEERING]: 75,
        [V5Dimension.SYSTEM_DESIGN]: 75,
        [V5Dimension.COMMUNICATION]: 72,
      },
    },
    reportSections: [
      'hero',
      'radar',
      'recommendation',
      'ma-detail',
      'mb-detail',
      'mb-cursor-behavior',
      'md-hero',
      'mc-transcript',
      'dimensions',
      'signal-bars',
      'compliance',
    ],
  },
} as const;

export const SUITE_IDS: readonly SuiteId[] = [
  'full_stack',
  'architect',
  'ai_engineer',
  'quick_screen',
  'deep_dive',
] as const;

export function isSuiteId(value: unknown): value is SuiteId {
  return typeof value === 'string' && value in SUITES;
}

export function getSuite(id: SuiteId): SuiteDefinition {
  return SUITES[id];
}
