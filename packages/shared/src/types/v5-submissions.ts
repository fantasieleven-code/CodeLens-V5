/**
 * V5 各模块的候选人提交数据类型。
 *
 * 修正 4：V5Submissions 的 ModuleC 字段名由 `modulec` 改为 `moduleC`，和其他模块 camelCase 一致。
 *   Socket 事件前缀 `v5:modulec:*` 保持小写（外部协议约定不动）。
 * 多 Agent 预留 3：V5MBSubmission 增加 agentExecutions 可选字段，V5.0 恒为 undefined，V5.2 再填。
 */

// ───────────────────────────── P0 ─────────────────────────────

export interface V5Phase0Submission {
  codeReading: {
    /** L1：代码在做什么（表面理解）。 */
    l1Answer: string;
    /** L2：关键设计决策（中层理解）。 */
    l2Answer: string;
    /** L3：隐含约束 / 失败场景（深层理解）。 */
    l3Answer: string;
    confidence: number;
  };
  /** 2 题 AI 输出判断，复用 Step 5 success/failed 代码缩略版。 */
  aiOutputJudgment: Array<{
    choice: 'A' | 'B' | 'both_good' | 'both_bad';
    reasoning: string;
  }>;
  /**
   * Round 2 Part 3 调整 1 (v5-design-clarifications.md L191-210) — candidate's
   * verification of an AI-generated code + explanation block where the
   * explanation deliberately misrepresents one feature. Source for
   * `sAiClaimDetection.candidateResponse`.
   *
   * Retroactive addition that should have shipped with Task 11; the client
   * previously bridged this via `inputBehavior.aiClaimVerification` with a
   * TODO(task-11) marker in Phase0Page.tsx.
   */
  aiClaimVerification: {
    response: string;
    submittedAt: number;
  };
  decision: {
    choice: string;
    reasoning: string;
  };
  inputBehavior?: Record<string, unknown>;
}

// ───────────────────────────── MA ─────────────────────────────

export interface V5ModuleASubmission {
  round1: {
    schemeId: 'A' | 'B' | 'C';
    reasoning: string;
    structuredForm: {
      /** 字段命名从 signal-engine 视角选定，不改为 "requirement"。 */
      scenario: string;
      tradeoff: string;
      decision: string;
      verification: string;
    };
    /** 对抗环节：面试官挑战候选人选择后，候选人的回应文本。 */
    challengeResponse: string;
  };
  round2: {
    markedDefects: Array<{
      defectId: string;
      /**
       * Candidate-facing UI submits the reviewed line number. Server-side
       * persistence maps this to canonical examData.MA.defects[].defectId so
       * the frontend does not need the answer key.
       */
      line?: number;
      commentType: 'bug' | 'suggestion' | 'question' | 'nit';
      comment: string;
      fixSuggestion?: string;
    }>;
    inputBehavior?: Record<string, unknown>;
  };
  round3: {
    correctVersionChoice: 'success' | 'failed';
    diffAnalysis: string;
    diagnosisText: string;
  };
  /**
   * R4 迁移验证(新增轮次)。
   *
   * 候选人在"相关但业务不同"的新场景下,回答 R1 选的方案是否仍成立 +
   * 哪些参数需要调整。sPrincipleAbstraction 信号的输入来源。
   *
   * 字段 shape 定稿于 docs/v5-planning/v5-design-clarifications.md
   * Round 3 Part 3 调整 2 L358-372。
   */
  round4: {
    response: string;
    submittedAt: number;
    timeSpentSec: number;
  };
}

// ───────────────────────────── MB ─────────────────────────────

export interface V5MBPlanning {
  decomposition: string;
  dependencies: string;
  fallbackStrategy: string;
  submittedAt?: number;
  skipped?: boolean;
}

export interface V5MBLegacyRound {
  round: number;
  prompt: string;
  aiText: string;
  appliedBlocks: Array<{ blockIndex: number }>;
}

/**
 * V5MBEditorBehavior — Cursor-mode behavior aggregate.
 *
 * Round 2 Part 3 调整 4 (v5-design-clarifications.md L550-588) added:
 *   - aiCompletionEvents[]: shown / rejected / shownAt / respondedAt /
 *     documentVisibleMs — supports sDecisionLatencyQuality (MB 17→18 signal).
 *   - chatEvents[]: diffShownAt / diffRespondedAt / documentVisibleMs — same.
 *   - documentVisibilityEvents (top-level) — frontend emits on
 *     visibilitychange so backend can compute visible-time slices.
 *
 * All new fields optional to keep Task 11 legacy snapshots parseable.
 */
