/**
 * Tests for getSessionContext() in mc-voice-chat.ts.
 *
 * getSessionContext is the V5 replacement for V4's exam-artifact context —
 * it reads V5Submissions directly off session.metadata, cites candidate
 * text with 200-char truncation, and is called on every Emma turn so it
 * must be pure + side-effect-free.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// mc-voice-chat.ts reads env at module load time (OpenAI client init). The
// server .env is loaded from packages/server/.env in prod; for unit tests
// we stub env so the module doesn't process.exit() when DATABASE_URL is
// absent from the test shell environment.
vi.mock('../config/env.js', () => ({
  env: {
    ARK_API_KEY: undefined,
    ARK_BASE_URL: 'https://example.test',
    ARK_MODEL_LITE: undefined,
    ARK_MODEL_PRO: undefined,
    DASHSCOPE_API_KEY: undefined,
    DASHSCOPE_BASE_URL: 'https://example.test',
    DASHSCOPE_MODEL: 'qwen3-coder-plus',
    JWT_SECRET: 'test-secret-123456',
    RTC_CALLBACK_SECRET: 'test-rtc-callback-secret-123456',
  },
}));

vi.mock('../config/db.js', () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
  },
}));

// Voice-chat service and LLM clients are imported at module load time;
// stub them so test runs don't try to hit Volcano / Ark.
vi.mock('../services/voice-chat.service.js', () => ({
  GPS_META_INSTRUCTION: '',
  CANDIDATE_QA_BOUNDARY: '',
}));

vi.mock('../services/mc-probe-engine.js', async () => {
  const actual = await vi.importActual<typeof import('../services/mc-probe-engine.js')>(
    '../services/mc-probe-engine.js',
  );
  return { ...actual };
});

import { getSessionContext } from './mc-voice-chat.js';
import { prisma } from '../config/db.js';
import type { V5Submissions } from '@codelens-v5/shared';

describe('getSessionContext — V5Submissions extraction', () => {
  beforeEach(() => {
    vi.mocked(prisma.session.findUnique).mockReset();
  });

  it('returns empty string when session has no metadata', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce(null as never);
    const ctx = await getSessionContext('missing');
    expect(ctx).toBe('');
  });

  it('emits Module A section with R1/R2/R3/R4 citations', async () => {
    const submissions: V5Submissions = {
      moduleA: {
        round1: {
          schemeId: 'B',
          reasoning: 'B 在持锁代价上比 A 低，业务语义更清晰。',
          structuredForm: {
            scenario: '高并发写入，批量提交 10k 行。',
            tradeoff: 'A 持锁久但强一致；B 分段提交但需 idempotency。',
            decision: '选 B，接受最终一致。',
            verification: '压测 500 QPS 验证 P99 在 80ms 内。',
          },
          challengeResponse: '我考虑过 A 但持锁成本不划算。',
        },
        round2: {
          markedDefects: [
            { defectId: 'd1', commentType: 'bug', comment: '批量提交缺 idempotency key' },
          ],
        },
        round3: {
          correctVersionChoice: 'success',
          diffAnalysis: '新版本加了重试 + 幂等表。',
          diagnosisText: '根因：B 版本在重试时产生了重复写入。',
        },
        round4: {
          response: '在 SaaS 多租场景下方案 B 仍然成立，但需要按租户分 key。',
          submittedAt: 0,
          timeSpentSec: 45,
        },
      },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ metadata: submissions } as never);

    const ctx = await getSessionContext('s1');
    expect(ctx).toContain('【Module A】');
    expect(ctx).toContain('R1 方案: B');
    expect(ctx).toContain('R1 理由原文:');
    expect(ctx).toContain('R1 场景:');
    expect(ctx).toContain('R1 权衡:');
    expect(ctx).toContain('R1 决策:');
    expect(ctx).toContain('R1 验证:');
    expect(ctx).toContain('R1 对抗回应:');
    expect(ctx).toContain('R2 标记缺陷: [d1]');
    expect(ctx).toContain('R3 正确版本: success');
    expect(ctx).toContain('R3 Diff 分析:');
    expect(ctx).toContain('R3 诊断原文:');
    expect(ctx).toContain('R4 迁移验证:');
  });

  it('emits Module B section with planning + pass rate + behavior summary', async () => {
    const submissions: V5Submissions = {
      mb: {
        planning: {
          decomposition: '先 CRUD，再 queue，最后审计。',
          dependencies: 'CRUD → queue → 审计。',
          fallbackStrategy: '队列挂掉回落到同步写入。',
        },
        editorBehavior: {
          aiCompletionEvents: [
            { timestamp: 0, accepted: true, lineNumber: 1, completionLength: 10 },
            { timestamp: 0, accepted: false, lineNumber: 2, completionLength: 20 },
          ],
          chatEvents: [{ timestamp: 0, prompt: 'help me', responseLength: 50, duration: 1 }],
          diffEvents: [{ timestamp: 0, accepted: true, linesAdded: 5, linesRemoved: 2 }],
          fileNavigationHistory: [],
          editSessions: [],
          testRuns: [{ timestamp: 0, passRate: 0.9, duration: 1 }],
        },
        finalFiles: [],
        finalTestPassRate: 0.85,
        standards: { rulesContent: 'RULES: 必须先写测试再写实现。' },
      },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ metadata: submissions } as never);

    const ctx = await getSessionContext('s1');
    expect(ctx).toContain('【Module B】');
    expect(ctx).toContain('MB 拆解:');
    expect(ctx).toContain('MB 依赖:');
    expect(ctx).toContain('MB Fallback:');
    expect(ctx).toContain('MB 测试通过率: 85%');
    expect(ctx).toContain('MB 行为摘要: 补全 2(采纳 1) | 对话 1 | Diff 1(采纳 1) | 测试运行 1');
    expect(ctx).toContain('MB RULES.md:');
  });

  it('emits self-assessment + reviewedDecisions', async () => {
    const submissions: V5Submissions = {
      selfAssess: {
        confidence: 72,
        reasoning: '我觉得 Module A 选型做得不错但缺陷诊断偏弱。',
        reviewedDecisions: ['MA-R1', 'MB-planning'],
      },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ metadata: submissions } as never);

    const ctx = await getSessionContext('s1');
    expect(ctx).toContain('【自评】');
    expect(ctx).toContain('自评信心: 72/100');
    expect(ctx).toContain('自评原文:');
    expect(ctx).toContain('回顾的决策: [MA-R1, MB-planning]');
  });

  it('truncates long text to 200 characters with ellipsis', async () => {
    const longText = '这是一段非常长的原文，'.repeat(30); // > 200 chars
    const submissions: V5Submissions = {
      moduleA: {
        round1: {
          schemeId: 'A',
          reasoning: longText,
          structuredForm: { scenario: '', tradeoff: '', decision: '', verification: '' },
          challengeResponse: '',
        },
        round2: { markedDefects: [] },
        round3: { correctVersionChoice: 'success', diffAnalysis: '', diagnosisText: '' },
        round4: { response: '', submittedAt: 0, timeSpentSec: 0 },
      },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ metadata: submissions } as never);

    const ctx = await getSessionContext('s1');
    // Find the R1 reasoning line and verify truncation.
    const reasoningLine = ctx.split('\n').find((l) => l.startsWith('R1 理由原文:')) || '';
    expect(reasoningLine.endsWith('…"')).toBe(true);
    // 200 chars + quotes + ellipsis — the quoted body has exactly 200 chars.
    const quoted = reasoningLine.match(/"([^"]*)"/)?.[1] ?? '';
    // quoted includes the trailing ellipsis char as part of the body.
    expect(quoted.endsWith('…')).toBe(true);
    expect([...quoted].length).toBeLessThanOrEqual(201);
  });

  it('handles partial submissions without throwing (only Phase 0 present)', async () => {
    const submissions: V5Submissions = {
      phase0: {
        codeReading: {
          l1Answer: '读取一个 CSV。',
          l2Answer: '流式处理避免 OOM。',
          l3Answer: '隐含约束：输入不能超过 1GB。',
          confidence: 60,
        },
        aiOutputJudgment: [],
        decision: { choice: 'stream', reasoning: '流式处理更稳。' },
      },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValueOnce({ metadata: submissions } as never);

    const ctx = await getSessionContext('s1');
    expect(ctx).toContain('【Phase 0】');
    expect(ctx).toContain('P0 L1:');
    expect(ctx).toContain('P0 L3:');
    expect(ctx).toContain('P0 信心: 60');
    expect(ctx).toContain('P0 决策原文:');
  });
});
