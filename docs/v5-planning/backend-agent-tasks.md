文档 1：CodeLens V5 Backend Agent 任务文档
markdown# CodeLens V5 后端开发任务文档

## 项目背景

你是 CodeLens V5 的后端 Agent，负责所有服务端代码、数据层、信号引擎、AI 集成、出题引擎、测试基础设施。

**前置状态**：
- V5 仓库已初始化：/Users/stevezhu/Projects/CodeLens-v5
- GitHub: https://github.com/fantasieleven-code/CodeLens-V5.git
- V4 基础设施已复制（A 类 5200+ 行）
- 4 个 B 类文件带 TODO 标记待处理：
  - packages/server/prisma/schema.prisma（你处理）
  - packages/client/src/hooks/useSocket.ts（Frontend 处理）
  - packages/client/src/hooks/useBehaviorTracker.ts（Frontend 处理）
  - packages/client/src/components/editors/RulesEditor.tsx（Frontend 处理）
- 5 个补充 V4 前端文件（Frontend 处理，你无需关心）

**协作约定**：
- 你的分支：feat/backend
- Frontend 的分支：feat/frontend
- 共享内容通过 main 分支同步（packages/shared 的 types 必须先 merge 到 main）
- 每完成一个大 Task push feat/backend，每完成一个 Phase merge 到 main

---

## 核心架构（必须遵守）

### V5 = V4 完全替代，无兼容层
- schemaVersion = 5（V5 session 专用）
- V4 代码已全部删除，不需要考虑兼容
- 旧的 V4 session 数据保留在 DB 但不被读取

### 6 维度
technicalJudgment     - MA 方案/缺陷/诊断 + P0 baseline
aiEngineering         - MB 编排/指挥/规范/Cursor 行为
systemDesign          - MD 拆分/约束/权衡
codeQuality           - MA R2 审查 + MB 审查/规则/审计
communication         - MC + 写作横切
metacognition         - SE + P0 AI 校准/决策风格

### 40 信号（37 纯规则 + 3 LLM 白名单，全在 MD）

每个信号独立文件放 `packages/server/src/signals/{module}/{signal-name}.ts`。
通过 SignalRegistry 注册。

#### P0 模块（4 个）
| 信号 | 维度 | 计算 |
|---|---|---|
| sBaselineReading | technicalJudgment | L1×0.2 + L2×0.3 + L3×0.5（3 层理解递进）|
| sAiCalibration | metacognition | 题1正确×0.3 + 题2正确×0.3 + 两题理由质量×0.4 |
| sDecisionStyle | metacognition | 决策风格（保持 V4 逻辑）|
| sTechProfile | metacognition | 技术画像（V5.0 非评分，记录）|

#### MA 模块（9 个，全部纯规则）
| 信号 | 维度 |
|---|---|
| sSchemeJudgment | technicalJudgment |
| sReasoningDepth | technicalJudgment |
| sContextQuality | technicalJudgment |
| sCriticalThinking | technicalJudgment |
| sArgumentResilience | technicalJudgment |
| sCodeReviewQuality | codeQuality |
| sHiddenBugFound | codeQuality |
| sReviewPrioritization | codeQuality |
| sDiagnosisAccuracy | technicalJudgment |

**sArgumentResilience 计算（纯规则）**：
```typescript
// 输入：挑战后候选人的回应文本 + 原始 schemeId
const stanceMaintained = response.includes(originalSchemeId);
const stanceChanged = response.includes(alternativeSchemeId);

if (stanceMaintained && !stanceChanged) {
  const quantitative = countQuantitativeMarkers(response); // 数字/百分比/QPS
  const specificity = countTechnicalTerms(response) / wordCount;
  return quantitative * 0.4 + specificity * 0.3 + 1.0 * 0.3;
}
if (stanceChanged) {
  const hasJustification = response.length > 50 && countCausalMarkers(response) > 0;
  return hasJustification ? 0.6 : 0.1;
}
return 0.3;
```

**sCodeReviewQuality V4 fallback**：
如果所有 commentType 都是 'bug'，降级为 V4 sDefectDetection 计算逻辑（确保不退步）。

**sDiagnosisAccuracy**：rootCause×0.5 + diffPoint 覆盖×0.3 + correctVersionChoice×0.2

#### MB 模块（17 个，全部纯规则）

**Stage 1 编排（aiEngineering）**：
- sTaskDecomposition: 步骤数 + 格式 + scaffold 引用（纯规则）
- sInterfaceDesign: scaffold 函数名/类名引用命中数（纯规则）
- sFailureAnticipation: 降级关键词 + 步骤引用 + 填写率（纯规则）

**Stage 2 执行（aiEngineering）**：
- sPromptQuality, sIterationEfficiency, sPrecisionFix

**Cursor 行为（aiEngineering）**：
- sAiCompletionAcceptRate: 反 U 曲线，50-70% 最优
- sChatVsDirectRatio: 30-50% 最优
- sFileNavigationEfficiency
- sTestFirstBehavior

**Stage 2 质量（codeQuality）**：
- sModifyQuality, sBlockSelectivity, sChallengeComplete, sVerifyDiscipline, sAiOutputReview
- sEditPatternQuality

**Stage 3 规范（codeQuality）**：sRulesQuality, sRulesCoverage, sRulesSpecificity
**Stage 3 AI 治理（aiEngineering）**：sAgentGuidance
**横切（communication）**：sWritingQuality
**Stage 4 审计（codeQuality）**：sRuleEnforcement

**Cursor 行为信号实现**：
```typescript
// sAiCompletionAcceptRate
const shown = events.filter(e => e.type === 'ai_completion_shown').length;
const accepted = events.filter(e => e.type === 'ai_completion_accepted').length;
if (shown === 0) return null;
const rate = accepted / shown;
if (rate >= 0.5 && rate <= 0.7) return 1.0;
if (rate >= 0.3 && rate <= 0.9) return 0.6;
return 0.2;

// sChatVsDirectRatio
const chatMs = sum(chatEvents.map(e => e.duration));
const directMs = sum(editSessions.map(s => s.endTime - s.startTime));
const ratio = chatMs / (chatMs + directMs);
if (ratio >= 0.3 && ratio <= 0.5) return 1.0;
if (ratio >= 0.15 && ratio <= 0.7) return 0.6;
return 0.3;
```

#### MD 模块（4 个，1 纯规则 + 3 LLM 白名单）
- sDesignDecomposition: LLM + 规则降级
- sConstraintIdentification: 纯规则（类别覆盖：5+类=1.0, 3-4=0.7, <3=0.3）
- sTradeoffArticulation: LLM + 规则降级
- sAiOrchestrationQuality: LLM + 规则降级

**LLM 信号调用策略**：
- 超时 30s → 降级 fallback 规则
- 重试 1 次 → 仍失败 → fallback
- 记录调用日志（用 Langfuse）

#### SE 模块（1 个）：sMetaCognition

#### MC 模块（3 个）：sBoundaryAwareness, sCommunicationClarity, sReflectionDepth

### 5 个套件
full_stack    P0+MA+MB+SE+MC         60min  cap S
architect     P0+MA+MD+SE+MC         63min  cap S+
ai_engineer   P0+MA+MB+SE+MC         60min  cap S  (aiEngineering 权重翻倍)
quick_screen  P0+MA+MB+SE            35min  cap A
deep_dive     P0+MA+MB+MD+SE+MC      85min  cap S+

