/**
 * Task 4 — P0 mock fixture.
 *
 * Shape tracks the canonical Backend spec:
 *   - P0ModuleSpecific (packages/shared/src/types/v5-exam-modules.ts:13)
 *   - aiClaimDetection block from Round 3 Part 3 adjustment 1
 *     (docs/v5-planning/v5-design-clarifications.md L121-137)
 *
 * This exists only because Backend Task 10 (exam generator) has not landed.
 * When it does, `useP0Mock` / this fixture get replaced by a real
 * ExamModule.moduleSpecific payload over the wire. The shape here MUST stay
 * in lock-step with that contract — the AI claim block is the most
 * schedule-sensitive part and is tagged below for tracking.
 */

import type { P0ModuleSpecific } from '@codelens-v5/shared';

/**
 * Extension matching Round 3 Part 3 adjustment 1 L121-137. Not yet in
 * `P0ModuleSpecific` because Backend Task 10 will add it alongside the
 * signal wiring. Consumers see the field through `P0MockModule` below.
 *
 * TODO(task-10): remove this local type once `aiClaimDetection` is added
 * to `@codelens-v5/shared`'s `P0ModuleSpecific`.
 */
export interface P0AiClaimDetection {
  /** AI-generated code the candidate must audit. 20-40 lines. */
  code: string;
  /** AI's natural-language explanation. Claims are deliberately misleading. */
  aiExplanation: string;
  /** Features the explanation claims the code has. Includes the deceptive one. */
  claimedFeatures: string[];
  /** Features the code actually has. Does NOT include the deceptive claim. */
  actualFeatures: string[];
  /** The one claim that does not match reality — used by sAiClaimDetection. */
  deceptivePoint: {
    claimedFeature: string;
    realityGap: string;
  };
}

/**
 * Shape delivered to <Phase0Page />. Mirrors what Backend Task 10 will emit
 * from the exam-generator step output + Round 3 Part 3 adjustment 1.
 */
export interface P0MockModule extends P0ModuleSpecific {
  aiClaimDetection: P0AiClaimDetection;
}

// ─────────────────────────────────────────────────────────────────────
// Fixture — one BusinessScenario worth of P0 content.
//
// Domain: a simplified order-processing service. The intentional AI
// deception in `aiClaimDetection` is "claims WATCH/MULTI for optimistic
// locking, but the code only SETs a lock key" — the canonical example
// used in Round 3 Part 3 adjustment 1 L147-149.
// ─────────────────────────────────────────────────────────────────────

const SYSTEM_CODE = `// order-service.ts
import Redis from 'ioredis';
import { Order, OrderStatus, InventoryRepo, PaymentGateway, NotificationBus } from './deps.js';

const redis = new Redis(process.env.REDIS_URL);
const LOCK_TTL_SECONDS = 30;
const MAX_RETRIES = 3;

export async function placeOrder(userId: string, sku: string, qty: number): Promise<Order> {
  const lockKey = \`order-lock:\${userId}:\${sku}\`;
  const lockToken = cryptoRandom();

  // Single SET NX to gate concurrent placements for the same (user, sku).
  const locked = await redis.set(lockKey, lockToken, 'EX', LOCK_TTL_SECONDS, 'NX');
  if (locked !== 'OK') {
    throw new Error('ORDER_IN_FLIGHT');
  }

  try {
    const inventory = await InventoryRepo.reserve(sku, qty);
    if (!inventory.ok) {
      throw new Error('OUT_OF_STOCK');
    }

    const order = await Order.create({
      userId,
      sku,
      qty,
      status: OrderStatus.Pending,
      totalCents: inventory.unitPriceCents * qty,
    });

    const payment = await PaymentGateway.charge({
      userId,
      orderId: order.id,
      amountCents: order.totalCents,
    });

    if (!payment.captured) {
      await InventoryRepo.release(sku, qty);
      await order.update({ status: OrderStatus.Failed });
      throw new Error('PAYMENT_DECLINED');
    }

    await order.update({ status: OrderStatus.Paid, paymentRef: payment.ref });
    await NotificationBus.emit('order.placed', { orderId: order.id, userId });
    return order;
  } finally {
    // Best-effort release.
    const current = await redis.get(lockKey);
    if (current === lockToken) {
      await redis.del(lockKey);
    }
  }
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
`;

// The two "AI wrote this" pairs for the AI output judgment block.
// Each pair: codeA is the stronger answer, codeB is subtly worse (or vice versa).
const AI_JUDGMENT_1_A = `// Idempotent order submission — v1
export async function submitOrderIdempotent(key: string, payload: OrderPayload) {
  const existing = await OrderLog.findByIdempotencyKey(key);
  if (existing) return existing.orderId;

  return await db.transaction(async (tx) => {
    const order = await Order.create(payload, { transaction: tx });
    await OrderLog.create({ idempotencyKey: key, orderId: order.id }, { transaction: tx });
    return order.id;
  });
}`;

const AI_JUDGMENT_1_B = `// Idempotent order submission — v2
export async function submitOrderIdempotent(key: string, payload: OrderPayload) {
  const cached = await redis.get(\`idem:\${key}\`);
  if (cached) return cached;

  const order = await Order.create(payload);
  await redis.set(\`idem:\${key}\`, order.id, 'EX', 86400);
  return order.id;
}`;

