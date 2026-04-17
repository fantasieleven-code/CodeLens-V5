/**
 * Task 13c MB signal suite — unit + Liam/Steve/Max calibration.
 *
 * Covers the 23 MB signals registered in Task 13c across 7 subdirectories:
 *   Stage 1 planning (aiEngineering, 3):
 *     sTaskDecomposition / sInterfaceDesign / sFailureAnticipation
 *   Stage 2 execution (aiEngineering, 3):
 *     sPromptQuality / sIterationEfficiency / sPrecisionFix
 *   Cursor behavior (aiEngineering, 6):
 *     sAiCompletionAcceptRate / sChatVsDirectRatio / sFileNavigationEfficiency /
 *     sTestFirstBehavior / sEditPatternQuality / sDecisionLatencyQuality
 *   Stage 2 quality (codeQuality, 5):
 *     sModifyQuality / sBlockSelectivity / sChallengeComplete /
 *     sVerifyDiscipline / sAiOutputReview
 *   Stage 3 standards + AI governance (codeQuality + aiEngineering, 4):
 *     sRulesQuality / sRulesCoverage / sRulesSpecificity / sAgentGuidance
 *   Horizontal writing (communication, 1): sWritingQuality
 *   Stage 4 audit (codeQuality, 1): sRuleEnforcement
 *
 * Three-archetype calibration mirrors v5-design-clarifications.md Part 5
 * L779-790: Liam (S) > Steve (A) > Max (C) on every MB signal.
 */

import { describe, expect, it } from 'vitest';
import {
  V5Dimension,
  type MBModuleSpecific,
  type SignalInput,
  type V5MBSubmission,
  type V5Submissions,
} from '@codelens-v5/shared';
import { sTaskDecomposition, TASK_DECOMPOSITION_VERSION } from './stage1/s-task-decomposition.js';
import { sInterfaceDesign, INTERFACE_DESIGN_VERSION } from './stage1/s-interface-design.js';
import {
  sFailureAnticipation,
  FAILURE_ANTICIPATION_VERSION,
} from './stage1/s-failure-anticipation.js';
import { sPromptQuality, PROMPT_QUALITY_VERSION } from './stage2-exec/s-prompt-quality.js';
import {
  sIterationEfficiency,
  ITERATION_EFFICIENCY_VERSION,
} from './stage2-exec/s-iteration-efficiency.js';
import { sPrecisionFix, PRECISION_FIX_VERSION } from './stage2-exec/s-precision-fix.js';
import {
  sAiCompletionAcceptRate,
  AI_COMPLETION_ACCEPT_RATE_VERSION,
} from './cursor/s-ai-completion-accept-rate.js';
import {
  sChatVsDirectRatio,
  CHAT_VS_DIRECT_RATIO_VERSION,
} from './cursor/s-chat-vs-direct-ratio.js';
import {
  sFileNavigationEfficiency,
  FILE_NAVIGATION_EFFICIENCY_VERSION,
} from './cursor/s-file-navigation-efficiency.js';
import { sTestFirstBehavior, TEST_FIRST_BEHAVIOR_VERSION } from './cursor/s-test-first-behavior.js';
import {
  sEditPatternQuality,
  EDIT_PATTERN_QUALITY_VERSION,
} from './cursor/s-edit-pattern-quality.js';
import {
  sDecisionLatencyQuality,
  DECISION_LATENCY_QUALITY_VERSION,
} from './cursor/s-decision-latency-quality.js';
import { sModifyQuality, MODIFY_QUALITY_VERSION } from './stage2-quality/s-modify-quality.js';
import {
  sBlockSelectivity,
  BLOCK_SELECTIVITY_VERSION,
} from './stage2-quality/s-block-selectivity.js';
import {
  sChallengeComplete,
  CHALLENGE_COMPLETE_VERSION,
} from './stage2-quality/s-challenge-complete.js';
import {
  sVerifyDiscipline,
  VERIFY_DISCIPLINE_VERSION,
} from './stage2-quality/s-verify-discipline.js';
import { sAiOutputReview, AI_OUTPUT_REVIEW_VERSION } from './stage2-quality/s-ai-output-review.js';
import { sRulesQuality, RULES_QUALITY_VERSION } from './stage3/s-rules-quality.js';
import { sRulesCoverage, RULES_COVERAGE_VERSION } from './stage3/s-rules-coverage.js';
import { sRulesSpecificity, RULES_SPECIFICITY_VERSION } from './stage3/s-rules-specificity.js';
import { sAgentGuidance, AGENT_GUIDANCE_VERSION } from './stage3/s-agent-guidance.js';
import { sWritingQuality, WRITING_QUALITY_VERSION } from './horizontal/s-writing-quality.js';
import { sRuleEnforcement, RULE_ENFORCEMENT_VERSION } from './stage4/s-rule-enforcement.js';