### 可扩展模式（12 种）
Suite / BusinessScenario / Weight Profile / Grade Cap / Signal Registry / 
Sandbox Provider / Model Provider / Report Section Registry / Event Bus / 
Prompt Registry / Multi-Tenant（预留）/ Version Adapter（不做）

---

## Phase 0：基建（15 天）

### Task 1: 统一数据契约 + EventBus（1.5 天）

创建 packages/shared/src/types/ 下：

**v5-submissions.ts**（完整类型定义）：
```typescript
export interface V5Phase0Submission {
  codeReading: {
    l1Answer: string;  // 3 层递进
    l2Answer: string;
    l3Answer: string;
    confidence: number;
  };
  aiOutputJudgment: Array<{  // 2 题
    choice: 'A' | 'B' | 'both_good' | 'both_bad';
    reasoning: string;
  }>;
  decision: {
    choice: string;
    reasoning: string;
  };
  inputBehavior?: Record<string, any>;
}

export interface V5ModuleASubmission {
  round1: {
    schemeId: 'A' | 'B' | 'C';
    reasoning: string;
    structuredForm: {
      scenario: string;     // 注意字段名（signal-engine 视角）
      tradeoff: string;
      decision: string;
      verification: string;
    };
    challengeResponse: string;  // 对抗环节回应
  };
  round2: {
    markedDefects: Array<{
      defectId: string;
      commentType: 'bug' | 'suggestion' | 'question' | 'nit';
      comment: string;
      fixSuggestion?: string;
    }>;
    inputBehavior?: Record<string, any>;
  };
  round3: {
    correctVersionChoice: 'success' | 'failed';
    diffAnalysis: string;
    diagnosisText: string;
  };
}

export interface V5MBSubmission {
  planning?: {
    decomposition: string;
    dependencies: string;
    fallbackStrategy: string;
    submittedAt?: number;
    skipped?: boolean;
  };
  rounds?: Array<{  // 保留兼容但 V5 主用 editorBehavior
    round: number;
    prompt: string;
    aiText: string;
    appliedBlocks: Array<{ blockIndex: number }>;
  }>;
  editorBehavior: {
    aiCompletionEvents: Array<{
      timestamp: number;
      accepted: boolean;
      lineNumber: number;
      completionLength: number;
    }>;
    chatEvents: Array<{
      timestamp: number;
      prompt: string;
      responseLength: number;
      duration: number;
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
    }>;
    testRuns: Array<{
      timestamp: number;
      passRate: number;
      duration: number;
    }>;
  };
  finalFiles: Array<{
    path: string;
    content: string;
  }>;
  finalTestPassRate: number;
  standards?: {
    rulesContent: string;
    agentContent?: string;
  };
  audit?: {
    violations: Array<{
      exampleIndex: number;
      markedAsViolation: boolean;
      violatedRuleId?: string;
    }>;
  };
}

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

export interface V5SelfAssessSubmission {
  confidence: number;
  reasoning: string;
  // V5 新增：候选人回顾了哪些前序决策摘要
  reviewedDecisions?: string[];
}

export interface V5ModuleCAnswer {
  round: number;
  question: string;
  answer: string;
  probeStrategy?: string;  // baseline/contradiction/weakness/escalation/transfer
}

export interface V5Submissions {
  phase0?: V5Phase0Submission;
  moduleA?: V5ModuleASubmission;
  mb?: V5MBSubmission;
  moduleD?: V5ModuleDSubmission;
  selfAssess?: V5SelfAssessSubmission;
  modulec?: V5ModuleCAnswer[];
}
```

**v5-dimensions.ts**：
```typescript
export enum V5Dimension {
  TECHNICAL_JUDGMENT = 'technicalJudgment',
  AI_ENGINEERING = 'aiEngineering',
  SYSTEM_DESIGN = 'systemDesign',
  CODE_QUALITY = 'codeQuality',
  COMMUNICATION = 'communication',
  METACOGNITION = 'metacognition',
}

export type V5DimensionScores = Partial<Record<V5Dimension, number>>;
export type V5Grade = 'D' | 'C' | 'B' | 'B+' | 'A' | 'S' | 'S+';
```

**v5-suite.ts**（SUITES 配置）：
```typescript
export type SuiteId = 'full_stack' | 'architect' | 'ai_engineer' | 'quick_screen' | 'deep_dive';

export interface SuiteDefinition {
  id: SuiteId;
  nameZh: string;
  nameEn: string;
  modules: string[];
  estimatedMinutes: number;
  gradeCap: V5Grade;
  weightProfile: Record<V5Dimension, number>;
  dimensionFloors: Partial<Record<V5Grade, Partial<Record<V5Dimension, number>>>>;
  reportSections: string[];
}

export const SUITES: Record<SuiteId, SuiteDefinition> = {
  full_stack: {
    id: 'full_stack',
    nameZh: '全面评估',
    nameEn: 'Full Stack Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'modulec'],
    estimatedMinutes: 60,
    gradeCap: 'S',
    weightProfile: {
      technicalJudgment: 0.25,
      aiEngineering: 0.25,
      codeQuality: 0.20,
      communication: 0.15,
      metacognition: 0.10,
      systemDesign: 0.05,  // 无 MD 时通过 N/A rescaling 分散
    },
    dimensionFloors: {
      'S': { technicalJudgment: 80, aiEngineering: 80, codeQuality: 75 },
      'A': { technicalJudgment: 70, aiEngineering: 70, codeQuality: 65 },
    },
    reportSections: ['hero', 'radar', 'recommendation', 'ma-detail', 'mb-detail', 'mb-cursor-behavior', 'mc-transcript', 'dimensions', 'signal-bars', 'compliance'],
  },
  architect: {
    id: 'architect',
    nameZh: '架构师评估',
    nameEn: 'Architect Assessment',
    modules: ['phase0', 'moduleA', 'moduleD', 'selfAssess', 'modulec'],
    estimatedMinutes: 63,
    gradeCap: 'S+',
    weightProfile: {
      technicalJudgment: 0.25,
      systemDesign: 0.30,
      communication: 0.20,
      codeQuality: 0.10,
      metacognition: 0.10,
      aiEngineering: 0.05,
    },
    dimensionFloors: {
      'S+': { technicalJudgment: 85, systemDesign: 85, communication: 80 },
      'S': { technicalJudgment: 78, systemDesign: 78, communication: 72 },
    },
    reportSections: ['hero', 'radar', 'recommendation', 'ma-detail', 'md-hero', 'mc-transcript', 'dimensions', 'signal-bars', 'compliance'],
  },
  ai_engineer: {
    id: 'ai_engineer',
    nameZh: 'AI 工程师评估',
    nameEn: 'AI Engineer Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess', 'modulec'],
    estimatedMinutes: 60,
    gradeCap: 'S',
    weightProfile: {
      aiEngineering: 0.40,  // 翻倍
      technicalJudgment: 0.20,
      codeQuality: 0.15,
      communication: 0.15,
      metacognition: 0.05,
      systemDesign: 0.05,
    },
    dimensionFloors: {
      'S': { aiEngineering: 85, technicalJudgment: 75, codeQuality: 70 },
      'A': { aiEngineering: 75, technicalJudgment: 65, codeQuality: 60 },
    },
    reportSections: ['hero', 'radar', 'recommendation', 'ma-detail', 'mb-detail', 'mb-cursor-behavior', 'mc-transcript', 'dimensions', 'signal-bars', 'compliance'],
  },
  quick_screen: {
    id: 'quick_screen',
    nameZh: '快速筛选',
    nameEn: 'Quick Screen',
    modules: ['phase0', 'moduleA', 'mb', 'selfAssess'],
    estimatedMinutes: 35,
    gradeCap: 'A',
    weightProfile: {
      technicalJudgment: 0.35,
      aiEngineering: 0.30,
      codeQuality: 0.20,
      metacognition: 0.15,
      communication: 0,  // 不评
      systemDesign: 0,
    },
    dimensionFloors: {
      'A': { technicalJudgment: 70, aiEngineering: 65, codeQuality: 60 },
      'B+': { technicalJudgment: 60, aiEngineering: 55, codeQuality: 50 },
    },
    reportSections: ['hero', 'radar', 'recommendation', 'ma-detail', 'mb-detail', 'dimensions', 'signal-bars', 'compliance'],
  },
  deep_dive: {
    id: 'deep_dive',
    nameZh: '深度评估',
    nameEn: 'Deep Dive Assessment',
    modules: ['phase0', 'moduleA', 'mb', 'moduleD', 'selfAssess', 'modulec'],
    estimatedMinutes: 85,
    gradeCap: 'S+',
    weightProfile: {
      technicalJudgment: 0.20,
      aiEngineering: 0.20,
      systemDesign: 0.20,
      codeQuality: 0.15,
      communication: 0.15,
      metacognition: 0.10,
    },
    dimensionFloors: {
      'S+': { technicalJudgment: 85, aiEngineering: 80, systemDesign: 85, communication: 80 },
      'S': { technicalJudgment: 78, aiEngineering: 75, systemDesign: 75, communication: 72 },
    },
    reportSections: ['hero', 'radar', 'recommendation', 'ma-detail', 'mb-detail', 'mb-cursor-behavior', 'md-hero', 'mc-transcript', 'dimensions', 'signal-bars', 'compliance'],
  },
};
```