export interface V5MBEditorBehavior {
  aiCompletionEvents: Array<{
    timestamp: number;
    accepted: boolean;
    lineNumber: number;
    completionLength: number;
    /** 调整 4: completion was shown to candidate (reject-by-keep-typing path still sets this true). */
    shown?: boolean;
    /** 调整 4: explicit reject (Esc pressed or continued typing past completion). */
    rejected?: boolean;
    /** 调整 4: when the completion popup became visible. */
    shownAt?: number;
    /** 调整 4: when the candidate accepted or rejected (or moved on). */
    respondedAt?: number;
    /** 调整 4: ms between shownAt and respondedAt during which document was visible. */
    documentVisibleMs?: number;
  }>;
  chatEvents: Array<{
    timestamp: number;
    prompt: string;
    responseLength: number;
    duration: number;
    /** 调整 4: when the chat diff was rendered to candidate. */
    diffShownAt?: number;
    /** 调整 4: when candidate accepted or rejected the diff. */
    diffRespondedAt?: number;
    /** 调整 4: ms between diffShownAt and diffRespondedAt during which document was visible. */
    documentVisibleMs?: number;
  }>;
  diffEvents: Array<{
    timestamp: number;
    accepted: boolean;
    linesAdded: number;
    linesRemoved: number;
  }>;
  fileNavigationHistory: Array<{
    timestamp: number;
    filePath: string;
    action: 'open' | 'close' | 'switch';
    duration?: number;
  }>;
  editSessions: Array<{
    filePath: string;
    startTime: number;
    endTime: number;
    keystrokeCount: number;
    /** Task 30b: reason the session closed. Optional for legacy snapshots pre-30b. */
    closedBy?: 'idle_timeout' | 'file_switch';
    /** Task 30b: convenience field = endTime - startTime. Optional for legacy snapshots pre-30b. */
    durationMs?: number;
  }>;
  testRuns: Array<{
    timestamp: number;
    passRate: number;
    duration: number;
  }>;
  /**
   * 调整 4: Raw document visibility transitions — frontend emits every
   * visibilitychange event (tab hide / reveal). Backend joins this against
   * completion/chat event windows to fill documentVisibleMs.
   */
  documentVisibilityEvents?: Array<{
    timestamp: number;
    hidden: boolean;
  }>;
}

export interface V5MBFinalFile {
  path: string;
  content: string;
}

export interface V5MBStandards {
  rulesContent: string;
  agentContent?: string;
}

export interface V5MBAudit {
  violations: Array<{
    exampleIndex: number;
    markedAsViolation: boolean;
    violatedRuleId?: string;
  }>;
}

/** V5.2 多 Agent 角色（V5.0 仅作类型预留，实际候选人 session 不填充）。 */
export type V5AgentRole = 'data-agent' | 'logic-agent' | 'review-agent' | 'infra-agent';

/**
 * V5.2 多 Agent 执行轨迹。
 * V5.0 时 V5MBSubmission.agentExecutions 永远为 undefined，保留字段只为后续
 * 填充数据时不需要改 type schema / 数据迁移。
 */
export interface V5AgentExecution {
  agentId: string;
  agentRole: V5AgentRole;
  prompts: Array<{ timestamp: number; content: string }>;
  outputs: Array<{ timestamp: number; filePath: string; linesChanged: number }>;
  /** 引用 PromptRegistry key（e.g. 'mb.agent.data-agent.system'）。 */
  systemPromptKey: string;
}

export interface V5MBSubmission {
  planning?: V5MBPlanning;
  /** 保留 V4 回合式数据结构用于老数据兼容；V5 主要通过 editorBehavior 收集行为。 */
  rounds?: V5MBLegacyRound[];
  editorBehavior: V5MBEditorBehavior;
  finalFiles: V5MBFinalFile[];
  finalTestPassRate: number;
  standards?: V5MBStandards;
  audit?: V5MBAudit;
  /** V5.2 多 Agent 预留：V5.0 恒为 undefined。 */
  agentExecutions?: V5AgentExecution[];
}

// ───────────────────────────── MD ─────────────────────────────

export interface V5ModuleDSubmission {
  subModules: Array<{
    name: string;
    responsibility: string;
    interfaces?: string[];
  }>;
  interfaceDefinitions: string[];
  dataFlowDescription: string;
  constraintsSelected: string[];
  tradeoffText: string;
  aiOrchestrationPrompts: string[];
}

// ───────────────────────────── SelfAssess ─────────────────────────────

export interface V5SelfAssessSubmission {
  confidence: number;
  reasoning: string;
  /** V5 新增：候选人回顾了哪些前序决策摘要（用于 sMetaCognition 校准评估）。 */
  reviewedDecisions?: string[];
}

// ───────────────────────────── MC ─────────────────────────────

export type V5ProbeStrategy = 'baseline' | 'contradiction' | 'weakness' | 'escalation' | 'transfer';

export interface V5ModuleCAnswer {
  round: number;
  question: string;
  answer: string;
  probeStrategy?: V5ProbeStrategy;
}

// ───────────────────────────── Aggregate ─────────────────────────────

/**
 * 一个 session 所有模块的提交集合。字段名和 V5ModuleKey 一致（camelCase）。
 * 未参与的模块字段为 undefined。
 */
export interface V5Submissions {
  phase0?: V5Phase0Submission;
  moduleA?: V5ModuleASubmission;
  mb?: V5MBSubmission;
  moduleD?: V5ModuleDSubmission;
  selfAssess?: V5SelfAssessSubmission;
  /** 修正 4：moduleC（非 modulec）。 */
  moduleC?: V5ModuleCAnswer[];
}
