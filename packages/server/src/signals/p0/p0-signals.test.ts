/**
 * Task 13a P0 signal suite — unit + Liam/Steve/Max calibration.
 *
 * Covers the 5 P0 signals registered in Task 13a:
 *   sBaselineReading / sAiCalibration / sDecisionStyle / sTechProfile /
 *   sAiClaimDetection.
 *
 * Three-archetype calibration mirrors v5-design-clarifications.md Part 5
 * L779-L790:
 *   - Liam (S): answers are substantive, correct, evidence-cited
 *   - Steve (A): mostly correct but lacks depth or evidence
 *   - Max (C): surface / wrong
 *
 * Golden path contract (L790): Liam must rank above Steve must rank above Max
 * on every P0 signal; sAiClaimDetection specifically must hit the doc bands
 * (Liam ≥0.85, Steve 0.5-0.8, Max <0.2).
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type P0ModuleSpecific,
  type SignalInput,
  type SignalRegistry,
  type V5Phase0Submission,
  type V5Submissions,
} from '@codelens-v5/shared';
import { sBaselineReading, BASELINE_READING_VERSION } from './s-baseline-reading.js';
import { sAiCalibration, AI_CALIBRATION_VERSION } from './s-ai-calibration.js';
import { sDecisionStyle, DECISION_STYLE_VERSION } from './s-decision-style.js';
import { sTechProfile, TECH_PROFILE_VERSION } from './s-tech-profile.js';
import { sAiClaimDetection, AI_CLAIM_DETECTION_VERSION } from './s-ai-claim-detection.js';
import { registerAllSignals, EXPECTED_SIGNAL_COUNT } from '../index.js';

// ────────────────────────── fixtures ──────────────────────────

const P0_EXAM: P0ModuleSpecific = {
  systemCode: 'const lockKey = `sku:${skuId}`;\nredis.set(lockKey, uuid, "NX", "EX", 30);\n/* ... */\n',
  codeReadingQuestions: {
    l1: {
      question: '这段代码的核心职责是什么?',
      options: ['Redis 互斥锁防止同 SKU 并发下单', '记录日志', '发送邮件', '计算价格'],
      correctIndex: 0,
    },
    l2: { question: '关键设计决策是什么?' },
    l3: { question: 'QPS 涨到 10k 时哪里先成为瓶颈?' },
  },
  aiOutputJudgment: [
    {
      codeA: 'async function pay(order) { await redis.set(...); /* tx */ }',
      codeB: 'async function pay(order) { /* no lock */ await db.insert(...); }',
      context: '两版支付代码哪个更稳',
      groundTruth: 'A',
    },
    {
      codeA: 'function x() { return cache.get(k); }',
      codeB: 'function x() { const v = await cache.get(k); if (!v) v = await db.query(); return v; }',
      context: '读缓存的两种写法',
      groundTruth: 'B',
    },
  ],
  decision: {
    scenario: '线上订单支付失败率从 1% 涨到 30%,你先做什么?',
    options: [
      { id: 'A', label: '全量回滚', description: '回滚到昨天版本' },
      { id: 'B', label: '查日志', description: '先查错误日志' },
      { id: 'C', label: '止血 + 排查', description: '先限流保住核心,再排查' },
    ],
  },
  aiClaimDetection: {
    code: 'redis.set(lockKey, uuid, "NX", "EX", 30)\n/* no MULTI, no WATCH */',
    aiExplanation: '这段代码使用了 Redis WATCH/MULTI 实现乐观锁,SET 设置 TTL 为 30s',
    claimedFeatures: ['WATCH', 'MULTI', 'SET NX', 'TTL'],
    actualFeatures: ['SET', 'NX', 'TTL', 'EX'],
    deceptivePoint: {
      claimedFeature: 'MULTI',
      realityGap: '代码里只有 SET NX,没有 MULTI/EXEC',
    },
  },
};

interface P0Archetype {
  name: string;
  submission: V5Phase0Submission;
}