**v5-signals.ts**（SignalDefinition 接口）：
```typescript
export interface SignalInput {
  sessionId: string;
  suiteId: SuiteId;
  submissions: V5Submissions;
  examData: Record<string, any>;  // ExamModule 数据
  behaviorData?: Record<string, any>;
  participatingModules: string[];
}

export interface SignalDefinition {
  id: string;
  dimension: V5Dimension;
  moduleSource: string;
  isLLMWhitelist: boolean;
  compute: (input: SignalInput) => Promise<number | null>;
  fallback?: (input: SignalInput) => number | null;
}

export interface SignalRegistry {
  register(def: SignalDefinition): void;
  computeAll(input: SignalInput): Promise<Record<string, number | null>>;
  getDimensionSignals(dim: V5Dimension): SignalDefinition[];
  getSignalCount(): number;
  listSignals(): SignalDefinition[];
}
```

**v5-events.ts**：
```typescript
export enum V5Event {
  SESSION_CREATED = 'session:created',
  MODULE_SUBMITTED = 'module:submitted',
  MB_DIFF_ACCEPTED = 'mb:diff:accepted',
  MB_COMPLETION_SHOWN = 'mb:completion:shown',
  MB_TEST_RUN = 'mb:test:run',
  SCORING_STARTED = 'scoring:started',
  SCORING_COMPLETED = 'scoring:completed',
  SESSION_COMPLETED = 'session:completed',
}
```

**V5EventBus 实现**（packages/server/src/services/event-bus.service.ts）：
基于 V4 已复制的 event-bus.service.ts 扩展，添加 V5 event 支持。

**验收**：
- TypeScript 编译通过
- client 和 server 都能 import @codelens-v5/shared 的 V5 types
- EventBus 单元测试通过

**PR**: feat(shared): V5 data contracts and event bus

---

### Task 2: ExamInstance Schema 拆分（2.5 天）

处理 packages/server/prisma/schema.prisma 的 TODO V5 标记：

**改动**：
- Session 移除 schemaVersion 字段（全部 V5）
- ExamInstance:
  - 删除 V3/V4 字段：schemes, defectsInBest, failureScenario, v4Requirement, scaffold, phase0Questions, harnessReference, samples
  - 新增 businessScenario: Json (非 null)
  - 新增 5 维度：techStack, domain, challengePattern, archStyle?, level
  - 新增 orgId: String?（多租户预留）
- 新增 ExamModule 表：
```prisma
model ExamModule {
  id              String       @id @default(uuid())
  examInstanceId  String
  examInstance    ExamInstance @relation(fields: [examInstanceId], references: [id])
  moduleType      String       // 'P0' | 'MA' | 'MB' | 'MD' | 'SE' | 'MC'
  scenarioRef     String       // businessScenario 的路径
  moduleSpecific  Json         // 模块特有题目数据
  version         Int          @default(1)
  createdAt       DateTime     @default(now())
  
  @@unique([examInstanceId, moduleType])
}
```

**执行**：
```bash
# 删除旧 migrations 文件夹
rm -rf packages/server/prisma/migrations

# 生成新 initial migration
cd packages/server
npx prisma migrate dev --name init_v5
```

**创建 ExamDataService**（packages/server/src/services/exam-data.service.ts）：
```typescript
export class ExamDataService {
  async getBusinessScenario(examInstanceId: string): Promise<BusinessScenario | null>;
  async getModuleData<T>(examInstanceId: string, moduleType: string): Promise<T | null>;
  async createExamModule(examInstanceId: string, moduleType: string, scenarioRef: string, moduleSpecific: any): Promise<void>;
}
```

**验收**：
- schema 无 V3/V4 残留
- migration 成功
- ExamDataService 单元测试通过

**PR**: feat(db): V5 exam schema with ExamModule

---

### Task 3: Suite 定义 + moduleOrder 数据化（2 天）

**位置**：packages/shared/src/constants/suites.ts（内容如 Task 1 所示）

**session.service.ts 改造**（已从 V4 复制，264 行）：
- createSession(suiteId, candidateId, ...) 从 SUITES 读取 modules 生成 moduleOrder
- 存入 session.metadata
- 移除所有 tier 相关逻辑

**验收**：
- SUITES 在 client/server 都能 import
- 创建 session 时 metadata.suiteId + metadata.moduleOrder 正确
- 5 个套件都能创建

**PR**: feat(core): Suite system

---

### Task 4: gradeCandidate suite-aware（1 天）

创建 packages/server/src/services/scoring.service.ts（无版本后缀）：

**computeComposite**：
- 输入：dimensionScores + SuiteDefinition
- N/A rescaling：未参与维度权重为 0 时跳过
- 返回 composite 分数（0-100）

