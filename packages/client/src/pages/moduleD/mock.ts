/**
 * ModuleD Task 8 mock fixture.
 *
 * Canonical shape: `MDModuleSpecific` (packages/shared/src/types/v5-exam-modules.ts)
 * — designTask + expectedSubModules (参考答案,不展示) + constraintCategories +
 * designChallenges. Consumed as-is; backend Task 14 returns this shape on
 * the v5:md:start ack (or REST equivalent) once shipped.
 *
 * `MDMockModule` strips `expectedSubModules` from the public shape because
 * it's the参考答案 used by sScopeAwareness scoring — never sent to the
 * candidate. Keeping the strip-point in this fixture mirrors the
 * groundTruth-safety pattern from MB's `violationExamples` shape.
 *
 * Scenario chosen to overlap with MA/MB so candidates carry domain context:
 *   - 主题:订单服务架构(承接 MA 库存预扣 + MB 订单过滤的上下文)
 *   - 约束类别:7 类(性能/一致性/可用性/成本/演进/合规/可观测)
 *   - 设计挑战:2 个(单库瓶颈 / 全链路一致性)
 */

import type { MDDesignChallenge } from '@codelens-v5/shared';

export interface MDMockModule {
  designTask: {
    description: string;
    businessContext: string;
    nonFunctionalRequirements: string[];
  };
  /** 5-7 类约束,候选人多选。 */
  constraintCategories: string[];
  /** 2-3 个条件触发(候选人答到某种程度后,系统抛挑战题加深)。 */
  designChallenges: MDDesignChallenge[];
}

export const MD_MOCK_FIXTURE: MDMockModule = {
  designTask: {
    description:
      '设计一个订单服务的整体架构。需要支撑下单、查询、退款、对账四个主流程,并与库存、支付、风控三个外部域协作。请按"模块拆解 → 接口契约 → 数据流 → 关键约束 → 取舍 → AI 编排策略"的顺序作答。',
    businessContext:
      '电商主站的订单子域。日单量 200 万,大促峰值 5 万 QPS,平均订单金额 ¥120,订单状态机 7 态。下单链路要求 p99 < 800ms,对账链路 T+1 容忍。团队 8 人,半数对消息中间件不熟悉。',
    nonFunctionalRequirements: [
      '下单链路 p99 < 800ms,可用性 ≥ 99.95%',
      '对账链路 T+1 容忍,但当日数据不能丢',
      '不允许双写订单库与下游系统的强一致写(成本 / 锁竞争)',
      '所有外部 IO 必须有降级路径,失败要可观测',
      '团队半数成员对 Kafka / RocketMQ 不熟悉,选型要可教',
    ],
  },
  constraintCategories: [
    '性能(吞吐 / 延迟)',
    '一致性(强 / 最终)',
    '可用性(SLO / 容灾)',
    '成本(基础设施 / 人力)',
    '演进性(可重构 / 可灰度)',
    '合规(数据驻留 / 审计)',
    '可观测(指标 / 日志 / 追踪)',
  ],
  designChallenges: [
    {
      trigger: '候选人选择"双写订单 + 库存"作为强一致策略',
      challenge:
        '当前模式下 5 万 QPS 大促 + 库存系统 8000 QPS 上限,会造成订单链路被库存阻塞。如何在不放弃订单可观测性的前提下解耦?',
    },
    {
      trigger: '候选人未提及 AI 在异常订单识别上的角色',
      challenge:
        '风控团队希望在下单链路里嵌入 AI 异常检测,但延迟预算只剩 80ms。你会让 AI 同步阻塞下单还是异步告警?如果异步,如何保证不漏判?',
    },
  ],
};
