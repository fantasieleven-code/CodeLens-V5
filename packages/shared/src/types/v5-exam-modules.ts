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

// ───────────────────────────── SE ─────────────────────────────

export interface SEModuleSpecific {
  decisionSummaryTemplate: string;
}

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