**gradeCandidate**：
```typescript
function gradeCandidate(
  composite: number,
  dims: V5DimensionScores,
  suite: SuiteDefinition
): { grade: V5Grade; dangerFlag: boolean } {
  const participating = new Set(
    Object.entries(dims).filter(([_, v]) => v != null).map(([k]) => k)
  );
  
  function meetsFloor(dim: V5Dimension, floor: number): boolean {
    if (!participating.has(dim)) return true;
    return (dims[dim] ?? 0) >= floor;
  }
  
  // 按 gradeCap 限制最终评级
  let grade: V5Grade = 'D';
  
  // 瀑布式：从 S+ 往下
  if (composite >= 90 && checkFloors('S+')) grade = 'S+';
  else if (composite >= 85 && checkFloors('S')) grade = 'S';
  else if (composite >= 75 && checkFloors('A')) grade = 'A';
  else if (composite >= 65 && checkFloors('B+')) grade = 'B+';
  else if (composite >= 55) grade = 'B';
  else if (composite >= 45) grade = 'C';
  else grade = 'D';
  
  // B- dangerFlag 保持代码逻辑（不数据化）
  const dangerFlag = composite >= 55 && 
    participating.has('technicalJudgment') && 
    participating.has('codeQuality') &&
    (dims.technicalJudgment ?? 0) < 50 &&
    (dims.codeQuality ?? 0) >= 60 &&
    ((dims.codeQuality ?? 0) - (dims.technicalJudgment ?? 0)) > 15;
  
  // gradeCap 限制
  const gradeOrder = ['D', 'C', 'B', 'B+', 'A', 'S', 'S+'];
  const currentIdx = gradeOrder.indexOf(grade);
  const capIdx = gradeOrder.indexOf(suite.gradeCap);
  if (currentIdx > capIdx) grade = suite.gradeCap;
  
  return { grade, dangerFlag };
}
```

**SignalRegistry 框架**（packages/server/src/services/signal-registry.service.ts）：
```typescript
export class SignalRegistryImpl implements SignalRegistry {
  private signals = new Map<string, SignalDefinition>();
  
  register(def: SignalDefinition): void { this.signals.set(def.id, def); }
  
  async computeAll(input: SignalInput): Promise<Record<string, number | null>> {
    const results: Record<string, number | null> = {};
    
    for (const [id, def] of this.signals) {
      // 未参与模块 → null
      if (!input.participatingModules.includes(def.moduleSource)) {
        results[id] = null;
        continue;
      }
      
      try {
        // LLM 白名单信号加超时控制
        if (def.isLLMWhitelist) {
          const result = await Promise.race([
            def.compute(input),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000))
          ]);
          
          if (result !== null) {
            results[id] = result;
          } else {
            // 超时 → fallback
            results[id] = def.fallback ? def.fallback(input) : null;
          }
        } else {
          results[id] = await def.compute(input);
        }
      } catch (error) {
        logger.error(`Signal ${id} failed`, error);
        results[id] = def.fallback ? def.fallback(input) : null;
      }
    }
    
    return results;
  }
  
  getDimensionSignals(dim: V5Dimension): SignalDefinition[] {
    return Array.from(this.signals.values()).filter(s => s.dimension === dim);
  }
}
```

**scoring-orchestrator.service.ts**（从 V4 fork 但重写）：
```typescript
export async function scoreSession(sessionId: string): Promise<ScoringResult> {
  const session = await getSession(sessionId);
  const suite = SUITES[session.metadata.suiteId];
  const submissions = session.metadata.submissions as V5Submissions;
  const participatingModules = session.metadata.moduleOrder;
  
  // EventBus emit scoring:started
  await eventBus.emit(V5Event.SCORING_STARTED, { sessionId });
  
  // 读 ExamModule 数据
  const examData = {};
  for (const moduleType of participatingModules) {
    examData[moduleType] = await examDataService.getModuleData(
      session.examInstanceId,
      moduleType.toUpperCase()
    );
  }
  
  // 计算所有信号
  const signalInput: SignalInput = {
    sessionId,
    suiteId: suite.id,
    submissions,
    examData,
    participatingModules,
  };
  
  const signals = await signalRegistry.computeAll(signalInput);
  
  // 信号 → 维度分数
  const dimensions = computeDimensionScores(signals, signalRegistry);
  
  // 维度 → composite
  const composite = computeComposite(dimensions, suite);
  
  // 评级
  const { grade, dangerFlag } = gradeCandidate(composite, dimensions, suite);
  
  const result = { signals, dimensions, composite, grade, dangerFlag };
  
  // 保存结果
  await saveScoringResult(sessionId, result);
  
  await eventBus.emit(V5Event.SCORING_COMPLETED, { sessionId, result });
  
  return result;
}
```

**验收**：
- 5 个套件 × 不同分数矩阵测试：all pass
- gradeCandidate 内部无 ?? 0
- V4 Golden Path baseline 现在失效（V5 重建，见 Task 15）

**PR**: feat(scoring): suite-aware scoring service

---

### Task 5: SandboxProvider + FileSnapshotService（2 天）

**SandboxProvider 接口**（packages/server/src/services/sandbox/sandbox-provider.ts）：
```typescript
export interface SandboxProvider {
  create(): Promise<Sandbox>;
  writeFiles(sandbox: Sandbox, files: FileEntry[]): Promise<void>;
  execute(sandbox: Sandbox, command: string, timeout?: number): Promise<ExecutionResult>;
  destroy(sandbox: Sandbox): Promise<void>;
}

export interface Sandbox {
  id: string;
  provider: 'e2b' | 'docker' | 'static';
}

export interface FileEntry {
  path: string;
  content: string;
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
```

**E2BSandboxProvider**（从 V4 sandbox.service.ts 改造，965 行）：
- 保留 E2B 生命周期管理
- 改为短命模式（每次 create → writeFiles → execute → destroy）
- 删除 V4 的长连接逻辑

**DockerSandboxProvider**（从 V4 docker-sandbox.ts 改造，393 行）：
安全约束：
- rootless Docker
- seccomp profile（只允许基本 syscall）
- --network=none
- --read-only + tmpfs /workspace
- 内存限制 256MB，CPU 限制 1 core
- 执行超时 30s 硬杀
- 不挂载宿主机目录（docker cp 写入）

**StaticCheckProvider**（新建）：
- 不执行代码，只做 AST 分析
- pyright/eslint 语法检查
- 返回"语法正确/错误 + 静态检测的问题列表"
- 报告标注"本次评估未执行代码"

**SandboxFactory**：
```typescript
export class SandboxFactory {
  async getProvider(): Promise<SandboxProvider> {
    // 优先 E2B
    if (await this.e2bAvailable()) return new E2BSandboxProvider();
    // 降级 Docker
    if (await this.dockerAvailable()) return new DockerSandboxProvider();
    // 最终降级 Static
    return new StaticCheckProvider();
  }
}
```

**FileSnapshotService**（packages/server/src/services/file-snapshot.service.ts）：
```typescript
export class FileSnapshotService {
  private snapshots = new Map<string, Map<string, { 
    current: string; 
    history: ChangeEntry[] 
  }>>();
  
  setFileContent(
    sessionId: string, 
    filePath: string, 
    content: string, 
    source: 'manual_edit' | 'ai_chat' | 'ai_completion'
  ): void;
  
  getSnapshot(sessionId: string): FileEntry[];
  getFileHistory(sessionId: string, filePath: string): ChangeEntry[];
  persistToMetadata(session: Session): Promise<void>;
  restoreFromMetadata(session: Session): void;
  clear(sessionId: string): void;
}
```

**验收**：
- 短命 sandbox：create+write+execute+destroy < 15s (P95)
- 三级降级能切换
- FileSnapshotService 单元测试通过

**PR**: feat(sandbox): SandboxProvider abstraction with 3-tier fallback

---

