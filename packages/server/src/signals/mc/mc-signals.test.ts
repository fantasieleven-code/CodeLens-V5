/**
 * MC 3-signal tests — Task 13e.
 *
 * Covers sBoundaryAwareness / sCommunicationClarity / sReflectionDepth
 * against design-reference-full.md L1987-2118 formulas. Archetypes:
 *   Liam  — senior, acknowledges limits, structured, reflective.
 *   Steve — mid-level, brief, occasional markers.
 *   Max   — junior, low-depth, few markers.
 *
 * Each signal:
 *   1. metadata (id, dimension, moduleSource, isLLMWhitelist)
 *   2. null gating (< 3 rounds, empty mc, all sub-30)
 *   3. Liam > Steve > Max monotonicity
 *   4. specific formula edge cases
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type SignalInput,
  type V5ModuleCAnswer,
  type V5Submissions,
} from '@codelens-v5/shared';
import {
  sBoundaryAwareness,
  BOUNDARY_MARKERS,
  BOUNDARY_AWARENESS_VERSION,
} from './s-boundary-awareness.js';
import {
  sCommunicationClarity,
  STRUCTURE_MARKERS,
  COMMUNICATION_CLARITY_VERSION,
  extractTechnicalTerms,
  lengthScore,
} from './s-communication-clarity.js';
import {
  sReflectionDepth,
  REFLECTION_MARKERS,
  HIGH_DEPTH_MARKERS,
  REFLECTION_DEPTH_VERSION,
} from './s-reflection-depth.js';
import { countMarkers, substantiveAnswers } from './types.js';

function makeInput(submissions: V5Submissions): SignalInput {
  return {
    sessionId: 't',
    suiteId: 'full_stack',
    submissions,
    examData: {},
    participatingModules: [],
  };
}

function mc(round: number, answer: string, question = `Q${round}`): V5ModuleCAnswer {
  return { round, question, answer };
}

// ─── Archetypes ─────────────────────────────────────────────────────────

// Liam: 5 substantive answers, heavy boundary + structure + reflection + tech
const LIAM_MC: V5ModuleCAnswer[] = [
  mc(
    1,
    '这个方案我认为可行。首先我们用 PostgreSQL 做主存储，其次加 Redis 缓存层，' +
      '最后用 Kafka 做异步解耦。我觉得 p99 延迟能控制在 50ms 左右，但要看具体 QPS。',
  ),
  mc(
    2,
    '你这个问题很好。我承认我之前没想到这个边界情况。我的理解是在高并发场景下，' +
      '如果是单机容量达到上限，可能要考虑分片。不过取决于业务模型，我觉得先 ' +
      'vertical scale 到 8 核 32GB 更合理。',
  ),
  mc(
    3,
    '我觉得这里有几个因素需要权衡。原因是 B+树索引在写入密集场景下会有抖动，' +
      '方法上我会先用 LSM-Tree（RocksDB），结果评估 TPS 和 p95 后再决定。' +
      '其实之前没想到 write amplification 这个问题，这次的教训是要先做压测。',
  ),
  mc(
    4,
    '换个角度看，这个问题的核心是 consistency vs availability。我认为我们先做 ' +
      '最终一致性就够了，下次会主动考虑 CAP 定理。如果重来我会先画好状态机图。',
  ),
  mc(
    5,
    '最后总结一下。首先架构要支持水平扩展，其次监控要覆盖 p99 延迟，最后文档要 ' +
      '落地到 Confluence。如果是线上事故我会优先回滚。意识到这个流程之前我走过弯路。',
  ),
];

// Steve: 4 substantive answers, mid markers + structure
const STEVE_MC: V5ModuleCAnswer[] = [
  mc(
    1,
    '可以用 PostgreSQL 加上 Redis 缓存。首先考虑主从复制，应该能满足当前 QPS 需求。' +
      '应该没什么问题。',
  ),
  mc(
    2,
    '嗯这个我觉得要看具体场景。可能需要 sharding，但估计在 100 万用户之前用不到。',
  ),
  mc(
    3,
    '我认为用 Kafka 做消息队列合理。其次加个 retry 机制就好。',
  ),
  mc(4, '这个之前没考虑过。如果重来我会加更多监控。'),
  mc(5, '总结就是架构基本够用，后面再优化。'),
];

// Max: 5 answers but short / no markers / bare
const MAX_MC: V5ModuleCAnswer[] = [
  mc(1, '这个架构可以。用 MySQL 就行了。没什么问题，就这样吧。'),
  mc(2, '对的，就按这个做。我看别人都这样写，没毛病。'),
  mc(3, '感觉 OK，没什么要改的地方，就这样搞吧反正也能跑。'),
  mc(4, '可以，OK 的没问题就这样，别改了挺好的。'),
  mc(5, '就这样吧，都行，怎么都行反正最后都一样。'),
];

// ─── Metadata ───────────────────────────────────────────────────────────

describe('MC Task 13e — SignalDefinition metadata', () => {
  it('sBoundaryAwareness: Communication / MC / pure-rule', () => {
    expect(sBoundaryAwareness.id).toBe('sBoundaryAwareness');
    expect(sBoundaryAwareness.dimension).toBe(V5Dimension.COMMUNICATION);
    expect(sBoundaryAwareness.moduleSource).toBe('MC');
    expect(sBoundaryAwareness.isLLMWhitelist).toBe(false);
    expect(sBoundaryAwareness.fallback).toBeUndefined();
    expect(BOUNDARY_AWARENESS_VERSION).toBe('sBoundaryAwareness@v1');
  });

  it('sCommunicationClarity: Communication / MC / pure-rule', () => {
    expect(sCommunicationClarity.id).toBe('sCommunicationClarity');
    expect(sCommunicationClarity.dimension).toBe(V5Dimension.COMMUNICATION);
    expect(sCommunicationClarity.moduleSource).toBe('MC');
    expect(sCommunicationClarity.isLLMWhitelist).toBe(false);
    expect(COMMUNICATION_CLARITY_VERSION).toBe('sCommunicationClarity@v1');
  });

  it('sReflectionDepth: Metacognition / MC / pure-rule', () => {
    expect(sReflectionDepth.id).toBe('sReflectionDepth');
    expect(sReflectionDepth.dimension).toBe(V5Dimension.METACOGNITION);
    expect(sReflectionDepth.moduleSource).toBe('MC');
    expect(sReflectionDepth.isLLMWhitelist).toBe(false);
    expect(REFLECTION_DEPTH_VERSION).toBe('sReflectionDepth@v1');
  });
});

// ─── Shared helpers ─────────────────────────────────────────────────────

describe('MC shared helpers', () => {
  it('countMarkers counts overlapping occurrences via sliding index', () => {
    expect(countMarkers('可能，也许，可能', ['可能'])).toBe(2);
    expect(countMarkers('首先A其次B最后C', ['首先', '其次', '最后'])).toBe(3);
  });

  it('countMarkers tolerates empty markers + empty text', () => {
    expect(countMarkers('', ['首先'])).toBe(0);
    expect(countMarkers('foo', [''])).toBe(0);
  });

  it('substantiveAnswers drops sub-30 answers', () => {
    const ans = [mc(1, 'x'.repeat(29)), mc(2, 'y'.repeat(30)), mc(3, 'z'.repeat(100))];
    expect(substantiveAnswers(ans).map((a) => a.round)).toEqual([2, 3]);
  });
});

// ─── sBoundaryAwareness ─────────────────────────────────────────────────

describe('sBoundaryAwareness', () => {
  it('null when fewer than 3 MC rounds', async () => {
    const out = await sBoundaryAwareness.compute(
      makeInput({ moduleC: [mc(1, 'A'.repeat(60)), mc(2, 'B'.repeat(60))] }),
    );
    expect(out.value).toBeNull();
    expect(out.evidence).toEqual([]);
  });

  it('null when moduleC is undefined', async () => {
    const out = await sBoundaryAwareness.compute(makeInput({}));
    expect(out.value).toBeNull();
  });

  it('null when all answers below 30 chars', async () => {
    const out = await sBoundaryAwareness.compute(
      makeInput({
        moduleC: [mc(1, '短'), mc(2, '短'), mc(3, '短')],
      }),
    );
    expect(out.value).toBeNull();
  });

  it('zero value when no boundary markers, but still surfaces evidence', async () => {
    const out = await sBoundaryAwareness.compute(makeInput({ moduleC: MAX_MC }));
    expect(out.value).toBe(0);
    expect(out.evidence.length).toBeGreaterThan(0);
    expect(out.evidence[0].triggeredRule).toBe('no_boundary_markers');
  });

  it('Liam > Steve >= Max on boundary density', async () => {
    const liam = (await sBoundaryAwareness.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    const steve = (await sBoundaryAwareness.compute(makeInput({ moduleC: STEVE_MC }))).value!;
    const max = (await sBoundaryAwareness.compute(makeInput({ moduleC: MAX_MC }))).value!;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThanOrEqual(max);
  });

  it('min(1, avgMarkers/3) caps at 1.0 even with heavy marker density', async () => {
    const saturated = [
      mc(1, '可能 也许 估计 可能 也许 估计 可能 也许 估计'.padEnd(40, ' ')),
      mc(2, '可能 也许 估计 可能 也许 估计 可能 也许 估计'.padEnd(40, ' ')),
      mc(3, '可能 也许 估计 可能 也许 估计 可能 也许 估计'.padEnd(40, ' ')),
    ];
    const out = await sBoundaryAwareness.compute(makeInput({ moduleC: saturated }));
    expect(out.value).toBe(1);
  });

  it('evidence is capped at SIGNAL_EVIDENCE_LIMIT', async () => {
    const many: V5ModuleCAnswer[] = Array.from({ length: 8 }, (_, i) =>
      mc(i + 1, '可能 也许 估计 取决于 要看 没考虑过 理论上'.padEnd(40, ' ')),
    );
    const out = await sBoundaryAwareness.compute(makeInput({ moduleC: many }));
    expect(out.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
  });

  it('evidence source cites round-indexed MC answer', async () => {
    const out = await sBoundaryAwareness.compute(makeInput({ moduleC: LIAM_MC }));
    expect(out.evidence[0].source).toMatch(/submissions\.moduleC\.answers\[round=\d\]/);
  });

  it('uses design-reference boundary marker list verbatim', () => {
    expect(BOUNDARY_MARKERS).toContain('可能');
    expect(BOUNDARY_MARKERS).toContain('取决于');
    expect(BOUNDARY_MARKERS).toContain('没考虑过');
    expect(BOUNDARY_MARKERS).toContain('这个问题要看具体');
  });
});

// ─── sCommunicationClarity ──────────────────────────────────────────────

describe('sCommunicationClarity', () => {
  it('null when fewer than 3 MC rounds', async () => {
    const out = await sCommunicationClarity.compute(
      makeInput({ moduleC: [mc(1, 'A'.repeat(80)), mc(2, 'B'.repeat(80))] }),
    );
    expect(out.value).toBeNull();
  });

  it('null when all answers below 30 chars', async () => {
    const out = await sCommunicationClarity.compute(
      makeInput({ moduleC: [mc(1, '短'), mc(2, '短'), mc(3, '短')] }),
    );
    expect(out.value).toBeNull();
  });

  it('Liam > Steve >= Max on clarity', async () => {
    const liam = (await sCommunicationClarity.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    const steve = (await sCommunicationClarity.compute(makeInput({ moduleC: STEVE_MC }))).value!;
    const max = (await sCommunicationClarity.compute(makeInput({ moduleC: MAX_MC }))).value!;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThanOrEqual(max);
  });

  it('lengthScore: peak on [30,150]; decay above; linear below', () => {
    expect(lengthScore(30)).toBe(1);
    expect(lengthScore(150)).toBe(1);
    expect(lengthScore(100)).toBe(1);
    expect(lengthScore(15)).toBe(0.5);
    expect(lengthScore(300)).toBeCloseTo(0.5, 5);
    expect(lengthScore(450)).toBe(0);
    expect(lengthScore(1000)).toBe(0);
  });

  it('structure markers add to factor 2 (cap at 2 markers)', async () => {
    const withStructure = [
      mc(1, '首先这样，其次那样，最后总结。我们要考虑系统负载' + '。'.repeat(10)),
      mc(2, '首先这样，其次那样，最后总结。我们要考虑系统负载' + '。'.repeat(10)),
      mc(3, '首先这样，其次那样，最后总结。我们要考虑系统负载' + '。'.repeat(10)),
    ];
    const noStructure = [
      mc(1, '我们考虑系统负载和相关问题需要解决这里面存在挺多细节的需要花时间慢慢看慢慢整理'),
      mc(2, '我们考虑系统负载和相关问题需要解决这里面存在挺多细节的需要花时间慢慢看慢慢整理'),
      mc(3, '我们考虑系统负载和相关问题需要解决这里面存在挺多细节的需要花时间慢慢看慢慢整理'),
    ];
    const hi = (await sCommunicationClarity.compute(makeInput({ moduleC: withStructure }))).value!;
    const lo = (await sCommunicationClarity.compute(makeInput({ moduleC: noStructure }))).value!;
    expect(hi).toBeGreaterThan(lo);
  });

  it('extractTechnicalTerms counts DB/framework keywords + numeric units + CamelCase', () => {
    expect(extractTechnicalTerms('用 PostgreSQL + Redis 做架构')).toBeGreaterThanOrEqual(2);
    expect(extractTechnicalTerms('p99 延迟 50ms，qps 1000')).toBeGreaterThanOrEqual(2);
    expect(extractTechnicalTerms('React 和 Vue3')).toBeGreaterThanOrEqual(1);
    expect(extractTechnicalTerms('')).toBe(0);
  });

  it('clarity score is in [0,1]', async () => {
    for (const arc of [LIAM_MC, STEVE_MC, MAX_MC]) {
      const out = await sCommunicationClarity.compute(makeInput({ moduleC: arc }));
      expect(out.value).toBeGreaterThanOrEqual(0);
      expect(out.value).toBeLessThanOrEqual(1);
    }
  });

  it('uses design-reference structure marker list verbatim', () => {
    expect(STRUCTURE_MARKERS).toEqual(['首先', '其次', '最后', '另外', '原因', '方法', '结果']);
  });

  it('evidence per-round includes length/struct/tech breakdown in triggeredRule', async () => {
    const out = await sCommunicationClarity.compute(makeInput({ moduleC: LIAM_MC }));
    expect(out.evidence[0].triggeredRule).toMatch(/clarity_len=\d+_struct=\d+_tech=\d+/);
  });
});

// ─── sReflectionDepth ───────────────────────────────────────────────────

describe('sReflectionDepth', () => {
  it('null when fewer than 3 MC rounds', async () => {
    const out = await sReflectionDepth.compute(
      makeInput({ moduleC: [mc(1, 'A'.repeat(60)), mc(2, 'B'.repeat(60))] }),
    );
    expect(out.value).toBeNull();
  });

  it('null when all answers below 30 chars', async () => {
    const out = await sReflectionDepth.compute(
      makeInput({ moduleC: [mc(1, '短'), mc(2, '短'), mc(3, '短')] }),
    );
    expect(out.value).toBeNull();
  });

  it('zero value but evidence surfaced when no reflection markers', async () => {
    const out = await sReflectionDepth.compute(makeInput({ moduleC: MAX_MC }));
    expect(out.value).toBe(0);
    expect(out.evidence.length).toBeGreaterThan(0);
    expect(out.evidence[0].triggeredRule).toBe('no_reflection_markers');
  });

  it('Liam > Steve >= Max on reflection depth', async () => {
    const liam = (await sReflectionDepth.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    const steve = (await sReflectionDepth.compute(makeInput({ moduleC: STEVE_MC }))).value!;
    const max = (await sReflectionDepth.compute(makeInput({ moduleC: MAX_MC }))).value!;
    expect(liam).toBeGreaterThan(steve);
    expect(steve).toBeGreaterThanOrEqual(max);
  });

  it('high-depth markers yield 0.3 bonus per round that hits them', async () => {
    const base = [
      mc(1, '我认为这个方案整体可行，技术选型合理，后面照这个做即可走下去别的先不管'),
      mc(2, '对这几轮回答做一个反思，整体方向没什么大问题，可以按计划推进下去了没毛病'),
      mc(3, '整体看下来感觉质量还行，没有太多需要改动的地方跟之前预期差不多就这么搞'),
    ];
    const plusHighDepth = [
      mc(1, '我觉得这个方案不错。我错了，之前没想到并发问题，这次的教训是先测压，再验证质量。'),
      mc(2, '我觉得可以，但其实更好的做法是加监控覆盖全链路，我会重新考虑状态机设计质量保障。'),
      mc(3, '我觉得行，但意识到我错了，下次会主动做 code review 再合 PR，这次的教训要记住。'),
    ];
    const low = (await sReflectionDepth.compute(makeInput({ moduleC: base }))).value!;
    const high = (await sReflectionDepth.compute(makeInput({ moduleC: plusHighDepth }))).value!;
    expect(high).toBeGreaterThan(low);
  });

  it('value clamps to 1.0 even with high marker + high-depth density', async () => {
    const saturated = [
      mc(
        1,
        '我觉得我认为反思如果重来下次会学到了应该原本以为后来发现换个角度其实没想到意识到' +
          '我错了之前没想到这次的教训更好的做法我会重新考虑',
      ),
      mc(
        2,
        '我觉得我认为反思如果重来下次会学到了应该原本以为后来发现换个角度其实没想到意识到' +
          '我错了之前没想到这次的教训更好的做法我会重新考虑',
      ),
      mc(
        3,
        '我觉得我认为反思如果重来下次会学到了应该原本以为后来发现换个角度其实没想到意识到' +
          '我错了之前没想到这次的教训更好的做法我会重新考虑',
      ),
    ];
    const out = await sReflectionDepth.compute(makeInput({ moduleC: saturated }));
    expect(out.value).toBe(1);
  });

  it('V5 marker list is a superset of V4 baseline', () => {
    for (const v4 of ['我觉得', '我认为', '反思']) {
      expect(REFLECTION_MARKERS).toContain(v4);
    }
    for (const v5 of ['如果重来', '下次会', '学到了', '原本以为', '换个角度', '意识到']) {
      expect(REFLECTION_MARKERS).toContain(v5);
    }
  });

  it('high-depth marker list matches design-reference verbatim', () => {
    expect(HIGH_DEPTH_MARKERS).toEqual([
      '我错了',
      '之前没想到',
      '这次的教训',
      '更好的做法',
    ]);
  });

  it('evidence caps at SIGNAL_EVIDENCE_LIMIT', async () => {
    const many: V5ModuleCAnswer[] = Array.from({ length: 8 }, (_, i) =>
      mc(i + 1, '我觉得如果重来下次会学到了换个角度意识到'.padEnd(40, ' ')),
    );
    const out = await sReflectionDepth.compute(makeInput({ moduleC: many }));
    expect(out.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
  });
});

// ─── Liam/Steve/Max archetype calibration (senior / mid / junior) ──────

describe('MC archetype calibration', () => {
  it('Liam hits senior-level on all 3 MC signals (>= 0.5)', async () => {
    const boundary = (await sBoundaryAwareness.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    const clarity = (await sCommunicationClarity.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    const reflection = (await sReflectionDepth.compute(makeInput({ moduleC: LIAM_MC }))).value!;
    expect(boundary).toBeGreaterThan(0.3);
    expect(clarity).toBeGreaterThanOrEqual(0.5);
    expect(reflection).toBeGreaterThan(0.3);
  });

  it('Max hits near-zero on boundary + reflection (no markers)', async () => {
    expect((await sBoundaryAwareness.compute(makeInput({ moduleC: MAX_MC }))).value).toBe(0);
    expect((await sReflectionDepth.compute(makeInput({ moduleC: MAX_MC }))).value).toBe(0);
  });
});

// ─── Evidence Trace contract (Round 3 重构 1) ─────────────────────────

describe('Evidence Trace contract — MC Task 13e', () => {
  const signals = [sBoundaryAwareness, sCommunicationClarity, sReflectionDepth];

  it('all 3 signals cap evidence at SIGNAL_EVIDENCE_LIMIT', async () => {
    for (const s of signals) {
      const out = await s.compute(makeInput({ moduleC: LIAM_MC }));
      expect(out.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
    }
  });

  it('all 3 signals stamp algorithmVersion + computedAt', async () => {
    for (const s of signals) {
      const out = await s.compute(makeInput({ moduleC: LIAM_MC }));
      expect(out.algorithmVersion).toMatch(/^s\w+@v1$/);
      expect(out.computedAt).toBeGreaterThan(0);
    }
  });

  it('non-null value emits at least 1 evidence row', async () => {
    for (const s of signals) {
      const out = await s.compute(makeInput({ moduleC: LIAM_MC }));
      if (out.value !== null) {
        expect(out.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});
