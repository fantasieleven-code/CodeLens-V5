/**
 * Tests for sBeliefUpdateMagnitude (Round 3 Part 3 调整 3).
 *
 * The 6-tier scoring table is tested exhaustively, plus the two documented
 * examples from v5-design-clarifications.md Round 3 Part 5 ("Liam" and
 * "Steve" archetypes). Evidence shape is checked for cap and source paths.
 */

import { describe, expect, it } from 'vitest';
import {
  SIGNAL_EVIDENCE_LIMIT,
  V5Dimension,
  type SignalInput,
  type V5Submissions,
} from '@codelens-v5/shared';
import {
  computeBeliefUpdateMagnitude,
  sBeliefUpdateMagnitude,
  BELIEF_UPDATE_MAGNITUDE_VERSION,
} from './s-belief-update-magnitude.js';

function makeInput(submissions: V5Submissions): SignalInput {
  return {
    sessionId: 'test-session',
    suiteId: 'full_stack',
    submissions,
    examData: {},
    participatingModules: [],
  };
}

function mc(
  round: number,
  question: string,
  answer: string,
): V5Submissions['moduleC'] extends (infer T)[] | undefined ? T : never {
  return { round, question, answer } as never;
}

describe('sBeliefUpdateMagnitude — SignalDefinition metadata', () => {
  it('advertises METACOGNITION dimension and MC source', () => {
    expect(sBeliefUpdateMagnitude.id).toBe('sBeliefUpdateMagnitude');
    expect(sBeliefUpdateMagnitude.dimension).toBe(V5Dimension.METACOGNITION);
    expect(sBeliefUpdateMagnitude.moduleSource).toBe('MC');
    expect(sBeliefUpdateMagnitude.isLLMWhitelist).toBe(false);
  });

  it('algorithm version is pinned (Task 11 baseline)', () => {
    expect(BELIEF_UPDATE_MAGNITUDE_VERSION).toBe('sBeliefUpdateMagnitude@v1');
  });
});

describe('sBeliefUpdateMagnitude — fallback cases', () => {
  it('returns null + empty evidence when moduleC is missing', async () => {
    const result = await computeBeliefUpdateMagnitude(makeInput({}));
    expect(result.value).toBeNull();
    expect(result.evidence).toEqual([]);
  });

  it('returns null when moduleC exists but has no round=2 entry', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(1, '第1轮问题', '第1轮回答'),
          mc(3, '第3轮问题', '第3轮回答'),
        ],
      }),
    );
    expect(result.value).toBeNull();
    expect(result.evidence).toEqual([]);
  });

  it('returns null when round=2 answer is empty', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [mc(2, 'Emma 挑战', '')],
      }),
    );
    expect(result.value).toBeNull();
  });
});

describe('sBeliefUpdateMagnitude — 6-tier scoring table (Round 3 Part 3 L462-L467)', () => {
  // The 80-char threshold (see s-belief-update-magnitude.ts scoreBeliefUpdate)
  // disqualifies short answers from hasSpecificFix — full/strong tiers need
  // a substantive response.
  const longFullAnswer =
    '你说得对，我之前没想到并发下这个方案会把内存放大到 OOM，这是我考虑得不够的地方。但是核心观点还在：读写分离仍然是正确方向。应该改为先用队列削峰到 1000 QPS 以下再写库，并在消费侧加幂等检查。这样既保留了原来的读扩展性，也不会在高并发下把连接池耗光。';

  it('tier=full (1.0): belief + defense + specific fix + subsequent coherence', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(2, 'Emma: 你的方案在并发下会 OOM 吗？', longFullAnswer),
          mc(3, 'Emma: 展开讲', '基于 R2 的修正，我们在限流之外再加背压。'),
        ],
      }),
    );
    expect(result.value).toBe(1.0);
    const tierEvidence = result.evidence.find((e) => e.source === 'tier');
    expect(tierEvidence?.excerpt).toContain('tier=full');
  });

  it('tier=strong (0.85): belief + defense + specific fix (no R3+ coherence)', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(2, 'Emma: 你的方案在并发下会 OOM 吗？', longFullAnswer),
          mc(3, 'Emma: 展开讲', '嗯，确实是这样。'),
        ],
      }),
    );
    expect(result.value).toBe(0.85);
    const tier = result.evidence.find((e) => e.source === 'tier');
    expect(tier?.excerpt).toContain('tier=strong');
  });

  it('tier=moderate (0.7): belief + defense but no specific fix', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(
            2,
            'Emma: 你的方案在并发下会 OOM 吗？',
            '你说得对，我之前没想到这种情况，但是方案 B 的核心观点仍然成立。',
          ),
        ],
      }),
    );
    expect(result.value).toBe(0.7);
    const tier = result.evidence.find((e) => e.source === 'tier');
    expect(tier?.excerpt).toContain('tier=moderate');
  });

  it('tier=surface (0.3): belief update but no defense (全盘放弃)', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(2, 'Emma: 你的方案在并发下会 OOM 吗？', '你说得对，我之前没想到，那就换方案吧。'),
        ],
      }),
    );
    expect(result.value).toBe(0.3);
    const tier = result.evidence.find((e) => e.source === 'tier');
    expect(tier?.excerpt).toContain('tier=surface');
  });

  it('tier=entrenched (0.4): defense but no belief update (固执)', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(
            2,
            'Emma: 你的方案在并发下会 OOM 吗？',
            '但是我觉得这不是问题，核心观点没有动摇，继续按方案 B。',
          ),
        ],
      }),
    );
    expect(result.value).toBe(0.4);
    const tier = result.evidence.find((e) => e.source === 'tier');
    expect(tier?.excerpt).toContain('tier=entrenched');
  });

  it('tier=none (0.15): neither belief update nor defense', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [mc(2, 'Emma 挑战', '嗯，这个我得想一下。')],
      }),
    );
    expect(result.value).toBe(0.15);
    const tier = result.evidence.find((e) => e.source === 'tier');
    expect(tier?.excerpt).toContain('tier=none');
  });
});

