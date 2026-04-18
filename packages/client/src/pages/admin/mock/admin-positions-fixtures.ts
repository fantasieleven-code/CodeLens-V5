import type { AdminPosition } from '../../../services/adminApi.types.js';

/**
 * Step 1 of the create wizard shows 6 pre-baked position cards. Each is a
 * techStack × domain × challengePattern combination. The candidate level is
 * chosen in Step 2 and the two together drive the Step 3 suite recommendation.
 */
export const ADMIN_POSITIONS: readonly AdminPosition[] = [
  {
    id: 'pos-backend-payment-concurrency',
    titleZh: '后端工程师 · 支付高并发',
    techStack: 'java_spring',
    domain: 'payment',
    challengePattern: 'concurrency',
    summary: '支付链路高并发、幂等性、分布式事务。',
  },
  {
    id: 'pos-backend-ecommerce-consistency',
    titleZh: '后端工程师 · 电商一致性',
    techStack: 'nodejs_nest',
    domain: 'ecommerce',
    challengePattern: 'consistency',
    summary: '电商库存/订单一致性、消息队列、重试策略。',
  },
  {
    id: 'pos-architect-logistics',
    titleZh: '架构师 · 物流调度',
    techStack: 'go_gin',
    domain: 'logistics',
    challengePattern: 'performance',
    archStyle: 'microservices',
    summary: '物流调度、路径规划、百万级 QPS 订单分发。',
  },
  {
    id: 'pos-ai-engineer-content',
    titleZh: 'AI 工程师 · 内容生成',
    techStack: 'python_fastapi',
    domain: 'content',
    challengePattern: 'precision',
    summary: 'Prompt 工程、RAG、结构化输出、幻觉治理。',
  },
  {
    id: 'pos-fullstack-saas-resilience',
    titleZh: '全栈工程师 · SaaS 稳定性',
    techStack: 'typescript_express',
    domain: 'saas',
    challengePattern: 'resilience',
    summary: '限流降级、熔断、多租户隔离。',
  },
  {
    id: 'pos-fintech-security',
    titleZh: '后端工程师 · 金融安全',
    techStack: 'python_django',
    domain: 'fintech',
    challengePattern: 'security',
    summary: '风控、加密、审计日志、合规。',
  },
];

export function findPositionById(id: string): AdminPosition | undefined {
  return ADMIN_POSITIONS.find((p) => p.id === id);
}