### Task 6: ModelProvider 抽象（1 天）

**ModelProvider 接口**（packages/server/src/services/model-provider/model-provider.ts）：
```typescript
export interface ModelProvider {
  complete(params: CompletionParams): Promise<CompletionResult>;
  stream?(params: CompletionParams): AsyncIterable<StreamChunk>;
}

export interface CompletionParams {
  model: string;
  systemPrompt: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  latencyTarget?: 'low' | 'balanced' | 'quality';
}
```

**VolcanoModelProvider**（从 V4 ai-router.service.ts 复制迁移，278 行）：
- latencyTarget='low' → Qwen3-Coder base 模型（maxTokens=50，快速响应）
- latencyTarget='balanced' → Qwen3-Coder instruct（Chat 生成）
- latencyTarget='quality' → GLM-5 / Claude Sonnet（LLM 白名单 / 出题）

**全局替换**：
grep 所有直接 AI 调用（axios/fetch 到 LLM API），全部改为 modelProvider.complete。

**验收**：
- 全局只有 VolcanoModelProvider 一处直接 API 调用
- 三个 latencyTarget 路由正确

**PR**: feat(ai): ModelProvider abstraction

---

### Task 7: Prompt Registry 激活（1 天）

**prompt-registry.service.ts** 已从 V4 复制（141 行）。

**V5 改造**：
- 定义 V5 prompt keys：
  - generator.step0_scenario
  - generator.step1_p0
  - generator.step2_schemes
  - generator.step3_defects
  - generator.step4_mb_scaffold
  - generator.step5_failure
  - generator.step6_mb_violations
  - generator.step7_md_design
  - generator.step8_quality_check
  - mc.probe_engine.baseline
  - mc.probe_engine.contradiction
  - mc.probe_engine.weakness
  - mc.probe_engine.escalation
  - mc.probe_engine.transfer
  - md.llm_whitelist.decomposition
  - md.llm_whitelist.tradeoff
  - md.llm_whitelist.ai_orch

**packages/server/prisma/seed.ts** 添加 prompt seed（所有 key 的 v1 版本）。

**接口**：
```typescript
interface PromptRegistry {
  get(key: string, version?: number): Promise<string>;
  register(key: string, content: string, meta?: any): Promise<void>;
  list(key: string): Promise<PromptVersion[]>;
  setActive(key: string, version: number): Promise<void>;
}
```

**验收**：
- Prompt 存储在 DB
- 所有 LLM 调用通过 registry.get(key) 读 prompt

**PR**: feat(prompt): activate PromptRegistry

---

### Task 8: SignalRegistry 完整实现（2 天）

完善 Task 4 的 SignalRegistry 框架：
- async compute 支持
- LLM 白名单超时 + 重试
- Langfuse 调用日志记录
- 覆盖 40 个信号的注册点

**注意**：信号的 compute 实现由 Task 13 逐个做，这里只完善框架。

**验收**：
- 注册一个测试信号 → computeAll 能正确调用 + 记录日志
- LLM 白名单超时 → fallback 生效
- 失败重试 1 次

**PR**: feat(signal): complete SignalRegistry implementation

---

### 基建阶段总结

Task 1-8 完成后（15 天），main 分支状态：
- @codelens-v5/shared 有完整 V5 types
- Prisma V5 schema + migration
- Suite 系统工作
- Scoring 服务可调用（但信号未实现）
- Sandbox / Model / Prompt 三个 Provider 就绪
- SignalRegistry 框架就绪

Frontend agent 可以开始所有前端开发（基于你定义的 shared types）。

---

## Phase 1：出题引擎（11 天）

### Task 9: Step 0 BusinessScenario 总纲 Prompt 调优（4 天）

创建 packages/server/src/exam-generator/step0-scenario.ts

**输入**：ExamSpec { techStack, domain, challengePattern, archStyle?, level }

**输出**：
```typescript
export interface BusinessScenario {
  systemName: string;
  businessContext: string;  // 500-800 字
  coreEntities: Array<{
    name: string;
    attributes: string[];
    relationships: string[];
  }>;
  techStackDetail: {
    language: string;
    framework: string;
    database: string;
    cache?: string;
    mq?: string;
  };
  businessFlow: string[];
  userRoles: string[];
}
```

**Prompt 设计要点**：
- 强调完整业务系统
- 5 维度组合合法性（golang + payment_refund 不合适）
- 业务流程支撑后续模块题目派生

**存入 PromptRegistry**：key=generator.step0_scenario, version=v1

**调优迭代**：至少 10 轮，每轮人工审核

**验收**：
- 能生成 3 个不同维度组合的 BusinessScenario
- 每个 scenario 能作为 Step 1-7 的输入

---

### Task 10: Step 1-8 Generator 完整实现（7 天）

**Step 1 - P0 派生**（packages/server/src/exam-generator/step1-p0.ts）：
输出存入 ExamModule (P0)：
- systemCode (300-500 行，按 level 调整)
- codeReadingQuestions { l1, l2, l3 }
- aiOutputJudgment (2 题，复用 Step 5 的 successCode/failedCode 缩略版)
- decision (1 题)

**Step 2 - MA schemes**：
输出存入 ExamModule (MA)：
- schemes [A, B, C] 各含 pros/cons/performance/cost
- counterArguments（对每方案 2 个反驳点）
- 约束：cons 不字面复述 defects 关键词（Phase -1 已知 bug 修复）

**Step 3 - MA defects**：
合并到 ExamModule (MA)：
- defects（含 defectId/content/severity/category/relatedScheme）
- decoys
- 约束：缺陷类型支持 commentType (bug/suggestion/question/nit)

**Step 4 - MB scaffold**：
输出存入 ExamModule (MB)：
- featureRequirement（多验收条件）
- scaffold.files（多文件 TODO）
- scaffold.tests（12-15 个测试）
- scaffold.dependencyOrder（文件依赖层次）
- knownIssueLines
- 约束：scaffold 和 P0 systemCode 同一系统

**Step 5 - MA failureScenario**：
合并到 ExamModule (MA)：
- successCode / failedCode
- diffPoints
- rootCause
- 约束：rootCause 匹配 challengePattern（Phase -1 已知 bug 修复）

**Step 6 - MB violations**：
合并到 ExamModule (MB)：
- harnessReference.keyConstraints
- harnessReference.constraintCategories
- violationExamples (3 个：2 违规代码级 + 1 语义边界)

**Step 7 - MD designTask**：
输出存入 ExamModule (MD)：
- designTask.description
- expectedSubModules (5-7 个参考答案)
- constraintCategories (5-7 类别)
- designChallenges (2-3 个条件触发)

**Step 8 - 跨模块一致性检查**：
- systemCode 和 scaffold 同一系统
- schemes cons 不字面重复 defects
- rootCause 匹配 challengePattern
- 输出 qualityReport 存入 ExamInstance.aiQualityReview
- llm_quality_judge 修复为检查 codeOutline（不是 description 末尾，Phase -1 bug）

每个 step 的 prompt 存入 PromptRegistry。

**每个 step 调用**：
```typescript
const prompt = await promptRegistry.get('generator.step1_p0');
const result = await modelProvider.complete({
  model: 'glm-5',
  systemPrompt: prompt,
  messages: [{ role: 'user', content: JSON.stringify({ businessScenario, level }) }],
  latencyTarget: 'quality',
});
```