describe('sBeliefUpdateMagnitude — evidence shape', () => {
  it('caps evidence to SIGNAL_EVIDENCE_LIMIT', async () => {
    const specificFixSentence =
      '。应该改为每 100 行做一次批量提交，这样既保证原子性也不会撑爆内存。';
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(2, 'Emma 挑战', `你说得对，我之前没想到，但是核心观点还在${specificFixSentence}`),
          mc(3, 'Emma 追问', '基于 R2 的修正，我们继续。'),
        ],
      }),
    );
    expect(result.evidence.length).toBeLessThanOrEqual(SIGNAL_EVIDENCE_LIMIT);
  });

  it('cites the round=2 answer as source for belief + defense evidence', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(2, 'Emma 挑战', '你说得对，我之前没想到，但是核心观点仍然成立。'),
        ],
      }),
    );
    const beliefRules = result.evidence.filter((e) =>
      e.triggeredRule?.startsWith('belief_marker:'),
    );
    const defenseRules = result.evidence.filter((e) =>
      e.triggeredRule?.startsWith('defense_marker:'),
    );
    expect(beliefRules.length).toBe(1);
    expect(beliefRules[0].source).toBe('submissions.moduleC[round=2].answer');
    expect(defenseRules.length).toBe(1);
    expect(defenseRules[0].source).toBe('submissions.moduleC[round=2].answer');
  });

  it('records a scoring_tier evidence row with tier label', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({ moduleC: [mc(2, 'Emma', '嗯。')] }),
    );
    const tier = result.evidence.find((e) => e.triggeredRule === 'scoring_tier');
    expect(tier).toBeDefined();
    expect(tier?.source).toBe('tier');
  });
});

describe('sBeliefUpdateMagnitude — v5-design-clarifications Round 3 Part 5 archetypes', () => {
  // Liam: belief update + defense + specific fix → tier=strong (0.85)
  it('Liam-like response (update + defend + fix) scores ≥ 0.85', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(
            2,
            'Emma: 你的 SQL 在百万行下会打爆连接池，怎么办？',
            '你提的对，我刚才用词不精确——单次读整表在大表下确实会把连接池里的 20 条长链接占满，然后其他请求就被阻塞。但是核心方案 B 的思路还在：应该改为按主键分页 + 每 1000 行一批，并且在每批之间 yield 一次事件循环。这样连接释放足够快，也保留了读的一致性。',
          ),
        ],
      }),
    );
    expect(result.value).toBeGreaterThanOrEqual(0.85);
  });

  // Steve: belief update without defense → tier=surface (0.3). Represents
  // "entire stance abandoned", a weaker signal than entrenched or moderate.
  it('Steve-like response (update without defending core) scores ≈ 0.3', async () => {
    const result = await computeBeliefUpdateMagnitude(
      makeInput({
        moduleC: [
          mc(
            2,
            'Emma: 你的 SQL 在百万行下会打爆连接池，怎么办？',
            '你说得对，我没考虑到这一点，那方案 B 不成立了吧，我换方案 A 吧。',
          ),
        ],
      }),
    );
    expect(result.value).toBe(0.3);
  });
});