// ────────────────────────── exam fixture ──────────────────────────

const SESSION_START = 1_700_000_000_000;
const MB_EXAM: MBModuleSpecific = {
  featureRequirement: {
    description:
      '为库存系统的 InventoryRepository 增加 decrement(skuId, quantity) 方法,必须保证幂等性和线程安全,失败时回滚。',
    acceptanceCriteria: [
      'decrement 原子操作',
      '超卖返回错误不扣减',
      '幂等 — 相同 requestId 重复调用只扣一次',
      '失败日志包含 skuId + quantity',
      '事务边界清晰',
    ],
  },
  scaffold: {
    files: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    // TODO: implement atomic decrement',
          '    return;',
          '  }',
          '}',
        ].join('\n'),
        knownIssueLines: [3, 4],
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'import { InventoryRepository } from "./InventoryRepository";',
          'export class InventoryService {',
          '  constructor(private repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number) {',
          '    await this.repo.decrement(skuId, qty);',
          '  }',
          '}',
        ].join('\n'),
        knownIssueLines: [5],
      },
      {
        path: 'src/inventory/InventoryController.ts',
        content: ['export class InventoryController {}'].join('\n'),
      },
    ],
    tests: [
      {
        path: 'tests/inventory.test.ts',
        content: 'describe("InventoryRepository", () => { it.skip("atomic decrement") });',
        purpose: 'atomic decrement test',
      },
    ],
    dependencyOrder: [
      'src/inventory/InventoryRepository.ts',
      'src/inventory/InventoryService.ts',
      'src/inventory/InventoryController.ts',
    ],
  },
  harnessReference: {
    keyConstraints: ['atomic', 'idempotent', 'rollback_on_failure'],
    constraintCategories: ['correctness', 'reliability', 'observability'],
  },
  violationExamples: [
    {
      exampleIndex: 0,
      code: 'redis.decr(key); // no bound check',
      isViolation: true,
      violationType: 'correctness',
      explanation: 'decrement 没有边界检查,可能导致超卖 bug — 错误处理缺失,违反 validate 约束',
    },
    {
      exampleIndex: 1,
      code: 'redis.decr(key); logger.info("decremented");',
      isViolation: false,
      explanation: '正确实现,带日志记录 + 错误处理',
    },
    {
      exampleIndex: 2,
      code: '// skipped retry on DB error',
      isViolation: true,
      violationType: 'error_handling',
      explanation: '数据库错误处理缺失,应当重试或抛出 error — error handling + retry + timeout',
    },
  ],
};

// ────────────────────────── archetypes ──────────────────────────

interface MBArchetype {
  name: string;
  submission: V5MBSubmission;
}