**验收**：
- 能完整生成 1 个 V5 BusinessScenario + 6 个 ExamModule
- Step 8 质量检查 pass
- 生成时间 < 15 分钟/题

**PR**: feat(generator): Step 0-8 complete implementation

---

## Phase 2：模块 + 信号实现（23 天）

### Task 11: Module C 后端改造（2-3 天）

V4 已复制：
- packages/server/src/services/voice-chat.service.ts (523 行)
- packages/server/src/services/mc-probe-engine.ts (398 行)
- packages/server/src/routes/voice-v4.ts (365 行，需改名为 voice.ts)
- packages/server/src/routes/mc-voice-chat.ts (637 行)

**改造内容**：

**mc-voice-chat.ts getSessionContext** 扩展读 V5 submissions：
```typescript
async function getSessionContext(sessionId: string) {
  const session = await getSession(sessionId);
  const submissions = session.metadata.submissions as V5Submissions;
  
  const context = {
    // V4 有的：MA
    moduleA: submissions.moduleA ? {
      round1: submissions.moduleA.round1,
      round2: submissions.moduleA.round2,
      round3: submissions.moduleA.round3,
    } : null,
    
    // V4 有的：MB（V5 结构变化）
    mb: submissions.mb ? {
      planning: submissions.mb.planning,
      finalFiles: submissions.mb.finalFiles,
      finalTestPassRate: submissions.mb.finalTestPassRate,
      standards: submissions.mb.standards,
      audit: submissions.mb.audit,
      // Cursor 行为摘要（V5 新增，MC 追问用）
      editorBehaviorSummary: {
        completionAcceptRate: calculateCompletionRate(submissions.mb.editorBehavior),
        chatVsDirectRatio: calculateChatRatio(submissions.mb.editorBehavior),
        testRunCount: submissions.mb.editorBehavior.testRuns.length,
      },
    } : null,
    
    // V4 没有的：MD（V5 新增锚点）
    moduleD: submissions.moduleD ? {
      subModules: submissions.moduleD.subModules,
      constraintsSelected: submissions.moduleD.constraintsSelected,
      tradeoffText: submissions.moduleD.tradeoffText,
    } : null,
    
    selfAssess: submissions.selfAssess,
  };
  
  return context;
}
```

**mc-probe-engine.ts DIMENSION_SIGNALS** 改 V5 6 维度：
```typescript
const V5_DIMENSION_SIGNALS = {
  technicalJudgment: ['sSchemeJudgment', 'sReasoningDepth', /* ... */],
  aiEngineering: ['sPromptQuality', 'sTaskDecomposition', /* ... */],
  systemDesign: ['sDesignDecomposition', 'sTradeoffArticulation', /* ... */],
  codeQuality: ['sCodeReviewQuality', 'sBlockSelectivity', /* ... */],
  communication: ['sBoundaryAwareness', 'sCommunicationClarity', /* ... */],
  metacognition: ['sMetaCognition', 'sAiCalibration', /* ... */],
};
```

**probe 策略保持** V4 的 5 轮 strategy (baseline/contradiction/weakness/escalation/transfer)。
每个策略 prompt 迁到 PromptRegistry。

**V4 字段名适配**：所有读 submission 的地方用 V5 types。

**buildDynamicSystemPrompt 改造**：
基于前序 submission 生成 Emma 的 system prompt：
```typescript
function buildSystemPrompt(context: SessionContext): string {
  const parts = [];
  
  if (context.moduleA) {
    parts.push(`候选人在 MA 选了方案 ${context.moduleA.round1.schemeId}，
理由是: ${context.moduleA.round1.reasoning.substring(0, 200)}`);
  }
  
  if (context.mb) {
    parts.push(`在 MB 最终 testPassRate=${context.mb.finalTestPassRate}。
AI 补全接受率 ${context.mb.editorBehaviorSummary.completionAcceptRate}，
Chat/直接编辑比例 ${context.mb.editorBehaviorSummary.chatVsDirectRatio}。`);
  }
  
  if (context.moduleD) {
    parts.push(`在 MD 设计了 ${context.moduleD.subModules.length} 个模块，
选了 ${context.moduleD.constraintsSelected.length} 类约束。`);
  }
  
  return EMMA_BASE_PROMPT + '\n\n候选人前序表现:\n' + parts.join('\n\n');
}
```

**Socket 事件**（全部改 v5: 前缀）：
- v5:modulec:start
- v5:modulec:answer
- v5:modulec:complete

**验收**：
- getSessionContext 读 MA + MB + MD
- MC 能问出基于前序 submission 的追问
- sReflectionDepth 在有 MD submission 时方差更大

**PR**: feat(mc): V5 backend adaptation

---

### Task 12: MB Cursor Endpoints（8 天）

创建 packages/server/src/services/modules/mb.service.ts

**Socket endpoints**：

```typescript
// v5:mb:planning:submit
socket.on('v5:mb:planning:submit', async (payload: V5MBPlanning) => {
  await persistPlanning(sessionId, payload);
  await eventBus.emit(V5Event.MODULE_SUBMITTED, { sessionId, module: 'mb.planning' });
});

// v5:mb:chat_generate（stream）
socket.on('v5:mb:chat_generate', async ({ prompt, filesContext }) => {
  const modelProvider = await getModelProvider();
  const stream = modelProvider.stream({
    model: 'qwen3-coder-instruct',
    systemPrompt: await promptRegistry.get('mb.chat_generate'),
    messages: [
      { role: 'system', content: `Files context: ${filesContext}` },
      { role: 'user', content: prompt },
    ],
    latencyTarget: 'balanced',
  });
  
  for await (const chunk of stream) {
    socket.emit('v5:mb:chat_stream', chunk);
  }
  
  // 最终结果以 diff 格式返回
  const finalDiff = parseDiffFromResponse(accumulatedText);
  socket.emit('v5:mb:chat_complete', { diff: finalDiff });
});

// v5:mb:completion_request
socket.on('v5:mb:completion_request', async ({ filePath, content, line, column }) => {
  const modelProvider = await getModelProvider();
  const result = await modelProvider.complete({
    model: 'qwen3-coder-base',
    systemPrompt: 'Complete the code at cursor position.',
    messages: [
      { role: 'user', content: `File: ${filePath}\n\n${content}\n\nCursor at line ${line}, col ${column}` },
    ],
    maxTokens: 50,
    latencyTarget: 'low',
  });
  
  socket.emit('v5:mb:completion_response', { completion: result.text });
  
  // 行为数据
  await eventBus.emit(V5Event.MB_COMPLETION_SHOWN, { sessionId, filePath, line });
});

// v5:mb:run_test
socket.on('v5:mb:run_test', async () => {
  const files = fileSnapshotService.getSnapshot(sessionId);
  
  const sandboxProvider = await sandboxFactory.getProvider();
  const sandbox = await sandboxProvider.create();
  
  try {
    await sandboxProvider.writeFiles(sandbox, files);
    const result = await sandboxProvider.execute(sandbox, 'pytest -v', 30000);
    
    socket.emit('v5:mb:test_result', {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      passRate: calculatePassRate(result.stdout),
      durationMs: result.durationMs,
    });
    
    await eventBus.emit(V5Event.MB_TEST_RUN, { sessionId, passRate, duration: result.durationMs });
  } finally {
    await sandboxProvider.destroy(sandbox);
  }
});

// v5:mb:file_change
socket.on('v5:mb:file_change', ({ filePath, content, source }) => {
  fileSnapshotService.setFileContent(sessionId, filePath, content, source);
});

// v5:mb:standards:submit
socket.on('v5:mb:standards:submit', async ({ rulesContent, agentContent }) => {
  await persistStandards(sessionId, { rulesContent, agentContent });
  await eventBus.emit(V5Event.MODULE_SUBMITTED, { sessionId, module: 'mb.standards' });
});

// v5:mb:audit:submit
socket.on('v5:mb:audit:submit', async ({ violations }) => {
  await persistAudit(sessionId, { violations });
  await eventBus.emit(V5Event.MODULE_SUBMITTED, { sessionId, module: 'mb.audit' });
});
```

