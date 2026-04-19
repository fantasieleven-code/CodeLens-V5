/**
 * Tests for services/modules/md.service.
 *
 * Covers:
 *   - persistModuleDSubmission writes 6 fields under metadata.moduleD preserving
 *     other top-level keys (mb, phase0, selfAssess, moduleA, moduleC, signalResults)
 *   - subModules[].interfaces optional: omitted when undefined, written when present
 *     (omit-vs-undefined matters for schema-strict downstream consumers)
 *   - last-write-wins on subsequent calls
 *   - missing session: no throw, no update
 *   - cross-Task isolation (Pattern H 6th gate prep): Task 22/23 mb.* +
 *     Task 24 selfAssess + Task 25 phase0.* + Task 26 moduleA.* survive an
 *     MD write without clobber
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V5ModuleDSubmission } from '@codelens-v5/shared';

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock('../../config/db.js', () => ({
  prisma: {
    session: {
      findUnique,
      update,
    },
  },
}));

import { persistModuleDSubmission } from './md.service.js';

const BASE_SUBMISSION: V5ModuleDSubmission = {
  subModules: [
    { name: 'gateway', responsibility: '入口鉴权 + 限流', interfaces: ['POST /v1/orders'] },
    { name: 'inventory', responsibility: '库存扣减原子化' },
  ],
  interfaceDefinitions: ['POST /v1/orders { skuId, qty } → { orderId }'],
  dataFlowDescription: 'gateway → inventory(Redis Lua) → MQ → fulfillment',
  constraintsSelected: ['high_throughput', 'eventual_consistency'],
  tradeoffText: '吞吐换强一致:Lua + 异步对账,代价是对账延迟 30s',
  aiOrchestrationPrompts: [
    '帮我列出秒杀场景下需要原子操作的步骤',
    '审视这个数据流是否有死锁风险',
  ],
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
});

describe('persistModuleDSubmission', () => {
  it('writes 6 fields under metadata.moduleD preserving other keys', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleC: [{ round: 1 }],
        signalResults: { sChallengeComplete: { value: 0.7 } },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleDSubmission('s1', BASE_SUBMISSION);

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 's1' });
    const meta = arg.data.metadata as Record<string, unknown>;
    expect(meta.moduleC).toEqual([{ round: 1 }]);
    expect(meta.signalResults).toEqual({ sChallengeComplete: { value: 0.7 } });
    expect(meta.moduleD).toEqual({
      subModules: BASE_SUBMISSION.subModules,
      interfaceDefinitions: BASE_SUBMISSION.interfaceDefinitions,
      dataFlowDescription: BASE_SUBMISSION.dataFlowDescription,
      constraintsSelected: BASE_SUBMISSION.constraintsSelected,
      tradeoffText: BASE_SUBMISSION.tradeoffText,
      aiOrchestrationPrompts: BASE_SUBMISSION.aiOrchestrationPrompts,
    });
  });

  it('omits subModules[].interfaces when undefined', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistModuleDSubmission('s1', {
      ...BASE_SUBMISSION,
      subModules: [{ name: 'svc', responsibility: 'r' }],
    });

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const md = meta.moduleD as { subModules: Array<Record<string, unknown>> };
    expect(Object.prototype.hasOwnProperty.call(md.subModules[0], 'interfaces')).toBe(false);
  });

  it('writes subModules[].interfaces when provided', async () => {
    findUnique.mockResolvedValueOnce({ metadata: {} });
    update.mockResolvedValueOnce({});

    await persistModuleDSubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const md = meta.moduleD as { subModules: Array<{ interfaces?: string[] }> };
    expect(md.subModules[0].interfaces).toEqual(['POST /v1/orders']);
    expect(Object.prototype.hasOwnProperty.call(md.subModules[1], 'interfaces')).toBe(false);
  });

  it('last write wins on subsequent calls', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        moduleD: {
          subModules: [{ name: 'old', responsibility: 'old' }],
          interfaceDefinitions: ['old-iface'],
          dataFlowDescription: 'old-flow',
          constraintsSelected: ['old-constraint'],
          tradeoffText: 'old-tradeoff',
          aiOrchestrationPrompts: ['old-prompt'],
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleDSubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const md = meta.moduleD as Record<string, unknown>;
    expect(md.subModules).toEqual(BASE_SUBMISSION.subModules);
    expect(md.tradeoffText).toEqual(BASE_SUBMISSION.tradeoffText);
    expect(md.aiOrchestrationPrompts).toEqual(BASE_SUBMISSION.aiOrchestrationPrompts);
  });

  it('cross-Task isolation: Task 22/23 mb.* + Task 24 selfAssess + Task 25 phase0.* + Task 26 moduleA.* survive MD write', async () => {
    findUnique.mockResolvedValueOnce({
      metadata: {
        mb: {
          editorBehavior: {
            aiCompletionEvents: [
              { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
            ],
            documentVisibilityEvents: [{ timestamp: 3, hidden: false }],
            testRuns: [{ timestamp: 4, passRate: 0.8, duration: 1500 }],
          },
          finalTestPassRate: 0.8,
          finalFiles: [{ path: 'src/main.py', content: 'print(1)' }],
          planning: { decomposition: 'x', dependencies: 'y', fallbackStrategy: 'z' },
        },
        selfAssess: { confidence: 0.7, reasoning: 'reflection' },
        phase0: {
          codeReading: { l1Answer: 'L1', l2Answer: 'L2', l3Answer: 'L3', confidence: 0.6 },
          aiOutputJudgment: [{ choice: 'A', reasoning: 'why' }],
          aiClaimVerification: { response: 'mismatch', submittedAt: 1700000000000 },
          decision: { choice: 'C', reasoning: '止血' },
        },
        moduleA: {
          round1: {
            schemeId: 'C',
            reasoning: 'C scheme',
            structuredForm: { scenario: 's', tradeoff: 't', decision: 'd', verification: 'v' },
            challengeResponse: 'cr',
          },
          round2: { markedDefects: [{ defectId: 'cand-1', commentType: 'bug', comment: 'x' }] },
          round3: { correctVersionChoice: 'success', diffAnalysis: 'd', diagnosisText: 'd' },
          round4: { response: 'r', submittedAt: 1700000000000, timeSpentSec: 60 },
        },
      },
    });
    update.mockResolvedValueOnce({});

    await persistModuleDSubmission('s1', BASE_SUBMISSION);

    const meta = update.mock.calls[0][0].data.metadata as Record<string, unknown>;
    const mb = meta.mb as Record<string, unknown>;
    expect(mb.finalTestPassRate).toBe(0.8);
    expect(mb.finalFiles).toEqual([{ path: 'src/main.py', content: 'print(1)' }]);
    expect((mb.editorBehavior as Record<string, unknown>).aiCompletionEvents).toEqual([
      { timestamp: 1, accepted: true, lineNumber: 5, completionLength: 12 },
    ]);
    expect(meta.selfAssess).toEqual({ confidence: 0.7, reasoning: 'reflection' });
    const phase0 = meta.phase0 as Record<string, unknown>;
    expect(phase0.decision).toEqual({ choice: 'C', reasoning: '止血' });
    const moduleA = meta.moduleA as Record<string, unknown>;
    expect((moduleA.round1 as Record<string, unknown>).schemeId).toBe('C');
    expect((moduleA.round4 as Record<string, unknown>).response).toBe('r');
    expect((meta.moduleD as Record<string, unknown>).tradeoffText).toBe(BASE_SUBMISSION.tradeoffText);
  });

  it('missing session: no throw, no update', async () => {
    findUnique.mockResolvedValueOnce(null);

    await expect(persistModuleDSubmission('missing', BASE_SUBMISSION)).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