const LIAM: MBArchetype = {
  name: 'Liam',
  submission: {
    planning: {
      decomposition: [
        '1. 阅读 InventoryRepository 当前 decrement 实现',
        '2. 在 InventoryRepository.decrement 中实现 Redis SETNX + Lua 脚本',
        '3. 更新 InventoryService.reduce 传递 requestId 做幂等',
        '4. 在 InventoryController 添加 validation',
        '5. 跑 tests/inventory.test.ts 验证',
      ].join('\n'),
      dependencies: [
        'InventoryRepository.decrement 需要调用 redis client',
        'InventoryService 依赖 InventoryRepository',
        'Controller 依赖 InventoryService',
      ].join('\n'),
      fallbackStrategy: [
        '如果 Redis 宕机:fallback 到 MySQL SELECT FOR UPDATE,但 QPS 下降,需要降级通知;',
        '如果 Lua 脚本执行超时:retry 3 次,仍失败则 rollback 并抛出 InventoryUnavailableError 触发熔断;',
        '监控告警在 timeout 或 recovery 场景下触发。',
      ].join(''),
      skipped: false,
      submittedAt: SESSION_START + 1_000,
    },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 10 }, (_, i) => ({
        timestamp: SESSION_START + 60_000 + i * 5_000,
        shown: true,
        accepted: i < 6,
        rejected: i >= 6,
        lineNumber: i + 3,
        completionLength: 40,
        shownAt: SESSION_START + 60_000 + i * 5_000,
        respondedAt: SESSION_START + 60_000 + i * 5_000 + 1_000,
        documentVisibleMs: 1_000,
      })),
      chatEvents: [
        {
          timestamp: SESSION_START + 100_000,
          prompt:
            'InventoryRepository.decrement has a TOCTOU race when used without a lock — because `redis.get` then `redis.set` is two commands, show me a SETNX-based implementation using Lua if the existing code calls redis directly. 检查 suspicious edge case.',
          responseLength: 400,
          duration: 3_000,
        },
        {
          timestamp: SESSION_START + 200_000,
          prompt:
            'Verify if InventoryService.reduce handles `undefined` qty as 0 — check the edge case so we do not silently skip. 因为 validation 缺失会导致 bug',
          responseLength: 200,
          duration: 2_000,
        },
        {
          timestamp: SESSION_START + 230_000,
          prompt:
            'Confirm InventoryController validates `skuId` against 40-char limit before calling service.reduce — I want to verify the boundary check when qty exceeds stock.',
          responseLength: 260,
          duration: 2_500,
        },
        {
          timestamp: SESSION_START + 260_000,
          prompt:
            'Check for bug in retry path: if `redis.eval` times out after 500ms does OversoldError propagate correctly or is it swallowed? 验证 wrong path.',
          responseLength: 300,
          duration: 2_500,
        },
      ],
      diffEvents: [
        {
          timestamp: SESSION_START + 110_000,
          accepted: true,
          linesAdded: 12,
          linesRemoved: 2,
        },
        {
          timestamp: SESSION_START + 210_000,
          accepted: false,
          linesAdded: 5,
          linesRemoved: 0,
        },
        {
          timestamp: SESSION_START + 240_000,
          accepted: true,
          linesAdded: 6,
          linesRemoved: 1,
        },
        {
          timestamp: SESSION_START + 270_000,
          accepted: true,
          linesAdded: 4,
          linesRemoved: 0,
        },
      ],
      fileNavigationHistory: [
        { timestamp: SESSION_START + 5_000, filePath: 'tests/inventory.test.ts', action: 'open' },
        {
          timestamp: SESSION_START + 15_000,
          filePath: 'src/inventory/InventoryRepository.ts',
          action: 'open',
        },
        {
          timestamp: SESSION_START + 30_000,
          filePath: 'src/inventory/InventoryService.ts',
          action: 'open',
        },
        {
          timestamp: SESSION_START + 45_000,
          filePath: 'src/inventory/InventoryController.ts',
          action: 'open',
        },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: SESSION_START + 60_000,
          endTime: SESSION_START + 120_000,
          keystrokeCount: 120,
        },
        {
          filePath: 'src/inventory/InventoryService.ts',
          startTime: SESSION_START + 130_000,
          endTime: SESSION_START + 180_000,
          keystrokeCount: 60,
        },
      ],
      testRuns: [
        { timestamp: SESSION_START + 125_000, passRate: 0.4, duration: 3_000 },
        { timestamp: SESSION_START + 190_000, passRate: 0.8, duration: 3_000 },
        { timestamp: SESSION_START + 250_000, passRate: 1.0, duration: 3_000 },
      ],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number, requestId: string): Promise<void> {',
          '    const script = "if redis.call(\'get\', KEYS[1]) >= ARGV[1] then return redis.call(\'decrby\', KEYS[1], ARGV[1]) else return -1 end";',
          '    const result = await this.redis.eval(script, 1, `stock:${skuId}`, quantity);',
          '    if (result === -1) throw new OversoldError(skuId);',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'import { InventoryRepository } from "./InventoryRepository";',
          'export class InventoryService {',
          '  constructor(private repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number, requestId: string) {',
          '    await this.repo.decrement(skuId, qty, requestId);',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryController.ts',
        content: ['export class InventoryController {}'].join('\n'),
      },
    ],
    finalTestPassRate: 1.0,
    standards: {
      rulesContent: [
        '# InventoryRepository rules',
        '1. 必须使用原子操作(Lua/SETNX)进行库存扣减,避免 TOCTOU 竞态 — 例如 `redis.eval`。',
        '2. 所有 decrement 必须包含 requestId 做幂等校验,500ms 超时自动重试最多 3 次。',
        '3. 错误处理必须使用 try/catch 包裹 Redis 调用,OversoldError 应当作为具体错误抛出。',
        '4. 日志必须记录 skuId + quantity,使用 logger.info 记录关键路径,不要直接 console.log。',
        '5. 测试覆盖率应 >= 80%,使用 mock Redis client 做 unit test,避免依赖外部服务。',
        '6. 如果调用方传入 undefined qty 应抛出 ValidationError(不要 silently skip 边界情况)。',
        '7. 函数命名清晰,单一职责,每个模块避免复杂度过高的嵌套逻辑,保持代码可维护性和可读性。',
      ].join('\n'),
      agentContent: [
        '# AGENT.md',
        '必须先读 tests/ 目录再修改代码。',
        '禁止在 production code 里留 TODO 注释超过 24 小时。',
        '使用工具时(redis/db client)必须检查 context 是否已注入,避免空指针。',
        '避免在单次 prompt 中同时修改 3 个以上文件,拆分 scope 更可控。',
        '例如,LLM 被要求 refactor 时,先 scope 到一个模块。',
      ].join('\n'),
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule_2' },
        { exampleIndex: 1, markedAsViolation: false },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule_2' },
      ],
    },
  },
};