**性能要求**：
- chat_generate stream 首 token < 2s
- completion_request < 500ms (P95)
- run_test 完整流程 < 15s (P95)

**验收**：
- 4 个 endpoint 能正常响应
- 短命 sandbox 流程正确
- 行为数据通过 EventBus 流转

**PR**: feat(mb): Cursor mode backend endpoints

---

### Task 13: 40 个信号实现（7 天）

按模块目录创建每个信号独立文件：
packages/server/src/signals/
p0/
s-baseline-reading.ts
s-ai-calibration.ts
s-decision-style.ts
s-tech-profile.ts
ma/
s-scheme-judgment.ts
s-reasoning-depth.ts
s-context-quality.ts
s-critical-thinking.ts
s-argument-resilience.ts
s-code-review-quality.ts
s-hidden-bug-found.ts
s-review-prioritization.ts
s-diagnosis-accuracy.ts
mb/
stage1/
s-task-decomposition.ts
s-interface-design.ts
s-failure-anticipation.ts
stage2/
s-prompt-quality.ts
s-iteration-efficiency.ts
s-precision-fix.ts
s-modify-quality.ts
s-block-selectivity.ts
s-challenge-complete.ts
s-verify-discipline.ts
s-ai-output-review.ts
cursor/
s-ai-completion-accept-rate.ts
s-chat-vs-direct-ratio.ts
s-file-navigation-efficiency.ts
s-test-first-behavior.ts
s-edit-pattern-quality.ts
stage3/
s-rules-quality.ts
s-rules-coverage.ts
s-rules-specificity.ts
s-agent-guidance.ts
stage4/
s-rule-enforcement.ts
horizontal/
s-writing-quality.ts
md/
s-design-decomposition.ts         (LLM + fallback)
s-constraint-identification.ts    (纯规则：类别覆盖)
s-tradeoff-articulation.ts        (LLM + fallback)
s-ai-orchestration-quality.ts     (LLM + fallback)
se/
s-meta-cognition.ts
mc/
s-boundary-awareness.ts
s-communication-clarity.ts
s-reflection-depth.ts

每个信号 export:
```typescript
export default {
  id: 'sXxx',
  dimension: V5Dimension.XXX,
  moduleSource: 'xxx',
  isLLMWhitelist: boolean,
  compute: async (input) => { /* ... */ },
  fallback: (input) => { /* 纯规则降级 */ },
} satisfies SignalDefinition;
```

**packages/server/src/signals/index.ts 统一 register**：
```typescript
import sBaselineReading from './p0/s-baseline-reading.js';
// ... 40 个 import
import { signalRegistry } from '../services/signal-registry.service.js';

export function registerAllSignals() {
  signalRegistry.register(sBaselineReading);
  // ... 40 次注册
}
```

**重点信号实现**（其他按 Phase -1 梳理的逻辑）：

**sReflectionDepth 正则扩召**（Phase -1 bug 修复）：
```typescript
const reflectionMarkers = [
  // V4 原有
  '我觉得', '我认为', '反思',
  // V5 新增（解决覆盖不足）
  '如果重来', '下次会', '学到了', '应该', '原本以为', 
  '后来发现', '换个角度', '其实', '没想到', '意识到'
];
```

**sRuleEnforcement**（替代 sConvergenceResult）：
```typescript
// 输入：audit.violations + standards.rulesContent
// 计算候选人对 3 个违规案例的识别准确率
async compute(input) {
  const audit = input.submissions.mb?.audit;
  if (!audit) return null;
  
  const rules = parseRules(input.submissions.mb.standards.rulesContent);
  
  let correctCount = 0;
  for (const v of audit.violations) {
    const example = input.examData.MB.violationExamples[v.exampleIndex];
    // 对比候选人判断和 ground truth
    if (v.markedAsViolation === example.isViolation) {
      if (example.isViolation && v.violatedRuleId) {
        // 检查候选人选的 rule 是否对应
        const expectedRuleId = matchRuleByExample(example, rules);
        if (v.violatedRuleId === expectedRuleId) correctCount += 1;
      } else if (!example.isViolation) {
        correctCount += 1;
      }
    }
  }
  
  return correctCount / audit.violations.length;
}
```

**所有 MD LLM 白名单信号的 fallback**（纯规则降级）：
```typescript
// sDesignDecomposition fallback
fallback: (input) => {
  const submission = input.submissions.moduleD;
  if (!submission) return null;
  
  const moduleCount = submission.subModules.length;
  const hasInterfaces = submission.subModules.filter(m => m.interfaces?.length).length;
  const hasResponsibility = submission.subModules.filter(m => m.responsibility.length > 20).length;
  
  // 规则近似
  const countScore = Math.min(1.0, moduleCount / 5);
  const interfaceScore = hasInterfaces / moduleCount;
  const responsibilityScore = hasResponsibility / moduleCount;
  
  return countScore * 0.3 + interfaceScore * 0.3 + responsibilityScore * 0.4;
},
```

**验收**：
- 40 个信号全部注册
- 每个信号单元测试
- LLM 白名单信号的 fallback 能正确降级

**PR**: feat(signals): 40 signals implementation

---

### Task 14: MD 后端（2 天）

创建 packages/server/src/services/modules/md.service.ts：
- persistMDSubmission
- 和 Step 7 generator 联调

Socket endpoints：
- v5:md:submit

MD 的 4 个信号已在 Task 13 实现。

**PR**: feat(md): backend

---

### Task 15: Admin 后端 API（2 天）

**session 创建 API**（packages/server/src/routes/admin-session.ts）：
```typescript
POST /admin/sessions/create
Body: {
  candidateId: string;
  suiteId: SuiteId;
  level: 'junior' | 'mid' | 'senior';
  orgId?: string;
}

// 后端逻辑：
// 1. 从 SUITES[suiteId] 读 modules
// 2. 查询匹配 level 的 ExamInstance（同 techStack + domain + level）
// 3. 创建 Session，metadata = { suiteId, moduleOrder, examInstanceId, submissions: {} }
// 4. 返回 session link
```

**session 管理**（从 V4 admin.ts fork 相关代码，重写）：
- GET /admin/sessions（列表）
- GET /admin/sessions/:id（详情）
- POST /admin/sessions/:id/rescore（重新评分）

**报告数据 API**（packages/server/src/routes/admin-report.ts）：
```typescript
GET /admin/reports/:sessionId/summary
// 返回 Layer 1 数据：grade + 6 维度分数 + 推荐结论

GET /admin/reports/:sessionId/detail
// 返回 Layer 2 数据：所有 section 的完整数据
```

