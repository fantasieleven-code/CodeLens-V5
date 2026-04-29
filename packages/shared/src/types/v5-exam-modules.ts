/**
 * V5 ExamModule.moduleSpecific 的 6 个模块 JSON 形状。
 *
 * 每个 ExamModule 行在 DB 里以 moduleSpecific Json 字段存储模块专属出题数据；
 * ExamDataService 查询后按 moduleType 强制转成下面对应的接口类型给调用方。
 *
 * 接口来源于 docs/v5-planning/v5-design-reference.md 的 P0-1 章节
 * （V5 设计窗口归档,归档时间 2026-04-16）。
 */

// ───────────────────────────── P0 ─────────────────────────────

export interface P0ModuleSpecific {
  /** 候选人阅读的系统代码,按 level 调整,300-500 行。 */
  systemCode: string;
  codeReadingQuestions: {
    l1: { question: string; options: string[]; correctIndex: number };
    /** 中层理解:textarea。 */
    l2: { question: string };
    /** 深层理解:textarea。 */
    l3: { question: string };
  };
  /** AI 输出判断 2 题。 */
  aiOutputJudgment: Array<{
    /** 30-50 行代码片段 A。 */
    codeA: string;
    codeB: string;
    context: string;
    groundTruth: 'A' | 'B' | 'both_good' | 'both_bad';
  }>;
  decision: {
    scenario: string;
    options: Array<{ id: string; label: string; description: string }>;
  };
  /**
   * Round 2 Part 3 调整 1 (v5-design-clarifications.md L116-137) — a short
   * AI-generated code block + AI explanation where the explanation claims a
   * feature the code does not implement (e.g. "uses WATCH/MULTI" but the code
   * only has a single SET NX). The candidate must spot the gap; this block
   * provides all the fixed data `sAiClaimDetection` needs to score the
   * response.
   *
   * Retroactive addition that should have shipped with Task 11; the client
   * fixture (packages/client/src/pages/phase0/mock.ts) has been carrying a
   * matching local shape with a TODO(task-10) marker.
   */
  aiClaimDetection: {
    /** AI-generated code the candidate must audit. 20-40 lines. */
    code: string;
    /** AI explanation text; contains the deceptive claim. */
    aiExplanation: string;
    /** Features the explanation claims. Includes the deceptive one. */
    claimedFeatures: string[];
    /** Features the code actually has. Excludes the deceptive claim. */
    actualFeatures: string[];
    /** The one claim that does not match reality — drives sAiClaimDetection. */
    deceptivePoint: {
      claimedFeature: string;
      realityGap: string;
    };
  };
}

export interface P0CandidateView {
  systemCode: string;
  codeReadingQuestions: {
    l1: { question: string; options: string[] };
    l2: { question: string };
    l3: { question: string };
  };
  aiOutputJudgment: Array<{
    codeA: string;
    codeB: string;
    context: string;
  }>;
  decision: P0ModuleSpecific['decision'];
  aiClaimDetection: {
    code: string;
    aiExplanation: string;
  };
}

// ───────────────────────────── MA ─────────────────────────────

export interface MASchemeOption {
  id: 'A' | 'B' | 'C';
  name: string;
  description: string;
  pros: string[];
  cons: string[];
  performance: string;
  cost: string;
}

export interface MADefect {
  defectId: string;
  line: number;
  content: string;
  severity: 'critical' | 'major' | 'minor';
  category: string;
  relatedScheme?: string;
}

export interface MADecoy {
  line: number;
  content: string;
}

export interface MAFailureScenario {
  successCode: string;
  failedCode: string;
  diffPoints: Array<{ line: number; description: string }>;
  rootCause: string;
}

export interface MAModuleSpecific {
  requirement: string;
  schemes: MASchemeOption[];
  /** schemeId → 2 个反驳点。 */
  counterArguments: Record<string, string[]>;
  defects: MADefect[];
  decoys: MADecoy[];
  /** R2 代码审查用的代码。 */
  codeForReview: string;
  /** R3 对比诊断用。 */
  failureScenario: MAFailureScenario;
  /**
   * R4 迁移验证场景. Originally carried as a client-local mock extension;
   * Layer 2 canonical content parity promotes it into the DB-backed module
   * spec so UI content and scoring examData share the same source.
   */
  migrationScenario: {
    newBusinessContext: string;
    relatedDimension: string;
    differingDimension: string;
    promptText: string;
  };
}

export interface MACandidateView {
  requirement: string;
  schemes: MASchemeOption[];
  counterArguments: Record<string, string[]>;
  codeForReview: string;
  failureScenario: Pick<MAFailureScenario, 'successCode' | 'failedCode'>;
  migrationScenario: MAModuleSpecific['migrationScenario'];
}

// ───────────────────────────── MB ─────────────────────────────