const STEVE: MBArchetype = {
  name: 'Steve',
  submission: {
    planning: {
      decomposition: [
        '- 更新 InventoryRepository',
        '- 修改 service',
        '- 跑测试',
      ].join('\n'),
      dependencies: 'Service 依赖 Repository',
      fallbackStrategy: '如果失败就 retry 一下,超时回滚。',
      skipped: false,
      submittedAt: SESSION_START + 1_000,
    },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 8 }, (_, i) => ({
        timestamp: SESSION_START + 60_000 + i * 5_000,
        shown: true,
        accepted: i < 6,
        rejected: i >= 6,
        lineNumber: i + 3,
        completionLength: 40,
        shownAt: SESSION_START + 60_000 + i * 5_000,
        respondedAt: SESSION_START + 60_000 + i * 5_000 + 300,
        documentVisibleMs: 300,
      })),
      chatEvents: [
        {
          timestamp: SESSION_START + 100_000,
          prompt: '帮我改下 InventoryRepository',
          responseLength: 200,
          duration: 2_000,
        },
        {
          timestamp: SESSION_START + 150_000,
          prompt: '再加点日志',
          responseLength: 100,
          duration: 1_500,
        },
      ],
      diffEvents: [
        {
          timestamp: SESSION_START + 110_000,
          accepted: true,
          linesAdded: 8,
          linesRemoved: 1,
        },
      ],
      fileNavigationHistory: [
        {
          timestamp: SESSION_START + 10_000,
          filePath: 'src/inventory/InventoryController.ts',
          action: 'open',
        },
        {
          timestamp: SESSION_START + 40_000,
          filePath: 'src/inventory/InventoryRepository.ts',
          action: 'open',
        },
        {
          timestamp: SESSION_START + 200_000,
          filePath: 'tests/inventory.test.ts',
          action: 'open',
        },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: SESSION_START + 60_000,
          endTime: SESSION_START + 120_000,
          keystrokeCount: 40,
        },
      ],
      testRuns: [{ timestamp: SESSION_START + 200_000, passRate: 0.6, duration: 3_000 }],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    await this.redis.decr(`stock:${skuId}`);',
          '    return;',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryService.ts',
        content: [
          'import { InventoryRepository } from "./InventoryRepository";',
          'export class InventoryService {',
          '  constructor(private repo: InventoryRepository) {}',
          '  async reduce(skuId: string, qty: number) {',
          '    await this.repo.decrement(skuId, qty);',
          '  }',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/inventory/InventoryController.ts',
        content: ['export class InventoryController {}'].join('\n'),
      },
    ],
    finalTestPassRate: 0.6,
    standards: {
      rulesContent: [
        '需要注意性能',
        '应该加点日志',
        '尽量 retry 一下',
        '不要忘记测试',
      ].join('\n'),
    },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule_0' },
        { exampleIndex: 1, markedAsViolation: true },
        { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule_1' },
      ],
    },
  },
};