const LIAM: P0Archetype = {
  name: 'Liam',
  submission: {
    codeReading: {
      l1Answer: P0_EXAM.codeReadingQuestions.l1.options[0],
      l2Answer:
        '关键决策是用 Redis SET NX 作为互斥锁,避免同一用户对同一 SKU 的并发下单。锁的 TTL 30s 既足够完成事务又能在崩溃时自动释放,cost 是锁住的 SKU 在其他流程看不到。',
      l3Answer:
        'QPS 涨到 10k 时,首要瓶颈是 Redis 单机 set/del 的 P99 延迟——现在 function 里每单至少 2 次 round-trip。其次,finally 里的 GET + DEL 不是原子的,多实例下存在误删别人锁的风险,应换成 Lua 脚本比较并删;第三,cryptoRandom 在分布式下熵不够,应改用 UUID。',
      confidence: 0.8,
    },
    aiOutputJudgment: [
      { choice: 'A', reasoning: 'A 版显式做了 Redis 互斥锁 + 事务提交,B 版裸写数据库不保证幂等,并发下订单会重复。' },
      { choice: 'B', reasoning: 'B 版用 cache-aside 模式,缓存不命中回源数据库,A 版直接拿 cache 会返回 null。' },
    ],
    aiClaimVerification: {
      response:
        'AI 说用了 WATCH/MULTI 实现乐观锁,但代码里我没看到 MULTI 和 EXEC,只有一个 SET NX 互斥锁(line 2)。actualFeatures 里的 NX+TTL 是悲观锁写法,不是乐观锁。',
      submittedAt: Date.now(),
    },
    decision: {
      choice: 'C',
      reasoning: '我会先启动限流止血,30 秒内把失败订单率压回 5% 以下,然后基于日志排查 root cause,因为 rollback 会丢掉已经成功的 70% 订单。',
    },
  },
};

const STEVE: P0Archetype = {
  name: 'Steve',
  submission: {
    codeReading: {
      l1Answer: P0_EXAM.codeReadingQuestions.l1.options[0],
      l2Answer:
        '主要是用 Redis 做了一个互斥锁,防止重复下单。TTL 30 秒应该是为了容错,避免挂掉的时候锁一直占着。',
      l3Answer:
        'QPS 涨到 10k 时数据库可能先成为瓶颈,Redis 本身 10k 问题不大。另外如果多实例可能锁会有并发问题,需要考虑一下。',
      confidence: 0.6,
    },
    aiOutputJudgment: [
      { choice: 'A', reasoning: 'A 看起来更完整一点,有 redis 调用,B 没有。' },
      { choice: 'A', reasoning: 'A 更直接。' }, // wrong — groundTruth is B
    ],
    aiClaimVerification: {
      response: 'AI 说用了 MULTI,但我觉得代码里好像没有 MULTI 这种写法?',
      submittedAt: Date.now(),
    },
    decision: {
      choice: 'C',
      reasoning: '我会先止血,不能让失败率继续涨,然后再排查。',
    },
  },
};

const MAX: P0Archetype = {
  name: 'Max',
  submission: {
    codeReading: {
      l1Answer: P0_EXAM.codeReadingQuestions.l1.options[1], // wrong
      l2Answer: '不太懂,可能是做并发的。',
      l3Answer: '不太清楚。',
      confidence: 0.3,
    },
    aiOutputJudgment: [
      { choice: 'B', reasoning: 'B 看起来比较简单。' }, // wrong
      { choice: 'A', reasoning: 'A 短。' }, // wrong
    ],
    aiClaimVerification: {
      response: 'AI 说得有道理。',
      submittedAt: Date.now(),
    },
    decision: {
      choice: 'A',
      reasoning: '回滚吧。',
    },
  },
};

function makeInput(archetype: P0Archetype): SignalInput {
  const submissions: V5Submissions = { phase0: archetype.submission };
  return {
    sessionId: `session-${archetype.name}`,
    suiteId: 'full_stack',
    submissions,
    examData: { P0: P0_EXAM as unknown as Record<string, unknown> },
    participatingModules: ['phase0'],
  };
}

// ────────────────────────── metadata ──────────────────────────

describe('P0 signals — SignalDefinition metadata', () => {
  it('sBaselineReading declares TECHNICAL_JUDGMENT + P0 + pure-rule', () => {
    expect(sBaselineReading.id).toBe('sBaselineReading');
    expect(sBaselineReading.dimension).toBe(V5Dimension.TECHNICAL_JUDGMENT);
    expect(sBaselineReading.moduleSource).toBe('P0');
    expect(sBaselineReading.isLLMWhitelist).toBe(false);
    expect(BASELINE_READING_VERSION).toBe('sBaselineReading@v1');
  });

  it('sAiCalibration declares METACOGNITION + P0 + pure-rule', () => {
    expect(sAiCalibration.id).toBe('sAiCalibration');
    expect(sAiCalibration.dimension).toBe(V5Dimension.METACOGNITION);
    expect(sAiCalibration.moduleSource).toBe('P0');
    expect(AI_CALIBRATION_VERSION).toBe('sAiCalibration@v1');
  });

  it('sDecisionStyle declares METACOGNITION + P0 + pure-rule', () => {
    expect(sDecisionStyle.id).toBe('sDecisionStyle');
    expect(sDecisionStyle.dimension).toBe(V5Dimension.METACOGNITION);
    expect(sDecisionStyle.moduleSource).toBe('P0');
    expect(DECISION_STYLE_VERSION).toBe('sDecisionStyle@v1');
  });

  it('sTechProfile declares METACOGNITION + P0 + pure-rule', () => {
    expect(sTechProfile.id).toBe('sTechProfile');
    expect(sTechProfile.dimension).toBe(V5Dimension.METACOGNITION);
    expect(TECH_PROFILE_VERSION).toBe('sTechProfile@v1');
  });

  it('sAiClaimDetection declares TECHNICAL_JUDGMENT + P0 + pure-rule', () => {
    expect(sAiClaimDetection.id).toBe('sAiClaimDetection');
    expect(sAiClaimDetection.dimension).toBe(V5Dimension.TECHNICAL_JUDGMENT);
    expect(sAiClaimDetection.moduleSource).toBe('P0');
    expect(AI_CLAIM_DETECTION_VERSION).toBe('sAiClaimDetection@v1');
  });
});

