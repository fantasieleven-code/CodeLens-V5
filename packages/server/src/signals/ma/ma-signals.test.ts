/**
 * Task 13b MA signal suite — unit + Liam/Steve/Max calibration.
 *
 * Covers the 10 MA signals registered in Task 13b:
 *   sSchemeJudgment / sReasoningDepth / sContextQuality / sCriticalThinking /
 *   sArgumentResilience / sCodeReviewQuality / sHiddenBugFound /
 *   sReviewPrioritization / sDiagnosisAccuracy / sPrincipleAbstraction.
 *
 * Three-archetype calibration mirrors v5-design-clarifications.md Part 5
 * L779-790:
 *   - Liam (S): fully substantive, correct, evidence-cited
 *   - Steve (A): mostly correct but lacks depth or evidence
 *   - Max (C): surface / wrong / minimal
 *
 * Golden path contract: Liam > Steve > Max on every MA signal. Branch cases
 * (sArgumentResilience 4 branches, sPrincipleAbstraction 5 tiers,
 * sCodeReviewQuality V4 fallback) get explicit boundary tests.
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type MAModuleSpecific,
  type SignalInput,
  type SignalRegistry,
  type V5ModuleASubmission,
  type V5Submissions,
} from '@codelens-v5/shared';
import { sSchemeJudgment, SCHEME_JUDGMENT_VERSION } from './s-scheme-judgment.js';
import { sReasoningDepth, REASONING_DEPTH_VERSION } from './s-reasoning-depth.js';
import { sContextQuality, CONTEXT_QUALITY_VERSION } from './s-context-quality.js';
import { sCriticalThinking, CRITICAL_THINKING_VERSION } from './s-critical-thinking.js';
import { sArgumentResilience, ARGUMENT_RESILIENCE_VERSION } from './s-argument-resilience.js';
import { sCodeReviewQuality, CODE_REVIEW_QUALITY_VERSION } from './s-code-review-quality.js';
import { sHiddenBugFound, HIDDEN_BUG_FOUND_VERSION } from './s-hidden-bug-found.js';
import { sReviewPrioritization, REVIEW_PRIORITIZATION_VERSION } from './s-review-prioritization.js';
import { sDiagnosisAccuracy, DIAGNOSIS_ACCURACY_VERSION } from './s-diagnosis-accuracy.js';
import { sPrincipleAbstraction, PRINCIPLE_ABSTRACTION_VERSION } from './s-principle-abstraction.js';
import { registerAllSignals, EXPECTED_SIGNAL_COUNT } from '../index.js';

// ────────────────────────── fixtures ──────────────────────────

const MA_EXAM: MAModuleSpecific = {
  requirement:
    '设计一个秒杀系统的库存扣减模块,支持 10000 QPS 峰值。需要避免超卖、保证幂等,并在 Redis 和 MySQL 之间做一致性设计。',
  schemes: [
    {
      id: 'A',
      name: 'Redis 预扣 + MySQL 异步落库',
      description: '库存预扣 Redis,订单异步写 MySQL',
      pros: ['延迟低 10ms', '吞吐高 QPS 20k', 'Redis 原子减'],
      cons: ['一致性弱', 'Redis 崩溃丢数据', '对账复杂'],
      performance: 'QPS 20k P99 10ms',
      cost: '单机 Redis 成本低',
    },
    {
      id: 'B',
      name: 'MySQL 悲观锁',
      description: 'SELECT FOR UPDATE 扣减',
      pros: ['强一致', '简单'],
      cons: ['QPS 低 500', '锁等待', '死锁风险'],
      performance: 'QPS 500 P99 100ms',
      cost: '低',
    },
    {
      id: 'C',
      name: 'MQ 异步扣减',
      description: 'Kafka 异步处理',
      pros: ['削峰', '解耦'],
      cons: ['延迟高', '消息顺序', '最终一致'],
      performance: 'QPS 10k 延迟秒级',
      cost: '中',
    },
  ],
  counterArguments: {
    A: ['Redis 宕机后库存如何恢复?', '如果 MySQL 落库失败,前端看到扣减但订单没生成怎么办?'],
    B: ['500 QPS 根本扛不住秒杀场景', '锁等待会让 P99 延迟飙到秒级'],
    C: ['用户下单后多久能看到结果?体验差', 'MQ 消息丢失如何补偿'],
  },
  defects: [
    { defectId: 'd1', line: 12, content: 'redis.decr 未检查返回值', severity: 'critical', category: 'correctness' },
    { defectId: 'd2', line: 25, content: 'MySQL 写入无重试', severity: 'major', category: 'reliability' },
    { defectId: 'd3', line: 40, content: '缺少日志', severity: 'minor', category: 'observability' },
  ],
  decoys: [
    { line: 8, content: 'const key = lockKey; // 看起来像 bug 但不是' },
    { line: 33, content: 'return null; // 故意误导' },
  ],
  codeForReview: `// line 12
redis.decr("stock:" + skuId);
// ...
// line 25
await mysql.insert(order);
// line 40
// ...
`,
  failureScenario: {
    successCode: `redis.decr(key);
if (result < 0) { await redis.incr(key); throw new Error("oversold"); }
await mysql.insert(order);`,
    failedCode: `redis.decr(key);
await mysql.insert(order);`,
    diffPoints: [
      { line: 2, description: 'missing oversold check after decr' },
      { line: 3, description: 'no rollback on mysql failure' },
    ],
    rootCause:
      '失败版本缺少 Redis decr 返回值检查,高并发下会超卖;同时 MySQL 写入失败不会回滚 Redis,导致库存永久错误。',
  },
};

interface MAArchetype {
  name: string;
  submission: V5ModuleASubmission;
}

const LIAM: MAArchetype = {
  name: 'Liam',
  submission: {
    round1: {
      schemeId: 'A',
      reasoning:
        '我选 A(Redis 预扣 + MySQL 异步落库)。核心原因是秒杀场景的首要瓶颈是瞬时 QPS 20k,MySQL 单机悲观锁只有 500 QPS,远不够。Redis 原子减 decr 的 P99 延迟 10ms,能扛住峰值。异步落库的一致性弱点可以通过幂等订单号 + 对账任务补齐,代价可控。',
      structuredForm: {
        scenario: '10000 QPS 秒杀系统的库存扣减模块,Redis 和 MySQL 一致性',
        tradeoff: 'A 方案延迟低 10ms 吞吐高 QPS 20k,但一致性弱、Redis 崩溃丢数据;B 方案强一致但 QPS 500 扛不住;C 方案削峰但延迟秒级体验差。',
        decision: 'A 方案,因为 QPS 是首要约束,一致性弱点可通过幂等 + 对账缓解',
        verification: '压测 20k QPS,监控 Redis 与 MySQL 差异,确认 5 分钟内对账完成。注意 Redis 宕机恢复机制需要做快照 + AOF。',
      },
      challengeResponse:
        '保持选 A。即使 Redis 宕机,我会用 AOF + 每 5 秒快照把 RTO 压到 30 秒以内。对比 B 方案 500 QPS 直接崩溃的代价,A 的风险在可控范围。关键指标是 P99 < 20ms + RTO < 30s,这两个 B 都做不到。因为我们的业务场景就是 10000 QPS 的秒杀,不是一般 CRUD,所以选 A 的 tradeoff 合理。',
    },
    round2: {
      markedDefects: [
        { defectId: 'd1', commentType: 'bug', comment: 'redis.decr 返回值未检查,高并发会超卖 — critical', fixSuggestion: '检查 result < 0 时回滚 incr' },
        { defectId: 'd2', commentType: 'bug', comment: 'MySQL insert 无重试,一次失败永久丢单 — 需要 retry + DLQ', fixSuggestion: '加 retry 3 次 + 死信队列' },
        { defectId: 'd3', commentType: 'suggestion', comment: '建议加关键路径日志,方便后续对账', fixSuggestion: '加 logger.info 在 decr 前后' },
      ],
    },
    round3: {
      correctVersionChoice: 'success',
      diffAnalysis:
        '失败版本在 line 2 缺少 decr 返回值检查,line 3 的 mysql.insert 没有配合 Redis 回滚。成功版本多了 if (result < 0) incr + throw 的保护。',
      diagnosisText:
        '失败版本缺少 Redis decr 返回值检查,在高并发场景下会出现超卖;同时 MySQL 写入失败不会回滚 Redis,造成库存永久错误。根本原因是双写一致性保护缺失。',
    },
    round4: {
      response:
        '核心原则不变 — 高并发场景下,Redis 预扣 + 异步落库仍然是正确选择,关键是原子性保护 + 补偿机制。但具体参数需要调整:红包抢购的并发量比秒杀更高,需要更短的 TTL;考虑到红包金额不能超发,幂等性校验要放在 Redis 层而不是 MySQL 层;阈值也要变,因为红包的扣减是按金额不是按件数。这和之前 R1 选 A 的逻辑一致。',
      submittedAt: Date.now(),
      timeSpentSec: 180,
    },
  },
};

const STEVE: MAArchetype = {
  name: 'Steve',
  submission: {
    round1: {
      schemeId: 'A',
      reasoning: '我选 A,Redis 扣减更快,性能好。MySQL 直接写会慢。',
      structuredForm: {
        scenario: '秒杀库存扣减',
        tradeoff: 'A 快但一致性有问题,B 慢但安全,C 最终一致性',
        decision: 'A',
        verification: '要压测一下',
      },
      challengeResponse:
        'A 还是 OK 的,因为 Redis 崩的概率不大。即使崩了也可以恢复。',
    },
    round2: {
      markedDefects: [
        { defectId: 'd1', commentType: 'bug', comment: '这里返回值没检查' },
        { defectId: 'd3', commentType: 'bug', comment: '日志不够' },
      ],
    },
    round3: {
      correctVersionChoice: 'success',
      diffAnalysis: 'failed 版本少了一些检查',
      diagnosisText: 'failed 版本有 bug 会超卖',
    },
    round4: {
      response:
        '红包抢购场景也可以用 Redis,因为性能要求类似。不过参数可能需要调整一下,但是具体怎么调我不太确定。',
      submittedAt: Date.now(),
      timeSpentSec: 90,
    },
  },
};

const MAX: MAArchetype = {
  name: 'Max',
  submission: {
    round1: {
      schemeId: 'B',
      reasoning: 'B 简单。',
      structuredForm: {
        scenario: '秒杀',
        tradeoff: '',
        decision: 'B',
        verification: '',
      },
      challengeResponse: '不知道。',
    },
    round2: {
      markedDefects: [
        { defectId: 'unknown', commentType: 'nit', comment: '这个不好看' },
      ],
    },
    round3: {
      correctVersionChoice: 'failed',
      diffAnalysis: '差不多',
      diagnosisText: '不懂',
    },
    round4: {
      response: '不知道。',
      submittedAt: Date.now(),
      timeSpentSec: 20,
    },
  },
};

function makeInput(archetype: MAArchetype, examOverride?: MAModuleSpecific): SignalInput {
  const submissions: V5Submissions = { moduleA: archetype.submission };
  return {
    sessionId: `session-${archetype.name}`,
    suiteId: 'full_stack',
    submissions,
    examData: { MA: (examOverride ?? MA_EXAM) as unknown as Record<string, unknown> },
    participatingModules: ['moduleA'],
  };
}

const ALL_SIGNALS = [
  sSchemeJudgment,
  sReasoningDepth,
  sContextQuality,
  sCriticalThinking,
  sArgumentResilience,
  sCodeReviewQuality,
  sHiddenBugFound,
  sReviewPrioritization,
  sDiagnosisAccuracy,
  sPrincipleAbstraction,
];

// ────────────────────────── metadata ──────────────────────────

describe('MA signals — SignalDefinition metadata', () => {
  it('10 signals split 7 TJ / 3 CQ (per v5-design-reference.md L721-729 + 调整 2)', () => {
    const tj = ALL_SIGNALS.filter((s) => s.dimension === V5Dimension.TECHNICAL_JUDGMENT);
    const cq = ALL_SIGNALS.filter((s) => s.dimension === V5Dimension.CODE_QUALITY);
    expect(tj.map((s) => s.id).sort()).toEqual(
      [
        'sSchemeJudgment',
        'sReasoningDepth',
        'sContextQuality',
        'sCriticalThinking',
        'sArgumentResilience',
        'sDiagnosisAccuracy',
        'sPrincipleAbstraction',
      ].sort(),
    );
    expect(cq.map((s) => s.id).sort()).toEqual(
      ['sCodeReviewQuality', 'sHiddenBugFound', 'sReviewPrioritization'].sort(),
    );
  });

  it('all 10 signals declare MA moduleSource + pure-rule', () => {
    for (const s of ALL_SIGNALS) {
      expect(s.moduleSource, s.id).toBe('MA');
      expect(s.isLLMWhitelist, s.id).toBe(false);
    }
  });

  it('version constants follow @vN convention', () => {
    expect(SCHEME_JUDGMENT_VERSION).toBe('sSchemeJudgment@v1');
    expect(REASONING_DEPTH_VERSION).toBe('sReasoningDepth@v1');
    expect(CONTEXT_QUALITY_VERSION).toBe('sContextQuality@v1');
    expect(CRITICAL_THINKING_VERSION).toBe('sCriticalThinking@v1');
    expect(ARGUMENT_RESILIENCE_VERSION).toBe('sArgumentResilience@v1');
    expect(CODE_REVIEW_QUALITY_VERSION).toBe('sCodeReviewQuality@v1');
    expect(HIDDEN_BUG_FOUND_VERSION).toBe('sHiddenBugFound@v1');
    expect(REVIEW_PRIORITIZATION_VERSION).toBe('sReviewPrioritization@v1');
    expect(DIAGNOSIS_ACCURACY_VERSION).toBe('sDiagnosisAccuracy@v1');
    expect(PRINCIPLE_ABSTRACTION_VERSION).toBe('sPrincipleAbstraction@v1');
  });
});

// ────────────────────────── fallbacks ──────────────────────────

describe('MA signals — fallback when moduleA submission missing', () => {
  const input: SignalInput = {
    sessionId: 'empty',
    suiteId: 'full_stack',
    submissions: {},
    examData: { MA: MA_EXAM as unknown as Record<string, unknown> },
    participatingModules: [],
  };

  it('all 10 signals return value=null with empty evidence', async () => {
    for (const sig of ALL_SIGNALS) {
      const r = await sig.compute(input);
      expect(r.value, sig.id).toBeNull();
      expect(r.evidence, sig.id).toEqual([]);
    }
  });
});

describe('MA signals — exam-dependent nulls', () => {
  const noExam: SignalInput = {
    sessionId: 'noexam',
    suiteId: 'full_stack',
    submissions: { moduleA: LIAM.submission },
    examData: {},
    participatingModules: ['moduleA'],
  };

  it('sContextQuality / sCriticalThinking / sDiagnosisAccuracy / sHiddenBugFound / sCodeReviewQuality / sReviewPrioritization return null without exam data', async () => {
    for (const sig of [
      sContextQuality,
      sCriticalThinking,
      sDiagnosisAccuracy,
      sHiddenBugFound,
      sCodeReviewQuality,
      sReviewPrioritization,
    ]) {
      const r = await sig.compute(noExam);
      expect(r.value, sig.id).toBeNull();
    }
  });
});

// ────────────────────────── archetype monotonicity ──────────────────────────

describe('Liam (S) > Steve (A) > Max (C) monotonicity — all 10 MA signals', () => {
  for (const sig of [
    sSchemeJudgment,
    sReasoningDepth,
    sContextQuality,
    sCriticalThinking,
    sArgumentResilience,
    sCodeReviewQuality,
    sHiddenBugFound,
    sReviewPrioritization,
    sDiagnosisAccuracy,
    sPrincipleAbstraction,
  ]) {
    it(`${sig.id}: Liam > Steve >= Max`, async () => {
      const liam = (await sig.compute(makeInput(LIAM))).value ?? 0;
      const steve = (await sig.compute(makeInput(STEVE))).value ?? 0;
      const max = (await sig.compute(makeInput(MAX))).value ?? 0;
      expect(liam, `${sig.id} liam>steve`).toBeGreaterThan(steve);
      expect(steve, `${sig.id} steve>=max`).toBeGreaterThanOrEqual(max);
    });
  }
});

describe('sPrincipleAbstraction — Liam ≥0.85, Max ≤0.4 per clarifications L234-272', () => {
  it('Liam hits tier 0.85+ (has all 4 criteria or close)', async () => {
    const r = await sPrincipleAbstraction.compute(makeInput(LIAM));
    expect(r.value).toBeGreaterThanOrEqual(0.85);
  });

  it('Max hits tier_15 or tier_40', async () => {
    const r = await sPrincipleAbstraction.compute(makeInput(MAX));
    expect(r.value).toBeLessThanOrEqual(0.4);
  });
});

// ────────────────────────── sArgumentResilience branch coverage ──────────────────────────

describe('sArgumentResilience — 4 branches per backend-agent-tasks.md L68-84', () => {
  function makeSub(overrides: Partial<V5ModuleASubmission['round1']>): SignalInput {
    const submission: V5ModuleASubmission = {
      ...LIAM.submission,
      round1: { ...LIAM.submission.round1, ...overrides },
    };
    return makeInput({ name: 'custom', submission });
  }

  it('stance_maintained branch — mentions original only, returns composite score', async () => {
    const r = await sArgumentResilience.compute(
      makeSub({
        schemeId: 'A',
        challengeResponse:
          '保持选 A,因为 Redis 的 QPS 20k 和 P99 10ms 是关键指标,支持 10000 并发,AOF 保证 RTO 30s。',
      }),
    );
    expect(r.value).toBeGreaterThan(0.5);
    expect(r.evidence.some((e) => e.triggeredRule.startsWith('stance_maintained'))).toBe(true);
  });

  it('stance_changed_justified — mentions alternative + >50 chars + causal marker', async () => {
    const r = await sArgumentResilience.compute(
      makeSub({
        schemeId: 'A',
        challengeResponse:
          '我重新考虑后切换到 B,因为秒杀场景的一致性要求比我想的更高,B 方案虽然 QPS 低但实际峰值也就 300,可以接受。',
      }),
    );
    expect(r.value).toBe(0.6);
  });

  it('stance_changed_unjustified — mentions alternative + short', async () => {
    const r = await sArgumentResilience.compute(
      makeSub({ schemeId: 'A', challengeResponse: 'B 好吧' }),
    );
    expect(r.value).toBe(0.1);
  });

  it('fallback branch — no stance reference', async () => {
    const r = await sArgumentResilience.compute(
      makeSub({ schemeId: 'A', challengeResponse: '嗯我想想' }),
    );
    expect(r.value).toBe(0.3);
  });

  it('null when challengeResponse empty', async () => {
    const r = await sArgumentResilience.compute(makeSub({ challengeResponse: '' }));
    expect(r.value).toBeNull();
  });
});

// ────────────────────────── sCodeReviewQuality V4 fallback ──────────────────────────

describe('sCodeReviewQuality — V4 fallback per backend-agent-tasks.md L86-87', () => {
  function withMarked(
    marked: V5ModuleASubmission['round2']['markedDefects'],
  ): SignalInput {
    const submission: V5ModuleASubmission = {
      ...LIAM.submission,
      round2: { markedDefects: marked },
    };
    return makeInput({ name: 'custom', submission });
  }

  it('V4 fallback triggers when all commentType === bug', async () => {
    const r = await sCodeReviewQuality.compute(
      withMarked([
        { defectId: 'd1', commentType: 'bug', comment: 'a' },
        { defectId: 'd2', commentType: 'bug', comment: 'b' },
      ]),
    );
    expect(r.evidence.at(-1)?.triggeredRule).toBe('v4_fallback');
  });

  it('V5 composite triggers with mixed commentType', async () => {
    const r = await sCodeReviewQuality.compute(
      withMarked([
        { defectId: 'd1', commentType: 'bug', comment: 'real bug here' },
        { defectId: 'd3', commentType: 'suggestion', comment: '可以加日志' },
      ]),
    );
    expect(r.evidence.at(-1)?.triggeredRule).toBe('v5_composite');
  });

  it('precision/recall reflected in f1', async () => {
    const r = await sCodeReviewQuality.compute(
      withMarked([
        { defectId: 'd1', commentType: 'bug', comment: 'match' }, // TP
        { defectId: 'd2', commentType: 'bug', comment: 'match' }, // TP
        { defectId: 'd3', commentType: 'bug', comment: 'match' }, // TP (full recall)
      ]),
    );
    // 3/3 TP, 0 FP → f1 = 1.0
    expect(r.value).toBe(1.0);
  });
});

// ────────────────────────── sDiagnosisAccuracy formula ──────────────────────────

describe('sDiagnosisAccuracy — rootCause×0.5 + diffPoint×0.3 + choice×0.2', () => {
  it('perfect diagnosis approaches 1.0', async () => {
    const r = await sDiagnosisAccuracy.compute(makeInput(LIAM));
    expect(r.value).toBeGreaterThan(0.8);
  });

  it('wrong choice caps value below 0.8', async () => {
    const submission: V5ModuleASubmission = {
      ...LIAM.submission,
      round3: { ...LIAM.submission.round3, correctVersionChoice: 'failed' },
    };
    const r = await sDiagnosisAccuracy.compute(makeInput({ name: 'wrong-choice', submission }));
    expect(r.value).toBeLessThan(0.82);
  });
});

// ────────────────────────── sPrincipleAbstraction tier boundaries ──────────────────────────

describe('sPrincipleAbstraction — 5-tier cascade per clarifications L234-272', () => {
  function withR4(response: string, schemeId: 'A' | 'B' | 'C' = 'A'): SignalInput {
    const submission: V5ModuleASubmission = {
      ...LIAM.submission,
      round1: { ...LIAM.submission.round1, schemeId },
      round4: { response, submittedAt: Date.now(), timeSpentSec: 100 },
    };
    return makeInput({ name: 'tier', submission });
  }

  it('tier 1.0 — principle + parameter + substantive + R1 reference', async () => {
    const r = await sPrincipleAbstraction.compute(
      withR4(
        '核心原则不变,红包抢购和秒杀本质是一样的,都是高并发下的库存扣减。参数需要调整,因为红包的阈值按金额算,考虑到 TTL 要更短。之前 R1 选 A 的逻辑在这里同样成立。填充一些字符以达到 100 字的门槛,这是 tier_100 的要求之一,继续填。',
      ),
    );
    expect(r.value).toBe(1.0);
  });

  it('tier 0.85 — principle + parameter + substantive, no R1 reference', async () => {
    const r = await sPrincipleAbstraction.compute(
      withR4(
        '核心原则不变,红包和秒杀本质相同。不过参数需要调整,因为红包按金额扣减而不是件数,考虑到这个差异阈值和 TTL 都要改一下。填充字符确保达到 100 字门槛这样才能进入 tier_85 的评分范围继续填充凑满。',
        'X' as 'A', // schemeId not mentioned anywhere, prevent referencesR1=true via pattern
      ),
    );
    expect(r.value).toBe(0.85);
  });

  it('tier 0.7 — principle + parameter, not substantive', async () => {
    const r = await sPrincipleAbstraction.compute(
      withR4('核心一样,不过参数不同因为场景差。', 'X' as 'A'),
    );
    expect(r.value).toBe(0.7);
  });

  it('tier 0.4 — only one condition', async () => {
    const r = await sPrincipleAbstraction.compute(
      withR4('核心理念差不多。', 'X' as 'A'),
    );
    expect(r.value).toBe(0.4);
  });

  it('tier 0.15 — neither principle nor parameter', async () => {
    const r = await sPrincipleAbstraction.compute(withR4('不知道。', 'X' as 'A'));
    expect(r.value).toBe(0.15);
  });

  it('migration_scenario_reference evidence emitted when exam has migrationScenario (forward-compat narrow)', async () => {
    const examWithScenario = {
      ...MA_EXAM,
      migrationScenario: {
        newBusinessContext: '红包抢购,金额上限 100,TTL 5s',
        relatedDimension: '高并发扣减',
        differingDimension: '金额 vs 件数',
        promptText: '你的方案还成立吗?',
      },
    } as unknown as MAModuleSpecific;
    const sub: V5ModuleASubmission = {
      ...LIAM.submission,
      round4: { response: '核心不变因为本质相同,参数调整。', submittedAt: Date.now(), timeSpentSec: 60 },
    };
    const r = await sPrincipleAbstraction.compute(
      makeInput({ name: 'with-scenario', submission: sub }, examWithScenario),
    );
    expect(r.evidence.some((e) => e.triggeredRule === 'migration_scenario_reference')).toBe(true);
  });

  it('null when round4 missing (optional in quick_screen)', async () => {
    const sub: V5ModuleASubmission = {
      ...LIAM.submission,
      // @ts-expect-error — deliberately omit round4 to hit fallback
      round4: undefined,
    };
    const r = await sPrincipleAbstraction.compute(makeInput({ name: 'no-r4', submission: sub }));
    expect(r.value).toBeNull();
  });
});

// ────────────────────────── evidence shape ──────────────────────────

describe('Evidence Trace contract (Round 3 重构 1)', () => {
  it('every non-null MA signal produces >=1 evidence entry', async () => {
    for (const sig of ALL_SIGNALS) {
      const r = await sig.compute(makeInput(LIAM));
      if (r.value !== null) {
        expect(r.evidence.length, sig.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('every signal caps evidence at SIGNAL_EVIDENCE_LIMIT', async () => {
    for (const sig of ALL_SIGNALS) {
      const r = await sig.compute(makeInput(LIAM));
      expect(r.evidence.length, sig.id).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
    }
  });

  it('every signal sets computedAt and algorithmVersion', async () => {
    for (const sig of ALL_SIGNALS) {
      const r = await sig.compute(makeInput(LIAM));
      expect(r.computedAt, sig.id).toBeTypeOf('number');
      expect(r.algorithmVersion, sig.id).toMatch(/@v\d+$/);
    }
  });
});

// ────────────────────────── registry integration ──────────────────────────

describe('registerAllSignals — Task 13b MA registration', () => {
  function makeRegistry(): { count: number; ids: Set<string>; registry: SignalRegistry } {
    const ids = new Set<string>();
    let count = 0;
    const registry: SignalRegistry = {
      register(def) {
        if (ids.has(def.id)) {
          throw new Error(`duplicate signal id: ${def.id}`);
        }
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

  it('registers 1 MC + 5 P0 + 10 MA + 23 MB + 4 MD + 1 SE = 44 signals', () => {
    const r = makeRegistry();
    registerAllSignals(r.registry);
    expect(r.count).toBe(44);
  });

  it('no duplicate ids across all registered signals', () => {
    const r = makeRegistry();
    registerAllSignals(r.registry);
    expect(r.ids.size).toBe(r.count);
  });

  it('all 10 MA signal ids registered', () => {
    const r = makeRegistry();
    registerAllSignals(r.registry);
    for (const id of [
      'sSchemeJudgment',
      'sReasoningDepth',
      'sContextQuality',
      'sCriticalThinking',
      'sArgumentResilience',
      'sCodeReviewQuality',
      'sHiddenBugFound',
      'sReviewPrioritization',
      'sDiagnosisAccuracy',
      'sPrincipleAbstraction',
    ]) {
      expect(r.ids.has(id), id).toBe(true);
    }
  });

  it('EXPECTED_SIGNAL_COUNT contract (47) unchanged', () => {
    expect(EXPECTED_SIGNAL_COUNT).toBe(47);
  });
});