const MAX: MBArchetype = {
  name: 'Max',
  submission: {
    planning: { decomposition: '', dependencies: '', fallbackStrategy: '', skipped: true },
    editorBehavior: {
      aiCompletionEvents: Array.from({ length: 10 }, (_, i) => ({
        timestamp: SESSION_START + 60_000 + i * 5_000,
        shown: true,
        accepted: true,
        rejected: false,
        lineNumber: i,
        completionLength: 40,
        shownAt: SESSION_START + 60_000 + i * 5_000,
        respondedAt: SESSION_START + 60_000 + i * 5_000 + 50,
        documentVisibleMs: 50,
      })),
      chatEvents: Array.from({ length: 2 }, (_, i) => ({
        timestamp: SESSION_START + 100_000 + i * 10_000,
        prompt: 'fix it',
        responseLength: 50,
        duration: 1_000,
      })),
      diffEvents: [
        { timestamp: SESSION_START + 110_000, accepted: true, linesAdded: 3, linesRemoved: 0 },
        { timestamp: SESSION_START + 120_000, accepted: true, linesAdded: 2, linesRemoved: 0 },
      ],
      fileNavigationHistory: [
        {
          timestamp: SESSION_START + 10_000,
          filePath: 'src/inventory/InventoryController.ts',
          action: 'open',
        },
      ],
      editSessions: [
        {
          filePath: 'src/inventory/InventoryRepository.ts',
          startTime: SESSION_START + 60_000,
          endTime: SESSION_START + 65_000,
          keystrokeCount: 5,
        },
      ],
      testRuns: [],
    },
    finalFiles: [
      {
        path: 'src/inventory/InventoryRepository.ts',
        content: [
          'export class InventoryRepository {',
          '  async decrement(skuId: string, quantity: number): Promise<void> {',
          '    // TODO: implement atomic decrement',
          '    return;',
          '  }',
          '}',
        ].join('\n'),
      },
    ],
    finalTestPassRate: 0,
    standards: { rulesContent: '尽量写好点吧,注意代码质量,try to 合理,尽可能适当完成就行。' },
    audit: {
      violations: [
        { exampleIndex: 0, markedAsViolation: false },
        { exampleIndex: 1, markedAsViolation: true },
        { exampleIndex: 2, markedAsViolation: false },
      ],
    },
  },
};

function makeInput(archetype: MBArchetype, examOverride?: MBModuleSpecific): SignalInput {
  const submissions: V5Submissions = { mb: archetype.submission };
  return {
    sessionId: `session-${archetype.name}`,
    suiteId: 'full_stack',
    submissions,
    examData: { MB: (examOverride ?? MB_EXAM) as unknown as Record<string, unknown> },
    participatingModules: ['mb'],
  };
}

const ALL_SIGNALS = [
  sTaskDecomposition,
  sInterfaceDesign,
  sFailureAnticipation,
  sPromptQuality,
  sIterationEfficiency,
  sPrecisionFix,
  sAiCompletionAcceptRate,
  sChatVsDirectRatio,
  sFileNavigationEfficiency,
  sTestFirstBehavior,
  sEditPatternQuality,
  sDecisionLatencyQuality,
  sModifyQuality,
  sBlockSelectivity,
  sChallengeComplete,
  sVerifyDiscipline,
  sAiOutputReview,
  sRulesQuality,
  sRulesCoverage,
  sRulesSpecificity,
  sAgentGuidance,
  sWritingQuality,
  sRuleEnforcement,
];

// ────────────────────────── metadata ──────────────────────────