**验收**：
- Admin 能创建 5 个套件的 session
- session 列表和详情
- 报告双层 API

**PR**: feat(admin): V5 backend APIs

---

## Phase 3：Golden Path + 题库 + 效度（13 天）

### Task 16: Cursor 行为 Fixture Generator（2 天）

创建 scripts/generate-cursor-behavior-fixture.ts：

输入：target grade ('S' | 'A' | 'B' | 'C')
输出：V5MBSubmission.editorBehavior 完整事件流

**S 级特征**：
- completion accept rate 50-70%
- testFirst = true（先看 tests/ 目录 >30s）
- fileNav efficient（按依赖顺序）
- chat/direct ratio 30-50%
- editPattern match dependencyOrder

**C 级特征**：
- completion accept rate 90%+ 或 <20%
- testFirst = false
- fileNav 随机
- chat/direct ratio >90% 或 <10%

A/B 级在 S 和 C 之间插值。

**验收**：
- 4 个等级生成
- 跑 5 个 Cursor 信号，得分符合预期（S≥0.85, C≤0.3）

---

### Task 17: V5 Golden Path 全套件 Fixture（5 天）

**V4 基础设施复用**：
- e2e/helpers/ 保留（A 类已复制）
- playwright.config.ts 保留

**V4 Golden Path spec 删除**：
- e2e/candidate-v4-golden-path.spec.ts 已在 C 类删除
- e2e/fixtures/golden-paths/ V4 版本删除

**V5 Golden Path 新建**：
e2e/fixtures/golden-paths-v5/
full_stack/
s-grade-fixture.ts
a-grade-fixture.ts
b-grade-fixture.ts
c-grade-fixture.ts
architect/
s-grade-fixture.ts
a-grade-fixture.ts
quick_screen/
a-grade-fixture.ts
b-grade-fixture.ts
c-grade-fixture.ts
deep_dive/
splus-grade-fixture.ts
s-grade-fixture.ts

每档 fixture 包含：
- ExamInstance + ExamModule（由 Task 10 产出）
- V5Submissions（mock 候选人数据）
- 预期信号值
- 预期 composite + dimension scores
- 预期 grade

**Golden Path spec**（e2e/candidate-v5-golden-path.spec.ts）：
```typescript
test.describe.serial('V5 Golden Path - full_stack', () => {
  test('S grade fixture', async ({ page }) => {
    const fixture = loadFixture('full_stack/s-grade');
    const result = await runGoldenPath(fixture);
    expect(result.grade).toBe('S');
    expect(result.composite).toBeCloseTo(fixture.expectedComposite, 1);
    // 验证 40 信号值
    for (const [signalId, expectedValue] of Object.entries(fixture.expectedSignals)) {
      expect(result.signals[signalId]).toBeCloseTo(expectedValue, 2);
    }
  });
  // ... A/B/C
});
```

**分层运行**：
- npm run test:golden-path → 只跑 full_stack 4 档（10 min）
- npm run test:golden-path:full → 全套件全档（60 min）

**compare-baseline-v5.ts**：
- baseline.json 存每档信号值 + composite + dimensions
- 7 个漂移规则（如单信号漂移 > 0.15 报错）

**验收**：
- L1 10 min 跑通
- L2 60 min 跑通
- compare-baseline 能检测漂移

**PR**: feat(e2e): V5 Golden Path with multi-suite fixtures

---

### Task 18: 模型一致性检查（2 天）

创建 e2e/scripts/model-consistency-check.ts：

对 MD 3 个 LLM 白名单信号：
- 同一 fixture 用 GLM-5 评分
- 同一 fixture 用 Claude Sonnet 评分
- 计算差异
- 差异 > 15% 标记为"模型敏感"
- 输出 consistency-report.json

L2 Golden Path 跑完后自动执行。

**PR**: feat(e2e): model consistency check

---

### Task 19: V5.0 首批 18 个预生成题库（6 天，并行其他 Task）

6 scenario × 3 level：
1. java_spring × payment × precision × (junior/mid/senior)
2. python_fastapi × ecommerce × concurrency × (junior/mid/senior)
3. nodejs_nest × logistics × consistency × (junior/mid/senior)
4. python_fastapi × social × performance × (junior/mid/senior)
5. java_spring × payment × consistency × (junior/mid/senior)
6. go_gin × ecommerce × concurrency × (junior/mid/senior)

每个 scenario 生成完整 6 个 ExamModule（P0/MA/MB/MD/SE/MC）。

Level 差异（Prompt 中明确）：
- systemCode: junior 150-200行 / mid 300-500 / senior 500-800
- schemes 深度: 明显差异 / 常见权衡 / 量化权衡
- scaffold: 3文件 / 4文件 / 5-6文件
- designTask: 单模块 / 子系统 / 跨系统

**脚本**：scripts/generate-v5-exam-library.ts
- 输入 ExamSpec
- 调用 Step 0-8
- 存入 DB

跑 18 次产出 18 个 ExamInstance。

**验收**：
- 18 个题库生成
- 每个 scenario 3 个 level 的难度递进明显
- 跑 full_stack A 档 fixture 验证评分合理

---

### Task 20: 性能监控埋点（1 天）

使用 A 类已复制的 Sentry + Langfuse：

**性能约束点**：
- sandbox 创建+写入+执行+返回 < 15s (P95) → Sentry transaction
- AI 生成 < 30s (P95) → Langfuse trace
- inline completion < 500ms (P95) → Sentry
- socket 事件往返 < 200ms (P95) → Sentry middleware

**报警阈值**：
- P95 超过阈值 → Sentry alert
- LLM 调用失败率 > 5% → Langfuse alert

**PR**: feat(monitoring): performance tracking

---

## Phase 4：收尾（2 天）

### Task 21: 集成测试 + 文档（2 天）

- 所有 V5 API 的 OpenAPI 生成（基于 packages/server/src/lib/openapi.ts，V4 已复制，改 V5 schema）
- Golden Path L2 完整跑通
- 性能报告产出
- 部署文档更新

---

## 工作量总结

| Phase | Task | 天数 |
|---|---|---|
| Phase 0 基建 | Task 1-8 | 15 |
| Phase 1 出题引擎 | Task 9-10 | 11 |
| Phase 2 模块和信号 | Task 11-15 | 21 |
| Phase 3 Golden Path 和题库 | Task 16-20 | 13 |
| Phase 4 收尾 | Task 21 | 2 |
| **总计** | | **62 天 / 约 12.5 周** |

---

## Backend 的契约输出（Frontend 依赖的东西）

Frontend 能开始开发的依赖点：
- Task 1 完成后：Frontend 能 import @codelens-v5/shared 的 V5 types
- Task 2 完成后：Frontend 能用 Prisma 的 session 结构
- Task 3 完成后：Frontend 能用 SUITES
- Task 4 完成后：Frontend 能调用 scoring 服务（mock 数据）
- Task 8 完成后：Frontend 能看到 SignalRegistry 的信号清单
- Task 11 完成后：MC 前端能联调
- Task 12 完成后：MB Cursor 前端能联调
- Task 15 完成后：Admin UI 能创建 session
- Task 19 完成后：有真实题库可以 E2E 测试

**Backend 建议优先级**：Task 1-4 优先（2 周内完成），让 Frontend 能启动。

