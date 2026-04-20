/**
 * Task 13d MD + SE signal suite.
 *
 * Covers the 5 signals introduced in Task 13d:
 *   MD (4): sConstraintIdentification (pure rule)
 *           sDesignDecomposition / sTradeoffArticulation / sAiOrchestrationQuality (LLM whitelist + fallback)
 *   SE (1): sMetaCognition (pure rule)
 *
 * Archetype monotonicity mirrors v5-design-clarifications.md Part 5:
 *   Liam (S) > Steve (A) > Max (C) on each signal.
 *
 * For LLM signals we exercise the fallback directly (deterministic) in the
 * archetype block and the LLM compute path with a mocked ModelProvider in
 * dedicated tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(async (key: string) => `[TEMPLATE ${key}] submission={{subModules}} tradeoff={{tradeoffText}} prompts={{aiOrchestrationPrompts}}`),
  },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(),
  },
}));

import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type MDModuleSpecific,
  type SignalInput,
  type SignalRegistry,
  type V5ModuleDSubmission,
  type V5SelfAssessSubmission,
  type V5Submissions,
} from '@codelens-v5/shared';
import {
  sConstraintIdentification,
  CONSTRAINT_IDENTIFICATION_VERSION,
} from './s-constraint-identification.js';
import {
  sDesignDecomposition,
  DESIGN_DECOMPOSITION_LLM_VERSION,
  DESIGN_DECOMPOSITION_FALLBACK_VERSION,
} from './s-design-decomposition.js';
import {
  sTradeoffArticulation,
  TRADEOFF_ARTICULATION_LLM_VERSION,
  TRADEOFF_ARTICULATION_FALLBACK_VERSION,
} from './s-tradeoff-articulation.js';
import {
  sAiOrchestrationQuality,
  AI_ORCHESTRATION_QUALITY_LLM_VERSION,
  AI_ORCHESTRATION_QUALITY_FALLBACK_VERSION,
} from './s-ai-orchestration-quality.js';
import { sMetaCognition, META_COGNITION_VERSION } from '../se/s-meta-cognition.js';
import { extractJSON, parseLLMRubric, substituteVars } from './llm-helper.js';
import { modelFactory } from '../../services/model/index.js';
import { promptRegistry } from '../../services/prompt-registry.service.js';
import { registerAllSignals, EXPECTED_SIGNAL_COUNT } from '../index.js';

// ────────────────────────── fixtures ──────────────────────────

const MD_EXAM: MDModuleSpecific = {
  designTask: {
    description: '设计一个高并发订单扣库存服务',
    businessContext: '电商大促,峰值 10k QPS',
    nonFunctionalRequirements: ['低延迟', '一致性', '可扩展'],
  },
  expectedSubModules: [
    { name: 'OrderService', responsibility: '订单入口', interfaces: ['POST /order'] },
  ],
  constraintCategories: [
    '性能',
    '可用性',
    '一致性',
    '成本',
    '安全',
    '可维护性',
    '可扩展性',
  ],
  designChallenges: [
    { trigger: '峰值流量', challenge: '如何在 10k QPS 下保证不超卖' },
  ],
};

const LIAM_MD: V5ModuleDSubmission = {
  subModules: [
    {
      name: 'OrderController',
      responsibility:
        '订单入口;接受请求,做参数校验(skuId 40 字符上限),限流 5k QPS,转发给 OrderService。',
      interfaces: ['POST /orders', 'GET /orders/:id'],
    },
    {
      name: 'InventoryService',
      responsibility:
        '库存扣减;通过 Redis Lua 原子扣减,失败抛 OversoldError,成功后异步落 MySQL。',
      interfaces: ['reduce(skuId, qty)', 'compensate(orderId)'],
    },
    {
      name: 'OrderPersistence',
      responsibility: '订单写入 MySQL,使用唯一索引保证幂等,失败时触发补偿流程。',
      interfaces: ['create(order)', 'markPaid(orderId)'],
    },
    {
      name: 'Notifier',
      responsibility: '推送消息到 Kafka,下游订阅者做后续处理,包括库存补偿和账单生成。',
      interfaces: ['publish(event)'],
    },
    {
      name: 'Auditor',
      responsibility:
        '审计日志落 S3,保留 90 天,支持对账任务回溯,提供对账 API 给财务。',
      interfaces: ['log(event)', 'query(range)'],
    },
  ],
  interfaceDefinitions: [
    'POST /orders {skuId, qty} → 200 {orderId} / 409 Oversold',
    'reduce(skuId, qty) → Promise<{ok, remain}>',
  ],
  dataFlowDescription:
    'Client → OrderController → InventoryService.reduce (Redis Lua) → 成功 → OrderPersistence.create → Notifier.publish → Kafka 下游。失败路径触发 Compensator。',
  constraintsSelected: ['性能', '可用性', '一致性', '可扩展性', '可维护性'],
  tradeoffText:
    '方案 A: 纯 Redis Lua 扣库存,优点是 P99 <10ms,缺点是 Redis 挂掉时整条链路不可用。 方案 B: MySQL 乐观锁,优点是一致性强,缺点是高并发下锁冲突重,P99 升到 80ms。 方案 C: 两阶段, Redis 预扣 + MySQL 最终扣,优点综合 A 的性能和 B 的一致性,缺点复杂度高、对账任务必须。 最终推荐 C,因为性能和一致性都要保,10k QPS 下 B 撑不住,单靠 A 一致性无法保证。',
  aiOrchestrationPrompts: [
    '你是 InventoryService 的编码 agent。目标: 实现 reduce(skuId, qty)。约束: 必须原子,必须幂等,超时 300ms。输入: skuId string, qty number。输出: {ok:bool, remain:number}。步骤: 1) 查 Redis 库存 2) Lua 脚本原子扣减 3) 回写异步 MySQL。如果失败返回 OversoldError。',
    '你是 OrderPersistence 的编码 agent。目标: 写订单到 MySQL。约束: 唯一索引 (user_id, sku_id, request_id) 防重复。输入: Order 对象。输出: orderId。如果唯一索引冲突,返回现有 orderId(幂等)。',
    '你是 Compensator agent。目标: 处理 reduce 失败的补偿。约束: 必须最终一致,最多重试 3 次。输入: failedEvent。步骤: 1) 恢复 Redis 库存 2) 通知上游。如果 3 次失败,告警到 oncall。',
  ],
};

const STEVE_MD: V5ModuleDSubmission = {
  subModules: [
    { name: 'OrderService', responsibility: '处理订单请求,扣库存然后落库。', interfaces: ['POST /order'] },
    { name: 'InventoryService', responsibility: '扣库存,使用 Redis 做锁避免超卖。' },
    { name: 'NotifyService', responsibility: '发消息。' },
  ],
  interfaceDefinitions: ['POST /order {skuId, qty}'],
  dataFlowDescription: '请求进入 OrderService,扣库存成功后写 MySQL,最后发消息。',
  constraintsSelected: ['性能', '一致性', '可用性'],
  tradeoffText: '对比了 Redis 和 MySQL 方案,Redis 快但怕挂,MySQL 慢但稳。选 Redis + MySQL 组合。',
  aiOrchestrationPrompts: [
    '帮我实现 InventoryService,用 Redis 扣库存,要原子。',
    '帮我实现 OrderService 的写库逻辑。',
  ],
};

const MAX_MD: V5ModuleDSubmission = {
  subModules: [
    { name: 'Main', responsibility: '主要逻辑。' },
    { name: 'Util', responsibility: '工具。' },
  ],
  interfaceDefinitions: [],
  dataFlowDescription: '收到请求处理一下',
  constraintsSelected: ['性能', '别挂'],
  tradeoffText: '用 Redis 吧。',
  aiOrchestrationPrompts: ['写一下'],
};

const LIAM_SE: V5SelfAssessSubmission = {
  confidence: 0.7,
  reasoning:
    '我在 MB 选 Redis Lua 方案是因为它的 P99 最可控,10k QPS 场景下 MySQL 乐观锁会在 8% 的请求出现锁冲突。但我写 rules.md 时漏了一条关于 Lua 脚本的测试规范,回头要补。MD 方案 C 我的主要担心是对账任务的复杂度,中型团队两周能落地。',
  reviewedDecisions: [
    'MA round 1 选了 Redis Lua 方案',
    'MB standards 漏了 Lua 脚本测试规范',
    'MD tradeoff 选了混合方案 C',
    'P0 对 AI 的 WATCH/MULTI 虚假声明做了识别',
  ],
};

const STEVE_SE: V5SelfAssessSubmission = {
  confidence: 0.75,
  reasoning: '基本按计划走完了,MB 的测试覆盖率没达到目标,MD 还可以。',
  reviewedDecisions: ['选了 Redis 方案', '写了 rules'],
};

const MAX_SE: V5SelfAssessSubmission = {
  confidence: 0.95,
  reasoning: '都挺好。',
  reviewedDecisions: [],
};

function makeInput(md?: V5ModuleDSubmission, se?: V5SelfAssessSubmission): SignalInput {
  const submissions: V5Submissions = {};
  if (md) submissions.moduleD = md;
  if (se) submissions.selfAssess = se;
  const participating: string[] = [];
  if (md) participating.push('moduleD');
  if (se) participating.push('selfAssess');
  return {
    sessionId: 's-task13d',
    suiteId: 'architect',
    submissions,
    examData: { MD: MD_EXAM as unknown as Record<string, unknown> },
    participatingModules: participating,
  };
}

// ────────────────────────── sConstraintIdentification ──────────────────────────

describe('sConstraintIdentification (pure rule)', () => {
  it('returns null when moduleD absent', async () => {
    const r = await sConstraintIdentification.compute(makeInput());
    expect(r.value).toBeNull();
  });

  it('returns null when constraintsSelected empty', async () => {
    const r = await sConstraintIdentification.compute(
      makeInput({ ...LIAM_MD, constraintsSelected: [] }),
    );
    expect(r.value).toBeNull();
  });

  it('5+ categories matched → 1.0', async () => {
    const r = await sConstraintIdentification.compute(makeInput(LIAM_MD));
    expect(r.value).toBe(1.0);
  });

  it('3-4 categories matched → 0.7', async () => {
    const r = await sConstraintIdentification.compute(makeInput(STEVE_MD));
    expect(r.value).toBe(0.7);
  });

  it('<3 but ≥1 categories matched → 0.3', async () => {
    const r = await sConstraintIdentification.compute(makeInput(MAX_MD));
    expect(r.value).toBe(0.3);
  });

  it('falls back to raw count when exam taxonomy missing', async () => {
    const input: SignalInput = {
      ...makeInput(STEVE_MD),
      examData: {},
    };
    const r = await sConstraintIdentification.compute(input);
    expect(r.value).toBe(0.7); // 3 distinct raw selections
  });

  it('reports algorithmVersion sConstraintIdentification@v1', async () => {
    const r = await sConstraintIdentification.compute(makeInput(LIAM_MD));
    expect(r.algorithmVersion).toBe(CONSTRAINT_IDENTIFICATION_VERSION);
  });
});

// ────────────────────────── sMetaCognition ──────────────────────────

describe('sMetaCognition (pure rule)', () => {
  it('returns null when selfAssess absent', async () => {
    const r = await sMetaCognition.compute(makeInput(LIAM_MD));
    expect(r.value).toBeNull();
  });

  it('Liam > Steve > Max', async () => {
    const liam = (await sMetaCognition.compute(makeInput(undefined, LIAM_SE))).value ?? 0;
    const steve = (await sMetaCognition.compute(makeInput(undefined, STEVE_SE))).value ?? 0;
    const max = (await sMetaCognition.compute(makeInput(undefined, MAX_SE))).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
  });

  it('penalizes extreme overconfidence with shallow reasoning', async () => {
    const r = await sMetaCognition.compute(
      makeInput(undefined, { confidence: 1, reasoning: '', reviewedDecisions: [] }),
    );
    expect(r.value).toBeLessThan(0.1);
  });

  it('rewards substantive reasoning even with moderate confidence', async () => {
    const r = await sMetaCognition.compute(makeInput(undefined, LIAM_SE));
    expect(r.value).toBeGreaterThan(0.7);
  });

  it('reports algorithmVersion sMetaCognition@v1', async () => {
    const r = await sMetaCognition.compute(makeInput(undefined, LIAM_SE));
    expect(r.algorithmVersion).toBe(META_COGNITION_VERSION);
  });
});

// ────────────────────────── LLM helper utilities ──────────────────────────

describe('LLM helper — utilities', () => {
  it('substituteVars replaces {{key}} markers', () => {
    expect(substituteVars('Hello {{name}}, you are {{role}}', { name: 'Liam', role: 'senior' }))
      .toBe('Hello Liam, you are senior');
  });

  it('substituteVars leaves unknown keys empty', () => {
    expect(substituteVars('{{a}}-{{b}}', { a: 'x' })).toBe('x-');
  });

  it('extractJSON finds first balanced object inside prose', () => {
    expect(extractJSON('Sure! Here is the score: {"score": 0.8, "notes": "good"} done.'))
      .toBe('{"score": 0.8, "notes": "good"}');
  });

  it('extractJSON handles nested braces', () => {
    expect(extractJSON('```json\n{"score":0.5,"meta":{"k":"v"}}\n```'))
      .toBe('{"score":0.5,"meta":{"k":"v"}}');
  });

  it('extractJSON returns null when no object present', () => {
    expect(extractJSON('no json here at all')).toBeNull();
  });

  it('parseLLMRubric clamps to [0,1]', () => {
    expect(parseLLMRubric('{"score": 1.5}').score).toBe(1);
    expect(parseLLMRubric('{"score": -0.2}').score).toBe(0);
  });

  it('parseLLMRubric returns null for malformed JSON', () => {
    expect(parseLLMRubric('not json').score).toBeNull();
    expect(parseLLMRubric('{"score": "high"}').score).toBeNull();
  });

  it('parseLLMRubric surfaces rubric notes', () => {
    expect(parseLLMRubric('{"score": 0.7, "notes": "decent decomposition"}').notes)
      .toBe('decent decomposition');
  });
});

// ────────────────────────── LLM signals — compute path (mocked) ──────────────────────────

describe('sDesignDecomposition — LLM path (mocked provider)', () => {
  beforeEach(() => {
    vi.mocked(modelFactory.generate).mockReset();
    vi.mocked(promptRegistry.get).mockClear();
  });

  it('returns LLM-graded value when provider returns valid JSON', async () => {
    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: '{"score": 0.78, "notes": "5 modules with clear responsibility"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 123,
    });
    const r = await sDesignDecomposition.compute(makeInput(LIAM_MD));
    expect(r.value).toBe(0.78);
    expect(r.algorithmVersion).toBe(DESIGN_DECOMPOSITION_LLM_VERSION);
    expect(vi.mocked(modelFactory.generate)).toHaveBeenCalledWith(
      'scoring',
      expect.objectContaining({
        sessionId: 's-task13d',
        temperature: expect.any(Number),
      }),
    );
  });

  it('throws when LLM returns unparseable content (registry will retry/fallback)', async () => {
    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: 'totally broken not json',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 50,
    });
    await expect(sDesignDecomposition.compute(makeInput(LIAM_MD))).rejects.toThrow();
  });

  it('returns null when moduleD missing (no LLM call)', async () => {
    const r = await sDesignDecomposition.compute(makeInput());
    expect(r.value).toBeNull();
    expect(vi.mocked(modelFactory.generate)).not.toHaveBeenCalled();
  });

  it('fallback: Liam > Steve > Max', () => {
    const liam = sDesignDecomposition.fallback!(makeInput(LIAM_MD)).value ?? 0;
    const steve = sDesignDecomposition.fallback!(makeInput(STEVE_MD)).value ?? 0;
    const max = sDesignDecomposition.fallback!(makeInput(MAX_MD)).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
    expect(sDesignDecomposition.fallback!(makeInput(LIAM_MD)).algorithmVersion).toBe(
      DESIGN_DECOMPOSITION_FALLBACK_VERSION,
    );
  });

  it('fallback: null when moduleD missing', () => {
    const r = sDesignDecomposition.fallback!(makeInput());
    expect(r.value).toBeNull();
  });
});

describe('sTradeoffArticulation — LLM path (mocked provider)', () => {
  beforeEach(() => {
    vi.mocked(modelFactory.generate).mockReset();
  });

  it('returns LLM-graded value on success', async () => {
    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: '{"score": 0.9, "notes": "strong tradeoff analysis"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 80,
    });
    const r = await sTradeoffArticulation.compute(makeInput(LIAM_MD));
    expect(r.value).toBe(0.9);
    expect(r.algorithmVersion).toBe(TRADEOFF_ARTICULATION_LLM_VERSION);
  });

  it('returns null when tradeoffText empty (no LLM call)', async () => {
    const r = await sTradeoffArticulation.compute(
      makeInput({ ...LIAM_MD, tradeoffText: '' }),
    );
    expect(r.value).toBeNull();
    expect(vi.mocked(modelFactory.generate)).not.toHaveBeenCalled();
  });

  it('fallback: Liam > Steve > Max', () => {
    const liam = sTradeoffArticulation.fallback!(makeInput(LIAM_MD)).value ?? 0;
    const steve = sTradeoffArticulation.fallback!(makeInput(STEVE_MD)).value ?? 0;
    const max = sTradeoffArticulation.fallback!(makeInput(MAX_MD)).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
    expect(sTradeoffArticulation.fallback!(makeInput(LIAM_MD)).algorithmVersion).toBe(
      TRADEOFF_ARTICULATION_FALLBACK_VERSION,
    );
  });

  it('fallback: null when tradeoffText empty', () => {
    const r = sTradeoffArticulation.fallback!(makeInput({ ...LIAM_MD, tradeoffText: '' }));
    expect(r.value).toBeNull();
  });
});

describe('sAiOrchestrationQuality — LLM path (mocked provider)', () => {
  beforeEach(() => {
    vi.mocked(modelFactory.generate).mockReset();
  });

  it('returns LLM-graded value on success', async () => {
    vi.mocked(modelFactory.generate).mockResolvedValueOnce({
      content: 'Rubric: {"score": 0.66, "notes": "prompts have goals but miss failure modes"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 110,
    });
    const r = await sAiOrchestrationQuality.compute(makeInput(LIAM_MD));
    expect(r.value).toBe(0.66);
    expect(r.algorithmVersion).toBe(AI_ORCHESTRATION_QUALITY_LLM_VERSION);
  });

  it('returns null when aiOrchestrationPrompts empty', async () => {
    const r = await sAiOrchestrationQuality.compute(
      makeInput({ ...LIAM_MD, aiOrchestrationPrompts: [] }),
    );
    expect(r.value).toBeNull();
  });

  it('fallback: Liam > Steve > Max', () => {
    const liam = sAiOrchestrationQuality.fallback!(makeInput(LIAM_MD)).value ?? 0;
    const steve = sAiOrchestrationQuality.fallback!(makeInput(STEVE_MD)).value ?? 0;
    const max = sAiOrchestrationQuality.fallback!(makeInput(MAX_MD)).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
    expect(sAiOrchestrationQuality.fallback!(makeInput(LIAM_MD)).algorithmVersion).toBe(
      AI_ORCHESTRATION_QUALITY_FALLBACK_VERSION,
    );
  });
});

// ────────────────────────── Evidence Trace contract ──────────────────────────

describe('Evidence Trace contract — Round 3 重构 1', () => {
  beforeEach(() => {
    vi.mocked(modelFactory.generate).mockResolvedValue({
      content: '{"score": 0.6, "notes": "ok"}',
      providerId: 'glm',
      model: 'glm-4',
      latencyMs: 100,
    });
  });

  it('all 5 signals cap evidence at SIGNAL_EVIDENCE_LIMIT', async () => {
    const results = [
      await sConstraintIdentification.compute(makeInput(LIAM_MD)),
      await sMetaCognition.compute(makeInput(undefined, LIAM_SE)),
      await sDesignDecomposition.compute(makeInput(LIAM_MD)),
      await sTradeoffArticulation.compute(makeInput(LIAM_MD)),
      await sAiOrchestrationQuality.compute(makeInput(LIAM_MD)),
    ];
    for (const r of results) {
      expect(r.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
    }
  });

  it('all 5 signals set computedAt and algorithmVersion', async () => {
    const results = [
      await sConstraintIdentification.compute(makeInput(LIAM_MD)),
      await sMetaCognition.compute(makeInput(undefined, LIAM_SE)),
      await sDesignDecomposition.compute(makeInput(LIAM_MD)),
      await sTradeoffArticulation.compute(makeInput(LIAM_MD)),
      await sAiOrchestrationQuality.compute(makeInput(LIAM_MD)),
    ];
    for (const r of results) {
      expect(r.computedAt).toBeTypeOf('number');
      expect(r.algorithmVersion).toMatch(/@v\d+(_llm|_fallback)?$/);
    }
  });

  it('LLM signals expose rubric notes + provider info in evidence', async () => {
    const r = await sDesignDecomposition.compute(makeInput(LIAM_MD));
    const sources = r.evidence.map((e) => e.source);
    expect(sources).toContain('llm');
    const notesEntry = r.evidence.find((e) => e.triggeredRule === 'rubric_notes');
    expect(notesEntry?.excerpt).toBe('ok');
  });
});

// ────────────────────────── dimension tags ──────────────────────────

describe('Dimension taxonomy', () => {
  it('sConstraintIdentification → SYSTEM_DESIGN', () => {
    expect(sConstraintIdentification.dimension).toBe(V5Dimension.SYSTEM_DESIGN);
  });
  it('sDesignDecomposition → SYSTEM_DESIGN', () => {
    expect(sDesignDecomposition.dimension).toBe(V5Dimension.SYSTEM_DESIGN);
  });
  it('sTradeoffArticulation → SYSTEM_DESIGN', () => {
    expect(sTradeoffArticulation.dimension).toBe(V5Dimension.SYSTEM_DESIGN);
  });
  it('sAiOrchestrationQuality → AI_ENGINEERING', () => {
    expect(sAiOrchestrationQuality.dimension).toBe(V5Dimension.AI_ENGINEERING);
  });
  it('sMetaCognition → METACOGNITION', () => {
    expect(sMetaCognition.dimension).toBe(V5Dimension.METACOGNITION);
  });

  it('3 MD signals carry isLLMWhitelist=true; sConstraintIdentification + sMetaCognition do not', () => {
    expect(sDesignDecomposition.isLLMWhitelist).toBe(true);
    expect(sTradeoffArticulation.isLLMWhitelist).toBe(true);
    expect(sAiOrchestrationQuality.isLLMWhitelist).toBe(true);
    expect(sConstraintIdentification.isLLMWhitelist).toBe(false);
    expect(sMetaCognition.isLLMWhitelist).toBe(false);
  });
});

// ────────────────────────── registry integration ──────────────────────────

describe('registerAllSignals — Task 13d MD + SE registration', () => {
  function makeRegistry(): { count: number; ids: Set<string>; registry: SignalRegistry } {
    const ids = new Set<string>();
    let count = 0;
    const registry: SignalRegistry = {
      register(def) {
        if (ids.has(def.id)) throw new Error(`duplicate signal id: ${def.id}`);
        ids.add(def.id);
        count += 1;
      },
      async computeAll() {
        return {};
      },
      getDimensionSignals: () => [],
      getSignalCount: () => count,
      listSignals: () => [],
    };
    return {
      get count() {
        return count;
      },
      ids,
      registry,
    };
  }

  it('registers 4 MC + 5 P0 + 10 MA + 23 MB + 4 MD + 2 SE = 48 signals (Task A1 adds sCalibration)', () => {
    const r = makeRegistry();
    registerAllSignals(r.registry);
    expect(r.count).toBe(48);
    for (const id of [
      'sConstraintIdentification',
      'sDesignDecomposition',
      'sTradeoffArticulation',
      'sAiOrchestrationQuality',
      'sMetaCognition',
    ]) {
      expect(r.ids.has(id), id).toBe(true);
    }
  });

  it('EXPECTED_SIGNAL_COUNT contract (48) · Task A1 raised from 47 → 48', () => {
    expect(EXPECTED_SIGNAL_COUNT).toBe(48);
  });
});