describe('MB signals — SignalDefinition metadata', () => {
  it('registers 23 MB signals all with moduleSource=MB and isLLMWhitelist=false', () => {
    expect(ALL_SIGNALS.length).toBe(23);
    for (const s of ALL_SIGNALS) {
      expect(s.moduleSource, s.id).toBe('MB');
      expect(s.isLLMWhitelist, s.id).toBe(false);
    }
  });

  it('dimensions split per backend-agent-tasks.md L93-114', () => {
    const ae = ALL_SIGNALS.filter((s) => s.dimension === V5Dimension.AI_ENGINEERING).map((s) => s.id);
    const cq = ALL_SIGNALS.filter((s) => s.dimension === V5Dimension.CODE_QUALITY).map((s) => s.id);
    const comm = ALL_SIGNALS.filter((s) => s.dimension === V5Dimension.COMMUNICATION).map((s) => s.id);

    expect(ae.sort()).toEqual(
      [
        'sTaskDecomposition',
        'sInterfaceDesign',
        'sFailureAnticipation',
        'sPromptQuality',
        'sIterationEfficiency',
        'sPrecisionFix',
        'sAiCompletionAcceptRate',
        'sChatVsDirectRatio',
        'sFileNavigationEfficiency',
        'sTestFirstBehavior',
        'sEditPatternQuality',
        'sDecisionLatencyQuality',
        'sAgentGuidance',
      ].sort(),
    );
    expect(cq.sort()).toEqual(
      [
        'sModifyQuality',
        'sBlockSelectivity',
        'sChallengeComplete',
        'sVerifyDiscipline',
        'sAiOutputReview',
        'sRulesQuality',
        'sRulesCoverage',
        'sRulesSpecificity',
        'sRuleEnforcement',
      ].sort(),
    );
    expect(comm).toEqual(['sWritingQuality']);
  });

  it('version constants follow @v1 convention', () => {
    expect(TASK_DECOMPOSITION_VERSION).toBe('sTaskDecomposition@v1');
    expect(INTERFACE_DESIGN_VERSION).toBe('sInterfaceDesign@v1');
    expect(FAILURE_ANTICIPATION_VERSION).toBe('sFailureAnticipation@v1');
    expect(PROMPT_QUALITY_VERSION).toBe('sPromptQuality@v1');
    expect(ITERATION_EFFICIENCY_VERSION).toBe('sIterationEfficiency@v1');
    expect(PRECISION_FIX_VERSION).toBe('sPrecisionFix@v1');
    expect(AI_COMPLETION_ACCEPT_RATE_VERSION).toBe('sAiCompletionAcceptRate@v1');
    expect(CHAT_VS_DIRECT_RATIO_VERSION).toBe('sChatVsDirectRatio@v1');
    expect(FILE_NAVIGATION_EFFICIENCY_VERSION).toBe('sFileNavigationEfficiency@v1');
    expect(TEST_FIRST_BEHAVIOR_VERSION).toBe('sTestFirstBehavior@v1');
    expect(EDIT_PATTERN_QUALITY_VERSION).toBe('sEditPatternQuality@v1');
    expect(DECISION_LATENCY_QUALITY_VERSION).toBe('sDecisionLatencyQuality@v1');
    expect(MODIFY_QUALITY_VERSION).toBe('sModifyQuality@v1');
    expect(BLOCK_SELECTIVITY_VERSION).toBe('sBlockSelectivity@v1');
    expect(CHALLENGE_COMPLETE_VERSION).toBe('sChallengeComplete@v1');
    expect(VERIFY_DISCIPLINE_VERSION).toBe('sVerifyDiscipline@v1');
    expect(AI_OUTPUT_REVIEW_VERSION).toBe('sAiOutputReview@v1');
    expect(RULES_QUALITY_VERSION).toBe('sRulesQuality@v1');
    expect(RULES_COVERAGE_VERSION).toBe('sRulesCoverage@v1');
    expect(RULES_SPECIFICITY_VERSION).toBe('sRulesSpecificity@v1');
    expect(AGENT_GUIDANCE_VERSION).toBe('sAgentGuidance@v1');
    expect(WRITING_QUALITY_VERSION).toBe('sWritingQuality@v1');
    expect(RULE_ENFORCEMENT_VERSION).toBe('sRuleEnforcement@v1');
  });
});

// ────────────────────────── fallbacks ──────────────────────────

describe('MB signals — null fallback when mb submission missing', () => {
  const input: SignalInput = {
    sessionId: 'empty',
    suiteId: 'full_stack',
    submissions: {},
    examData: { MB: MB_EXAM as unknown as Record<string, unknown> },
    participatingModules: [],
  };

  it('every signal returns value=null with empty evidence', async () => {
    for (const sig of ALL_SIGNALS) {
      const r = await sig.compute(input);
      expect(r.value, sig.id).toBeNull();
      expect(r.evidence, sig.id).toEqual([]);
    }
  });
});

describe('MB signals — exam-dependent signals null without exam', () => {
  const noExam: SignalInput = {
    sessionId: 'noexam',
    suiteId: 'full_stack',
    submissions: { mb: LIAM.submission },
    examData: {},
    participatingModules: ['mb'],
  };

  it('sInterfaceDesign / sFileNavigationEfficiency / sEditPatternQuality / sPrecisionFix / sRuleEnforcement null without exam', async () => {
    for (const sig of [
      sInterfaceDesign,
      sFileNavigationEfficiency,
      sEditPatternQuality,
      sPrecisionFix,
      sRuleEnforcement,
    ]) {
      const r = await sig.compute(noExam);
      expect(r.value, sig.id).toBeNull();
    }
  });
});

// ────────────────────────── archetype monotonicity ──────────────────────────

describe('Liam (S) > Steve (A) >= Max (C) monotonicity — all MB signals', () => {
  // sAgentGuidance can legitimately be null for Steve/Max who never wrote
  // AGENT.md (optional). Monotonicity checks skip null-on-null pairs.
  for (const sig of ALL_SIGNALS) {
    it(`${sig.id}: Liam >= Steve >= Max`, async () => {
      const liam = await sig.compute(makeInput(LIAM));
      const steve = await sig.compute(makeInput(STEVE));
      const max = await sig.compute(makeInput(MAX));

      const liamVal = liam.value;
      const steveVal = steve.value;
      const maxVal = max.value;

      if (liamVal !== null && steveVal !== null) {
        expect(liamVal, `${sig.id} liam>=steve`).toBeGreaterThanOrEqual(steveVal);
      }
      if (steveVal !== null && maxVal !== null) {
        expect(steveVal, `${sig.id} steve>=max`).toBeGreaterThanOrEqual(maxVal);
      }
      if (liamVal !== null && maxVal !== null) {
        expect(liamVal, `${sig.id} liam>max`).toBeGreaterThan(maxVal);
      }
    });
  }
});