// ────────────────────────── fallbacks ──────────────────────────

describe('P0 signals — fallback when phase0 submission missing', () => {
  const input: SignalInput = {
    sessionId: 'empty',
    suiteId: 'full_stack',
    submissions: {},
    examData: { P0: P0_EXAM as unknown as Record<string, unknown> },
    participatingModules: [],
  };

  it('all 5 signals return value=null with empty evidence', async () => {
    for (const sig of [sBaselineReading, sAiCalibration, sDecisionStyle, sTechProfile, sAiClaimDetection]) {
      const r = await sig.compute(input);
      expect(r.value, `${sig.id}`).toBeNull();
      expect(r.evidence, `${sig.id}`).toEqual([]);
    }
  });
});

describe('sBaselineReading / sAiCalibration / sAiClaimDetection — null when exam data missing', () => {
  const inputNoExam: SignalInput = {
    sessionId: 'noexam',
    suiteId: 'full_stack',
    submissions: { phase0: LIAM.submission },
    examData: {},
    participatingModules: ['phase0'],
  };

  it('returns null (examData.P0 missing)', async () => {
    expect((await sBaselineReading.compute(inputNoExam)).value).toBeNull();
    expect((await sAiCalibration.compute(inputNoExam)).value).toBeNull();
    expect((await sAiClaimDetection.compute(inputNoExam)).value).toBeNull();
  });
});

// ────────────────────────── archetype monotonicity ──────────────────────────

describe('Liam (S) > Steve (A) > Max (C) monotonicity', () => {
  it('sBaselineReading: Liam > Steve > Max', async () => {
    const liam = (await sBaselineReading.compute(makeInput(LIAM))).value ?? 0;
    const steve = (await sBaselineReading.compute(makeInput(STEVE))).value ?? 0;
    const max = (await sBaselineReading.compute(makeInput(MAX))).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
  });

  it('sAiCalibration: Liam > Steve > Max', async () => {
    const liam = (await sAiCalibration.compute(makeInput(LIAM))).value ?? 0;
    const steve = (await sAiCalibration.compute(makeInput(STEVE))).value ?? 0;
    const max = (await sAiCalibration.compute(makeInput(MAX))).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
  });

  it('sDecisionStyle: Liam >= Steve > Max', async () => {
    const liam = (await sDecisionStyle.compute(makeInput(LIAM))).value ?? 0;
    const steve = (await sDecisionStyle.compute(makeInput(STEVE))).value ?? 0;
    const max = (await sDecisionStyle.compute(makeInput(MAX))).value ?? 0;
    expect(liam).toBeGreaterThanOrEqual(steve);
    expect(steve).toBeGreaterThan(max);
  });

  it('sTechProfile: Liam > Steve > Max', async () => {
    const liam = (await sTechProfile.compute(makeInput(LIAM))).value ?? 0;
    const steve = (await sTechProfile.compute(makeInput(STEVE))).value ?? 0;
    const max = (await sTechProfile.compute(makeInput(MAX))).value ?? 0;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThan(max);
  });

  it('sAiClaimDetection hits the Part 5 L781 bands (Liam ≥0.85, Steve 0.5-0.8, Max <0.2)', async () => {
    const liam = (await sAiClaimDetection.compute(makeInput(LIAM))).value ?? 0;
    const steve = (await sAiClaimDetection.compute(makeInput(STEVE))).value ?? 0;
    const max = (await sAiClaimDetection.compute(makeInput(MAX))).value ?? 0;
    expect(liam).toBeGreaterThanOrEqual(0.85);
    expect(steve).toBeGreaterThanOrEqual(0.5);
    expect(steve).toBeLessThanOrEqual(0.8);
    expect(max).toBeLessThan(0.2);
  });
});