const AI_JUDGMENT_2_A = `// Retry strategy — v1
export async function chargeWithRetry(req: ChargeReq): Promise<ChargeResp> {
  for (let i = 0; i < 5; i++) {
    try {
      return await PaymentGateway.charge(req);
    } catch (e) {
      if (isNonRetriable(e)) throw e;
      await sleep(2 ** i * 100);
    }
  }
  throw new Error('CHARGE_EXHAUSTED');
}`;

const AI_JUDGMENT_2_B = `// Retry strategy — v2
export async function chargeWithRetry(req: ChargeReq): Promise<ChargeResp> {
  try {
    return await PaymentGateway.charge(req);
  } catch (e) {
    return await PaymentGateway.charge(req);
  }
}`;

// The AI claim detection code + explanation. The explanation *claims* the
// code uses Redis WATCH/MULTI for optimistic locking; the code only uses a
// single SET NX. That gap is the deceptivePoint.
const AI_CLAIM_CODE = `// Inventory deduction on order placement
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

export async function deductInventory(sku: string, qty: number): Promise<boolean> {
  const key = \`inv:\${sku}\`;

  // Reserve the slot — 30-second TTL so a crashed worker doesn't block the SKU forever.
  const ok = await redis.set(\`lock:\${key}\`, '1', 'EX', 30, 'NX');
  if (ok !== 'OK') return false;

  const current = Number(await redis.get(key) ?? 0);
  if (current < qty) {
    await redis.del(\`lock:\${key}\`);
    return false;
  }

  await redis.decrby(key, qty);
  await redis.del(\`lock:\${key}\`);
  return true;
}`;

const AI_CLAIM_EXPLANATION = `这段代码实现了库存扣减的并发安全逻辑。它使用了 Redis 的 WATCH/MULTI 乐观锁机制:先 WATCH 住 inventory key,然后在 MULTI 事务里读取并 DECRBY,如果中间有别的 worker 修改了 key,EXEC 会失败并重试。lock 的 TTL 设为 30 秒,保证了 worker 挂掉时不会永久阻塞 SKU。整体是生产级的实现。`;

export const P0_MOCK_FIXTURE: P0MockModule = {
  systemCode: SYSTEM_CODE,
  codeReadingQuestions: {
    l1: {
      question: '这段代码的核心职责是什么?',
      options: [
        '处理用户下单流程,包含库存锁定、支付、通知,失败时回滚预留',
        '实现分布式限流器,限制每个用户的下单频率',
        '异步消费订单消息队列,并写入订单 DB',
        '为订单服务提供只读的订单查询接口',
      ],
      correctIndex: 0,
    },
    l2: {
      question:
        '这段代码在"高并发下单"场景下,关键的设计决策是什么?请说明你看到的 1-2 个权衡(建议 100-300 字)。',
    },
    l3: {
      question:
        '如果要把这个 placeOrder 扩展到多实例 + 分布式 Redis(cluster),哪些地方需要改?至少说出 2 个具体位置和原因(建议 200-500 字)。',
    },
  },
  aiOutputJudgment: [
    {
      codeA: AI_JUDGMENT_1_A,
      codeB: AI_JUDGMENT_1_B,
      context:
        'AI 为"订单幂等提交"给出了两版实现。需求:同一 idempotency key 重复提交必须返回同一个 orderId;服务可能崩溃重启。哪个更合适?',
      groundTruth: 'A',
    },
    {
      codeA: AI_JUDGMENT_2_A,
      codeB: AI_JUDGMENT_2_B,
      context:
        'AI 为"支付接口重试"给出了两版实现。需求:对临时失败重试,对业务错误(例如余额不足)不重试。哪个更合适?',
      groundTruth: 'A',
    },
  ],
  decision: {
    scenario:
      '你负责的订单服务在大促当天凌晨出现 5% 的下单超时。监控显示:Redis 延迟正常,DB CPU 70%,支付网关 P99 从 200ms 涨到 1.2s。产品希望大促期间不能再丢订单。你只有 30 分钟决策,要先做哪件事?',
    options: [
      {
        id: 'A',
        label: '紧急扩容 Payment 网关上游的应用实例',
        description: '先解决可见的瓶颈,应用层多开 pod 把 1.2s P99 的网关请求并发吸收掉。',
      },
      {
        id: 'B',
        label: '把支付步骤改成异步(先返回下单成功,后台 charge)',
        description: '消除 payment P99 对下单链路的阻塞,代价是"下单成功但支付失败"的补偿流程。',
      },
      {
        id: 'C',
        label: '先 rollback 到昨天的版本 + 联系支付网关方',
        description: '不假设是我方改动,先止血,把外部依赖的问题推回给供应商,同步排查我方是否有诱因。',
      },
    ],
  },
  aiClaimDetection: {
    code: AI_CLAIM_CODE,
    aiExplanation: AI_CLAIM_EXPLANATION,
    claimedFeatures: [
      'WATCH/MULTI 乐观锁',
      'SET NX EX 30 的预留锁',
      'DECRBY 扣减',
      '30 秒 TTL 防止 worker 挂住 key',
    ],
    actualFeatures: [
      'SET NX EX 30 的预留锁(单 key)',
      'GET 读库存',
      'DECRBY 扣减',
      '手动 del lock',
    ],
    deceptivePoint: {
      claimedFeature: 'WATCH/MULTI 乐观锁',
      realityGap: '代码里没有 WATCH 也没有 MULTI/EXEC,只是一个 SET NX 的互斥锁',
    },
  },
};