// ────────────────────────── calibration — Liam should score well ──────────────────────────

describe('Liam calibration — senior-level scores on core MB signals', () => {
  it('sTaskDecomposition Liam >= 0.7 (5+ ordered steps + scaffold refs)', async () => {
    const r = await sTaskDecomposition.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.7);
  });

  it('sPromptQuality Liam >= 0.7 (long + specific + contextual prompts)', async () => {
    const r = await sPromptQuality.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.7);
  });

  it('sAiCompletionAcceptRate Liam >= 0.95 (rate=0.6 hits peak)', async () => {
    const r = await sAiCompletionAcceptRate.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.95);
  });

  it('sFileNavigationEfficiency Liam reads bottom-up (high Kendall tau)', async () => {
    const r = await sFileNavigationEfficiency.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.8);
  });

  it('sTestFirstBehavior Liam = 1.0 (tests opened within 60s)', async () => {
    const r = await sTestFirstBehavior.compute(makeInput(LIAM));
    expect(r.value).toBe(1.0);
  });

  it('sChallengeComplete Liam >= 0.8 (pass rate 1.0)', async () => {
    const r = await sChallengeComplete.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.8);
  });

  it('sRulesCoverage Liam covers all 5 categories', async () => {
    const r = await sRulesCoverage.compute(makeInput(LIAM));
    expect(r.value).toBe(1.0);
  });
});

describe('Max calibration — junior-level / skipped signals', () => {
  it('sTaskDecomposition Max returns low score or null (skipped)', async () => {
    const r = await sTaskDecomposition.compute(makeInput(MAX));
    expect(r.value === null || r.value < 0.2).toBe(true);
  });

  it('sAiCompletionAcceptRate Max = 0.36 (rate=1.0 → 1 - 4*(0.4)^2 = 0.36)', async () => {
    const r = await sAiCompletionAcceptRate.compute(makeInput(MAX));
    expect(r.value!).toBeGreaterThanOrEqual(0.35);
    expect(r.value!).toBeLessThanOrEqual(0.37);
  });

  it('sTestFirstBehavior Max = 0 (never opens tests)', async () => {
    const r = await sTestFirstBehavior.compute(makeInput(MAX));
    expect(r.value).toBe(0);
  });

  it('sChallengeComplete Max = 0 (pass rate 0, no test runs)', async () => {
    const r = await sChallengeComplete.compute(makeInput(MAX));
    expect(r.value).toBe(0);
  });

  it('sVerifyDiscipline Max = 0 (no test runs)', async () => {
    const r = await sVerifyDiscipline.compute(makeInput(MAX));
    expect(r.value).toBe(0);
  });
});

// ────────────────────────── Cursor inverse-U curves ──────────────────────────

