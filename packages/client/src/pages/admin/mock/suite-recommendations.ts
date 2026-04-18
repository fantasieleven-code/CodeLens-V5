import type {
  AdminPosition,
  SuiteRecommendation,
} from '../../../services/adminApi.types.js';
import type { SuiteId, V5Level } from '@codelens-v5/shared';

/**
 * Suite recommendation rules per Steve's Task 10 scope:
 *
 * - junior + any tech stack: recommend quick_screen (35 min, gradeCap A).
 * - mid + backend/backend-heavy domain: recommend full_stack (60 min, cap S).
 * - senior + architecture heavy (archStyle set / logistics / microservices):
 *   recommend architect (63 min, cap S+).
 * - senior + AI-heavy (content / AI-related techStack): recommend ai_engineer
 *   (60 min, AI weight 0.4).
 * - senior + otherwise (full stack high bar): recommend deep_dive (85 min,
 *   cap S+).
 *
 * All alternates are the remaining suites minus the primary, so the recruiter
 * can override without losing options.
 */

const ALL_SUITES: readonly SuiteId[] = [
  'full_stack',
  'architect',
  'ai_engineer',
  'quick_screen',
  'deep_dive',
];

const AI_TECH_STACKS = new Set(['python_fastapi', 'python_django']);
const AI_DOMAINS = new Set(['content']);
const ARCH_DOMAINS = new Set(['logistics', 'ecommerce']);

function alternatesFor(primary: SuiteId): readonly SuiteId[] {
  return ALL_SUITES.filter((s) => s !== primary);
}

export function recommendSuite(
  position: AdminPosition,
  level: V5Level,
): SuiteRecommendation {
  if (level === 'junior') {
    return {
      primary: 'quick_screen',
      alternates: alternatesFor('quick_screen'),
      reasoning: '初级候选人,推荐 35 分钟快速筛选(gradeCap A),聚焦 MA + MB 基础能力。',
    };
  }

  if (level === 'senior') {
    if (position.archStyle || ARCH_DOMAINS.has(position.domain)) {
      return {
        primary: 'architect',
        alternates: alternatesFor('architect'),
        reasoning: '架构向岗位(含 archStyle 或物流/电商领域),推荐 Architect 套件(MD 权重 0.3,cap S+)。',
      };
    }
    if (AI_TECH_STACKS.has(position.techStack) || AI_DOMAINS.has(position.domain)) {
      return {
        primary: 'ai_engineer',
        alternates: alternatesFor('ai_engineer'),
        reasoning: 'AI 工程向岗位,推荐 AI Engineer 套件(aiEngineering 权重 0.4,cap S)。',
      };
    }
    return {
      primary: 'deep_dive',
      alternates: alternatesFor('deep_dive'),
      reasoning: '高级全栈岗位,推荐 Deep Dive(85 分钟 全模块 cap S+)以获得最完整评估。',
    };
  }

  // mid
  return {
    primary: 'full_stack',
    alternates: alternatesFor('full_stack'),
    reasoning: '中级候选人,推荐 Full Stack(60 分钟 MA + MB + MC,cap S)覆盖主要维度。',
  };
}