export interface MBScaffoldFile {
  path: string;
  /** 含 TODO 注释。 */
  content: string;
  knownIssueLines?: number[];
}

export interface MBTestFile {
  path: string;
  content: string;
  purpose: string;
}

export interface MBScaffold {
  files: MBScaffoldFile[];
  tests: MBTestFile[];
  /** 文件路径数组,按依赖先后。 */
  dependencyOrder: string[];
}

export interface MBViolationExample {
  exampleIndex: number;
  code: string;
  isViolation: boolean;
  /** 对应 harnessReference.constraintCategories 之一。 */
  violationType?: string;
  explanation: string;
}

export interface MBModuleSpecific {
  featureRequirement: {
    description: string;
    /** 5 条验收标准。 */
    acceptanceCriteria: string[];
  };
  scaffold: MBScaffold;
  harnessReference: {
    keyConstraints: string[];
    constraintCategories: string[];
  };
  /** 3 个示例用于 Stage 4 审计。 */
  violationExamples: MBViolationExample[];
}

/**
 * Brief #15 · candidate-facing projection of MBModuleSpecific.
 *
 * Stripped of all groundTruth + instructor-only metadata before reaching the
 * client. The endpoint `GET /api/v5/exam/:examInstanceId/module/:moduleType`
 * is the single contract — server is the source of truth, client consumes
 * this narrower shape.
 *
 * Stripped fields and why:
 *   - `MBScaffoldFile.knownIssueLines` · instructor cue · would tell the
 *     candidate which lines are buggy.
 *   - `MBScaffold.tests` · backend-test scaffolding · candidate writes their
 *     own tests in the editor.
 *   - `harnessReference` · scoring rubric · groundTruth.
 *   - `MBViolationExample.{isViolation, violationType, explanation}` · the
 *     answer the candidate is asked to derive in Stage 4.
 *
 * Added field:
 *   - `language` is computed server-side from the path extension so the
 *     client's MultiFileEditor (which requires a language string) does not
 *     need to re-derive it from the path.
 */
export interface MBCandidateScaffoldFile {
  path: string;
  content: string;
  language: string;
}

export interface MBCandidateScaffold {
  files: MBCandidateScaffoldFile[];
  dependencyOrder: string[];
}

export interface MBCandidateViolationExample {
  exampleIndex: number;
  code: string;
  /** Optional · server canonical doesn't carry this · mock fixture does. */
  aiClaimedReason?: string;
}

export interface MBCandidateView {
  featureRequirement: {
    description: string;
    acceptanceCriteria: string[];
  };
  scaffold: MBCandidateScaffold;
  violationExamples: MBCandidateViolationExample[];
}

// ───────────────────────────── MD ─────────────────────────────

export interface MDExpectedSubModule {
  name: string;
  responsibility: string;
}

export interface MDDesignChallenge {
  /** 候选人满足什么条件后触发。 */
  trigger: string;
  challenge: string;
}

export interface MDModuleSpecific {
  designTask: {
    description: string;
    businessContext: string;
    nonFunctionalRequirements: string[];
  };
  /** 参考答案,不展示给候选人。 */
  expectedSubModules: MDExpectedSubModule[];
  /** 5-7 类约束。 */
  constraintCategories: string[];
  /** 2-3 个条件触发。 */
  designChallenges: MDDesignChallenge[];
}

export interface MDCandidateView {
  designTask: MDModuleSpecific['designTask'];
  constraintCategories: string[];
  designChallenges: MDDesignChallenge[];
}

// ───────────────────────────── SE ─────────────────────────────

export interface SEModuleSpecific {
  decisionSummaryTemplate: string;
}

export type SECandidateView = SEModuleSpecific;

// ───────────────────────────── MC ─────────────────────────────

export interface MCModuleSpecific {
  probeStrategies: {
    baseline: string;
    contradiction: string;
    weakness: string;
    escalation: string;
    transfer: string;
  };
}

export type MCCandidateView = MCModuleSpecific;

export interface CandidateModuleViewByType {
  P0: P0CandidateView;
  MA: MACandidateView;
  MB: MBCandidateView;
  MD: MDCandidateView;
  SE: SECandidateView;
  MC: MCCandidateView;
}

// ───────────────────────────── Aggregate ─────────────────────────────

/**
 * moduleType → moduleSpecific 形状的 type-level 映射。
 * ExamDataService 内部按 moduleType 取出对应接口,调用方用 getP0Data/getMAData/... 拿到 typed 结果。
 */
export interface ModuleSpecificByType {
  P0: P0ModuleSpecific;
  MA: MAModuleSpecific;
  MB: MBModuleSpecific;
  MD: MDModuleSpecific;
  SE: SEModuleSpecific;
  MC: MCModuleSpecific;
}