describe('Cursor signals — inverse-U curve boundary tests', () => {
  function completionsWithRate(n: number, acceptRate: number): V5MBSubmission {
    const accepted = Math.round(n * acceptRate);
    return {
      editorBehavior: {
        aiCompletionEvents: Array.from({ length: n }, (_, i) => ({
          timestamp: SESSION_START + i,
          shown: true,
          accepted: i < accepted,
          rejected: i >= accepted,
          lineNumber: i,
          completionLength: 10,
          shownAt: SESSION_START + i,
          respondedAt: SESSION_START + i + 1_000,
          documentVisibleMs: 1_000,
        })),
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
      finalFiles: [],
      finalTestPassRate: 0,
    };
  }

  it('sAiCompletionAcceptRate null when shown < 5', async () => {
    const r = await sAiCompletionAcceptRate.compute(
      makeInput({ name: 'low', submission: completionsWithRate(4, 0.5) }),
    );
    expect(r.value).toBeNull();
  });

  it('sAiCompletionAcceptRate peak at rate=0.6 → 1.0', async () => {
    const r = await sAiCompletionAcceptRate.compute(
      makeInput({ name: 'peak', submission: completionsWithRate(10, 0.6) }),
    );
    expect(r.value).toBe(1.0);
  });

  it('sAiCompletionAcceptRate rate=1.0 → 0.36 (blind accept)', async () => {
    const r = await sAiCompletionAcceptRate.compute(
      makeInput({ name: 'blind', submission: completionsWithRate(10, 1.0) }),
    );
    expect(r.value!).toBeCloseTo(0.36, 2);
  });

  it('sAiCompletionAcceptRate rate=0 → 0 (over-reject clamped)', async () => {
    const r = await sAiCompletionAcceptRate.compute(
      makeInput({ name: 'fear', submission: completionsWithRate(10, 0) }),
    );
    expect(r.value).toBe(0);
  });
});

// ────────────────────────── sDecisionLatencyQuality bands ──────────────────────────

describe('sDecisionLatencyQuality — 4 bands per clarifications L540-546', () => {
  function latencyEvents(
    latencies: number[],
  ): V5MBSubmission {
    return {
      editorBehavior: {
        aiCompletionEvents: latencies.map((ms, i) => ({
          timestamp: SESSION_START + i,
          shown: true,
          accepted: true,
          lineNumber: i,
          completionLength: 10,
          shownAt: SESSION_START + i,
          respondedAt: SESSION_START + i + ms,
          documentVisibleMs: ms,
        })),
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [],
        editSessions: [],
        testRuns: [],
      },
      finalFiles: [],
      finalTestPassRate: 0,
    };
  }

  it('null when < 5 valid events', async () => {
    const r = await sDecisionLatencyQuality.compute(
      makeInput({ name: 'low', submission: latencyEvents([800, 800, 800]) }),
    );
    expect(r.value).toBeNull();
  });

  it('S band (1.0) when >=50% in 500-2000ms and <=20% tooFast', async () => {
    const r = await sDecisionLatencyQuality.compute(
      makeInput({ name: 'S', submission: latencyEvents([800, 1000, 1500, 1800, 1200]) }),
    );
    expect(r.value).toBe(1.0);
  });

  it('C band (0.2) when >=70% tooFast', async () => {
    const r = await sDecisionLatencyQuality.compute(
      makeInput({ name: 'C', submission: latencyEvents([50, 100, 200, 300, 400, 450, 4500]) }),
    );
    expect(r.value).toBe(0.2);
  });

  it('A band (0.7) when goodRangeRatio >= 0.3 && tooFastRatio <= 0.4', async () => {
    const r = await sDecisionLatencyQuality.compute(
      makeInput({
        name: 'A',
        submission: latencyEvents([800, 1200, 300, 3000, 3500, 3000]),
      }),
    );
    expect(r.value).toBe(0.7);
  });
});

// ────────────────────────── sRuleEnforcement branches ──────────────────────────

describe('sRuleEnforcement — audit accuracy branches', () => {
  it('Liam scores high (3/3 marks correct + rule matches)', async () => {
    const r = await sRuleEnforcement.compute(makeInput(LIAM));
    expect(r.value!).toBeGreaterThanOrEqual(0.6);
  });

  it('null when audit missing', async () => {
    const sub: V5MBSubmission = { ...LIAM.submission, audit: undefined };
    const r = await sRuleEnforcement.compute(makeInput({ name: 'noaudit', submission: sub }));
    expect(r.value).toBeNull();
  });
});

// ────────────────────────── Kendall tau via edit + nav ──────────────────────────

describe('Kendall tau — navigation order drives score', () => {
  it('perfectly ordered navigation → score = 1.0', async () => {
    const sub: V5MBSubmission = {
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [
          { timestamp: 1, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
          { timestamp: 2, filePath: 'src/inventory/InventoryService.ts', action: 'open' },
          { timestamp: 3, filePath: 'src/inventory/InventoryController.ts', action: 'open' },
        ],
        editSessions: [],
        testRuns: [],
      },
      finalFiles: [],
      finalTestPassRate: 0,
    };
    const r = await sFileNavigationEfficiency.compute(
      makeInput({ name: 'perfect', submission: sub }),
    );
    expect(r.value).toBe(1.0);
  });

  it('reversed navigation → score = 0', async () => {
    const sub: V5MBSubmission = {
      editorBehavior: {
        aiCompletionEvents: [],
        chatEvents: [],
        diffEvents: [],
        fileNavigationHistory: [
          { timestamp: 1, filePath: 'src/inventory/InventoryController.ts', action: 'open' },
          { timestamp: 2, filePath: 'src/inventory/InventoryService.ts', action: 'open' },
          { timestamp: 3, filePath: 'src/inventory/InventoryRepository.ts', action: 'open' },
        ],
        editSessions: [],
        testRuns: [],
      },
      finalFiles: [],
      finalTestPassRate: 0,
    };
    const r = await sFileNavigationEfficiency.compute(
      makeInput({ name: 'reversed', submission: sub }),
    );
    expect(r.value).toBe(0);
  });
});