// ────────────────────────── evidence shape ──────────────────────────

describe('Evidence Trace contract (Round 3 重构 1)', () => {
  it('Liam-tier sAiClaimDetection produces >=3 evidence entries', async () => {
    const r = await sAiClaimDetection.compute(makeInput(LIAM));
    expect(r.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it('Steve-tier sAiClaimDetection produces 1-4 evidence entries (awareness without full proof)', async () => {
    const r = await sAiClaimDetection.compute(makeInput(STEVE));
    expect(r.evidence.length).toBeGreaterThanOrEqual(1);
    expect(r.evidence.length).toBeLessThanOrEqual(4);
  });

  it('Every signal caps evidence at SIGNAL_EVIDENCE_LIMIT', async () => {
    for (const sig of [sBaselineReading, sAiCalibration, sDecisionStyle, sTechProfile, sAiClaimDetection]) {
      const r = await sig.compute(makeInput(LIAM));
      expect(r.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
    }
  });

  it('Every signal sets computedAt and algorithmVersion', async () => {
    for (const sig of [sBaselineReading, sAiCalibration, sDecisionStyle, sTechProfile, sAiClaimDetection]) {
      const r = await sig.compute(makeInput(LIAM));
      expect(r.computedAt).toBeTypeOf('number');
      expect(r.algorithmVersion).toMatch(/@v\d+$/);
    }
  });
});

// ────────────────────────── sAiClaimDetection tier boundaries ──────────────────────────

describe('sAiClaimDetection — 5-tier boundary cases', () => {
  function withResponse(text: string): SignalInput {
    const sub: V5Phase0Submission = {
      ...LIAM.submission,
      aiClaimVerification: { response: text, submittedAt: Date.now() },
    };
    return {
      sessionId: 'tier-test',
      suiteId: 'full_stack',
      submissions: { phase0: sub },
      examData: { P0: P0_EXAM as unknown as Record<string, unknown> },
      participatingModules: ['phase0'],
    };
  }

  it('tier 1.0 — mentions deception + evidence + calibrated', async () => {
    const r = await sAiClaimDetection.compute(
      withResponse('AI 说 MULTI,但代码 line 2 里没有 MULTI,只有 SET NX。'),
    );
    expect(r.value).toBe(1.0);
  });

  it('tier 0.8 — mentions deception + evidence but overshoots calibration', async () => {
    const r = await sAiClaimDetection.compute(
      withResponse('AI 说 MULTI 但代码 line 2 没有,AI 全是错的,AI 都不对。'),
    );
    expect(r.value).toBe(0.8);
  });

  it('tier 0.5 — mentions deception but no evidence', async () => {
    const r = await sAiClaimDetection.compute(
      withResponse('AI 提到 MULTI,但代码里没有,我看了一下应该没有这个。'),
    );
    expect(r.value).toBe(0.5);
  });

  it('tier 0.3 — cites evidence but misses the deception point', async () => {
    const r = await sAiClaimDetection.compute(
      withResponse('代码在 line 2 用了 SET NX 做锁,TTL 30 秒,看起来没问题。'),
    );
    expect(r.value).toBe(0.3);
  });

  it('tier 0.1 — misses both awareness and evidence', async () => {
    const r = await sAiClaimDetection.compute(withResponse('AI 说得对。'));
    expect(r.value).toBe(0.1);
  });
});

// ────────────────────────── registry integration ──────────────────────────

describe('registerAllSignals — Task 13a P0 registration', () => {
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
    return { get count() { return count; }, ids, registry };
  }

  it('registers 4 MC + 5 P0 + 10 MA + 23 MB + 4 MD + 1 SE = 47 signals (Task 13e closes the catalog)', () => {
    const r = makeRegistry();
    registerAllSignals(r.registry);
    expect(r.count).toBe(47);
    for (const id of [
      'sBeliefUpdateMagnitude',
      'sBaselineReading',
      'sAiCalibration',
      'sDecisionStyle',
      'sTechProfile',
      'sAiClaimDetection',
    ]) {
      expect(r.ids.has(id), id).toBe(true);
    }
  });

  it('no duplicate ids across P0 signals', () => {
    const ids = [
      sBaselineReading.id,
      sAiCalibration.id,
      sDecisionStyle.id,
      sTechProfile.id,
      sAiClaimDetection.id,
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('EXPECTED_SIGNAL_COUNT contract (47) unchanged', () => {
    expect(EXPECTED_SIGNAL_COUNT).toBe(47);
  });
});
