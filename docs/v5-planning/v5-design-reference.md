# V5 Design Reference (P0)

> 来源:V5 设计窗口的 P0 问题答案归档
> 归档时间:2026-04-16
> 用途:执行阶段的权威设计参考,覆盖 schema / store / signal / suite 等关键决策
> 
> **重要**:本文件内容是执行层的权威规格,和 kickoff.md / tasks.md 不一致时,
> 以本文件为准。如需修改规格,先讨论后更新本文件,再同步其他文档。

---

## P0-1: ExamModule.moduleSpecific 结构

每个模块的 moduleSpecific JSON 结构(TypeScript 接口,归属 
`packages/shared/src/types/v5-exam-modules.ts`,Backend Task 2 Step 4 前创建):

```typescript
// P0 模块
interface P0ModuleSpecific {
  systemCode: string;           // 300-500 行(按 level 调整)
  codeReadingQuestions: {
    l1: { question: string; options: string[]; correctIndex: number };
    l2: { question: string };   // textarea
    l3: { question: string };   // textarea
  };
  aiOutputJudgment: Array<{     // 2 题
    codeA: string;              // 30-50 行
    codeB: string;
    context: string;
    groundTruth: 'A' | 'B' | 'both_good' | 'both_bad';
  }>;
  decision: {
    scenario: string;
    options: Array<{ id: string; label: string; description: string }>;
  };
}

// MA 模块
interface MAModuleSpecific {
  requirement: string;
  schemes: Array<{
    id: 'A' | 'B' | 'C';
    name: string;
    description: string;
    pros: string[];
    cons: string[];
    performance: string;
    cost: string;
  }>;
  counterArguments: Record<string, string[]>;  // schemeId → 2 个反驳点
  defects: Array<{
    defectId: string;
    line: number;
    content: string;
    severity: 'critical' | 'major' | 'minor';
    category: string;
    relatedScheme?: string;
  }>;
  decoys: Array<{ line: number; content: string }>;
  codeForReview: string;        // R2 用的代码
  failureScenario: {            // R3 用
    successCode: string;
    failedCode: string;
    diffPoints: Array<{ line: number; description: string }>;
    rootCause: string;
  };
}

// MB 模块
interface MBModuleSpecific {
  featureRequirement: {
    description: string;
    acceptanceCriteria: string[];  // 5 条验收
  };
  scaffold: {
    files: Array<{
      path: string;
      content: string;           // 含 TODO 注释
      knownIssueLines?: number[];
    }>;
    tests: Array<{
      path: string;
      content: string;
      purpose: string;
    }>;
    dependencyOrder: string[];   // 文件路径数组,按依赖先后
  };
  harnessReference: {
    keyConstraints: string[];
    constraintCategories: string[];
  };
  violationExamples: Array<{     // 3 个
    exampleIndex: number;
    code: string;
    isViolation: boolean;
    violationType?: string;      // 对应 constraintCategories 之一
    explanation: string;
  }>;
}

// MD 模块
interface MDModuleSpecific {
  designTask: {
    description: string;
    businessContext: string;
    nonFunctionalRequirements: string[];
  };
  expectedSubModules: Array<{    // 参考答案,不给候选人看
    name: string;
    responsibility: string;
  }>;
  constraintCategories: string[]; // 5-7 类
  designChallenges: Array<{       // 2-3 个条件触发
    trigger: string;              // 候选人满足什么条件后触发
    challenge: string;
  }>;
}

// SE 模块
interface SEModuleSpecific {
  decisionSummaryTemplate: string;
}

// MC 模块
interface MCModuleSpecific {
  probeStrategies: {
    baseline: string;
    contradiction: string;
    weakness: string;
    escalation: string;
    transfer: string;
  };
}
```

ExamDataService 的 API(Step 4 实现时用):

```typescript
async getP0Data(examInstanceId: string): Promise<P0ModuleSpecific | null>
async getMAData(examInstanceId: string): Promise<MAModuleSpecific | null>
async getMBData(examInstanceId: string): Promise<MBModuleSpecific | null>
async getMDData(examInstanceId: string): Promise<MDModuleSpecific | null>
async getSEData(examInstanceId: string): Promise<SEModuleSpecific | null>
async getMCData(examInstanceId: string): Promise<MCModuleSpecific | null>
async getBusinessScenario(examInstanceId: string): Promise<BusinessScenario | null>
```

---

## P0-2: ExamInstance Analytics 字段(保留)

基于"效度验证 + 客户信任 + 零成本"三视角,V5 schema 保留以下 6 个字段:

```prisma
model ExamInstance {
  // ... 核心字段
  
  // Analytics(V5.0 不主动维护,V5.1+ 启用统计和区分度分析)
  usedCount           Int       @default(0)
  avgCompletionMins   Float?
  avgCompositeScore   Float?
  discriminationScore Float?
  lastUsedAt          DateTime?
  qualityReport       Json?
}
```

V5.0 这些字段不主动更新,Schema 保留是为了 V5.1 启用时避免 migration 成本。
其他 V4 字段(schemas / defectsInBest / harnessReference / scaffold / 
phase0Questions / failureScenario / samples / v4Requirement / 
calibrationStatus / deprecated / generatedAt)继续删。

---

## P0-3: Session.metadata.submissions 形状

存 Json 字段,按模块 key 分别 set(不整体覆盖)。

Session schema:

```prisma
model Session {
  id                String   @id @default(uuid())
  candidateId       String
  examInstanceId    String
  
  suiteId           String   // 'full_stack' | 'architect' | ...
  moduleOrder       String[] // ['phase0', 'moduleA', 'mb', ...]
  
  metadata          Json     // 含 V5Submissions(见下方)
  
  status            String   // 'in_progress' | 'completed' | ...
  startedAt         DateTime @default(now())
  completedAt       DateTime?
  
  scoringResult     Json?    // V5 scoring 产物,独立字段不塞 metadata
}
```

SessionMetadata 的 TypeScript 结构:

```typescript
interface SessionMetadata {
  suiteId: SuiteId;
  moduleOrder: ModuleKey[];
  submissions: V5Submissions;
  agentExecutions?: V5AgentExecution[];  // V5.2 预留
}
```

提交 API 约定:每次提交一个模块就 set 一个 `submissions.{moduleKey}` 字段。

```typescript
async function saveSubmission(sessionId: string, moduleKey: ModuleKey, data: any) {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const metadata = session.metadata as SessionMetadata;
  metadata.submissions[moduleKey] = data;
  await prisma.session.update({
    where: { id: sessionId },
    data: { metadata: metadata as any }
  });
}
```

不拆独立 Submission 表的原因:单 Json 字段查询方便 / Postgres JSON 性能够用 / 
V5.0 规模小 / 拆表的索引优势用不上。

scoringResult 独立字段的原因:语义分离(submissions 是候选人产出,scoringResult 
是 scoring 产物)+ 便于"所有 S 级 session"这类统计查询。

---

## P0-4: V5 Migration 策略

**本地阶段**(开发):
```bash
cd packages/server
rm -rf prisma/migrations
npx prisma validate   # V5 用 validate,不跑 migrate dev(本地没 DB)
```

**生产阶段**(上线):
```bash
# 服务器 115.190.118.235
PGPASSWORD=CodeLens2026x psql -h 127.0.0.1 -U codelens -d postgres \
  -c "CREATE DATABASE codelens_v5_dev"

cd /opt/codelens-v5  # V5 新目录(不和 V4 共用)
npx prisma migrate deploy  # 生产用 deploy,不是 dev
```

核心约束:
- 不用 `prisma db push`(生产不稳)
- 不跳过 migration 文件(无法回滚)
- V4 DB 保留叫 `codelens_db` 不动,V5 用 `codelens_v5_dev`
- V4 的 23 条 session 不迁移(V5 没有 V4 用户延续)

CI:workflow 已加 `npx prisma generate`(Task 2 Step 1 实现)。


---

## P0-5: module.store.ts 完整 API

```typescript
interface ModuleStore {
  // 状态
  suiteId: SuiteId | null;
  moduleOrder: ModuleKey[];
  currentModule: ModuleKey | 'intro' | 'complete' | null;
  isComplete: boolean;
  
  // 基础 actions
  advance: () => void;
  setSuite: (suiteId: SuiteId, moduleOrder: ModuleKey[]) => void;
  reset: () => void;
  
  // Getter
  getCurrentModuleIndex: () => number;
  getProgress: () => { 
    completed: number; 
    total: number; 
    percentage: number;
    remainingMinutes: number;
  };
}
```

**明确不支持**(评估产品原则:提交即定稿):
- `canGoBack` / `goBack`:候选人不能回退
- `goToModule`:跳跃破坏状态机
- `skipModule`:V5.0 不支持跳过(MB Stage 1 的"可跳过"是 Stage 内部状态)

getProgress.remainingMinutes 算法:

```typescript
const avgMinutes = SUITES[suiteId].estimatedMinutes / totalModules;
const remaining = (totalModules - completed) * avgMinutes;
```

---

## P0-6: session.store.ts 完整 API

```typescript
interface SessionStore {
  // 状态
  sessionId: string | null;
  candidateId: string | null;
  suiteId: SuiteId | null;
  examInstanceId: string | null;
  moduleOrder: ModuleKey[];
  submissions: Partial<V5Submissions>;
  
  // Actions
  loadSession: (sessionId: string) => Promise<void>;
  setModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K,
    data: V5Submissions[K]
  ) => Promise<void>;
  getModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K
  ) => V5Submissions[K] | undefined;
  
  // DecisionSummary 用
  getDecisionSummary: () => {
    ma?: { schemeId: string; reasoning: string };
    mb?: { decomposition: string };
    md?: { subModuleCount: number; constraintCount: number };
  };
  
  reset: () => void;
}
```

setModuleSubmission 是 async,三步:
1. 更新本地 state
2. `socket.emit('v5:{moduleKey 小写}:submit', data)`
3. 等待 ack

Socket 事件命名:
- moduleA → `v5:modulea:submit`
- moduleC → `v5:modulec:submit`(保持 V4 约定)

**不支持**:
- setAllSubmissions(违反"每模块独立提交"原则)
- clearSubmission(已提交不可清除)
- getAllSubmissions(按需 getModuleSubmission)

不用 localStorage(V5.0 Cursor 模式文件快照由 Backend FileSnapshotService 管)。

---

## P0-7: 候选人流程 4 个新文件

### EvaluationIntroPage.tsx

UI 结构:

```
┌─────────────────────────────────────────────┐
│  [公司 logo]                                │
│                                             │
│  欢迎参加 {orgName} 技术评估                 │
│                                             │
│  本次评估                                    │
│    套件: {suite.nameZh}                     │
│    预计时长: {suite.estimatedMinutes} 分钟  │
│    包含模块: {moduleOrder.length} 个        │
│                                             │
│    · {icon} 基础代码阅读                    │
│    · {icon} 方案权衡与代码审查               │
│    · {icon} AI 协作编程                     │
│    · ...                                    │
│                                             │
│  评估说明                                    │
│    · 本次评估围绕一个真实业务系统展开         │
│    · 所有模块都针对同一系统的不同切面         │
│    · 支持 AI 协作                           │
│    · 评估不可暂停                           │
│    · 提交后无法返回修改                      │
│                                             │
│      [ 我已理解,开始评估 ]                  │
└─────────────────────────────────────────────┘
```

Props:无(从 useSessionStore 读 sessionId/suiteId,SUITES 读套件信息)。

交互:
- 页面加载时 `loadSession(sessionId)`
- 点"开始评估" → `moduleStore.advance()` → 进入第一个模块
- 如果 session 已 in_progress,不展示 intro 直接跳到当前模块

data-testid:
- `evaluation-intro-container`
- `evaluation-intro-start-button`
- `evaluation-intro-suite-name`
- `evaluation-intro-estimated-minutes`
- `evaluation-intro-module-list`

### ProgressIndicator.tsx

UI:

```
┌─────────────────────────────────────────────┐
│  评估进度                                    │
│                                             │
│  [✓]──[✓]──[●]──[ ]──[ ]──[ ]              │
│   P0   MA   MB   MD   SE   MC               │
│                                             │
│  已完成 2/6 模块 · 剩余约 28 分钟            │
└─────────────────────────────────────────────┘
```

视觉状态:
- ✓ 已完成:实心圆 + 勾号
- ● 进行中:实心圆 + 颜色高亮
- ○ 未开始:空心圆

Props:

```typescript
interface ProgressIndicatorProps {
  compact?: boolean;
  showMinutes?: boolean;
}
```

数据从 moduleStore 订阅,不从 props 传。

data-testid:
- `progress-indicator-container`
- `progress-module-{moduleKey}`
- `progress-completed-count`
- `progress-remaining-minutes`

位置:每个模块页面顶部(TopBar 下方)或 TopBar 内。

### App.tsx(路由)

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/exam/:sessionId" element={<ExamRouter />} />
        <Route path="/admin/*" element={<AdminRoutes />} />
        <Route path="/share/report/:token" element={<SharedReportPage />} />
        <Route path="/" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function ExamRouter() {
  const { sessionId } = useParams();
  const { currentModule } = useModuleStore();
  const { loadSession } = useSessionStore();
  
  useEffect(() => {
    if (sessionId) loadSession(sessionId);
  }, [sessionId]);
  
  switch (currentModule) {
    case null:
    case 'intro': return <EvaluationIntroPage />;
    case 'phase0': return <Phase0Page />;
    case 'moduleA': return <ModuleAPage />;
    case 'mb': return <ModuleBPage />;
    case 'moduleD': return <ModuleDPage />;
    case 'selfAssess': return <SelfAssessPage />;
    case 'moduleC': return <ModuleCPage />;
    case 'complete': return <CompletePage />;
    default: return <ErrorPage message="未知模块" />;
  }
}
```

注意:moduleC 大写 C(对应 V5Submissions.moduleC)。Socket 事件保持 
`v5:modulec:*` 小写。

### module.store.ts

见 P0-5。

---

## P0-8: DecisionSummary 组件

Props:

```typescript
interface DecisionSummaryProps {
  sessionId: string;
  variant?: 'minimal' | 'detailed';  // V5.0 用 minimal
}
```

实现:

```typescript
export function DecisionSummary({ sessionId, variant = 'minimal' }: DecisionSummaryProps) {
  const summary = useSessionStore(state => state.getDecisionSummary());
  
  if (!summary.ma && !summary.mb && !summary.md) return null;
  
  return (
    <Card className="decision-summary">
      <CardHeader>
        <CardTitle>你的前序决策回顾</CardTitle>
        <CardDescription>
          在下面自评前,先回顾一下你做过的关键决策
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.ma && (
          <div data-testid="decision-summary-ma">
            <strong>MA 方案选择:</strong>
            <span>方案 {summary.ma.schemeId}</span>
            <p className="reasoning">{truncate(summary.ma.reasoning, 100)}</p>
          </div>
        )}
        {summary.mb && (
          <div data-testid="decision-summary-mb">
            <strong>MB 编排思路:</strong>
            <p>{truncate(summary.mb.decomposition, 80)}</p>
          </div>
        )}
        {summary.md && (
          <div data-testid="decision-summary-md">
            <strong>MD 设计规模:</strong>
            <span>
              {summary.md.subModuleCount} 个子模块 · 
              选择 {summary.md.constraintCount} 类约束
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

数据提取逻辑(session.store.getDecisionSummary):

```typescript
getDecisionSummary: () => {
  const s = get().submissions;
  return {
    ma: s.moduleA ? {
      schemeId: s.moduleA.round1.schemeId,
      reasoning: s.moduleA.round1.reasoning,
    } : undefined,
    mb: s.mb?.planning ? {
      decomposition: s.mb.planning.decomposition.split('\n')[0],
    } : undefined,
    md: s.moduleD ? {
      subModuleCount: s.moduleD.subModules.length,
      constraintCount: s.moduleD.constraintsSelected.length,
    } : undefined,
  };
}
```

SelfAssessPage 接入:

```tsx
<div className="self-assess-page">
  <DecisionSummary sessionId={sessionId} variant="minimal" />
  <ConfidenceSlider value={confidence} onChange={setConfidence} />
  <ReasoningTextarea value={reasoning} onChange={setReasoning} />
  <SubmitButton onClick={handleSubmit} />
</div>
```


---

## P0-9: 5 套件 weightProfile 权重

已在 `packages/shared/src/types/v5-suite.ts` 定义(Backend Task 1 已 merge)。
完整权重如下(供 Frontend 和 scoring 验证对齐):

```typescript
full_stack: {
  technicalJudgment: 0.25,
  aiEngineering:     0.25,
  codeQuality:       0.20,
  communication:     0.15,
  metacognition:     0.10,
  systemDesign:      0.05,   // 不参与时通过 N/A rescaling 忽略
}

architect: {
  technicalJudgment: 0.25,
  systemDesign:      0.30,
  communication:     0.20,
  codeQuality:       0.10,
  metacognition:     0.10,
  aiEngineering:     0.05,
}

ai_engineer: {
  aiEngineering:     0.40,   // 翻倍
  technicalJudgment: 0.20,
  codeQuality:       0.15,
  communication:     0.15,
  metacognition:     0.05,
  systemDesign:      0.05,
}

quick_screen: {
  technicalJudgment: 0.35,
  aiEngineering:     0.30,
  codeQuality:       0.20,
  metacognition:     0.15,
  communication:     0,      // 不评
  systemDesign:      0,
}

deep_dive: {
  technicalJudgment: 0.20,
  aiEngineering:     0.20,
  systemDesign:      0.20,
  codeQuality:       0.15,
  communication:     0.15,
  metacognition:     0.10,
}
```

full_stack vs ai_engineer 的差异不只是 aiEngineering 一项,是 4 个维度:
- aiEngineering: 0.25 → 0.40
- technicalJudgment: 0.25 → 0.20
- codeQuality: 0.20 → 0.15
- metacognition: 0.10 → 0.05

每个 suite 的 weightProfile 总和 = 1.0(quick_screen 的 communication 和 
systemDesign 是 0 不参与,其他非零项和为 1.0)。

---

## P0-10: gradeCandidate 规则(硬 cap + 维度 floor)

**硬 cap**:超过 cap 的 grade 直接降到 cap,不是降一级:

```typescript
const gradeOrder = ['D', 'C', 'B', 'B+', 'A', 'S', 'S+'];
const currentIdx = gradeOrder.indexOf(computedGrade);
const capIdx = gradeOrder.indexOf(suite.gradeCap);

if (currentIdx > capIdx) {
  finalGrade = suite.gradeCap;  // 直接降到 cap
}
```

例:quick_screen(capA)computed 出 S+ → 最终 A(不是 A+ 或 S)。

**dimensionFloors 具体数值**(shared 已定义):

```typescript
full_stack: {
  'S': { technicalJudgment: 80, aiEngineering: 80, codeQuality: 75 },
  'A': { technicalJudgment: 70, aiEngineering: 70, codeQuality: 65 },
}

architect: {
  'S+': { technicalJudgment: 85, systemDesign: 85, communication: 80 },
  'S':  { technicalJudgment: 78, systemDesign: 78, communication: 72 },
}

ai_engineer: {
  'S': { aiEngineering: 85, technicalJudgment: 75, codeQuality: 70 },
  'A': { aiEngineering: 75, technicalJudgment: 65, codeQuality: 60 },
}

quick_screen: {
  'A':  { technicalJudgment: 70, aiEngineering: 65, codeQuality: 60 },
  'B+': { technicalJudgment: 60, aiEngineering: 55, codeQuality: 50 },
}

deep_dive: {
  'S+': { technicalJudgment: 85, aiEngineering: 80, systemDesign: 85, communication: 80 },
  'S':  { technicalJudgment: 78, aiEngineering: 75, systemDesign: 75, communication: 72 },
}
```

floor 检查逻辑:
- composite 达到 S 分(≥85)但某维度 floor 不达标 → 不给 S,降一级到 A
- 降级后再检查新等级 floor,不达标继续降
- 未参与维度(N/A)的 floor 跳过不检查

**B- dangerFlag**(不改 grade,只标记,报告加警告):

```typescript
const dangerFlag = 
  composite >= 55 &&
  participating.has('technicalJudgment') &&
  participating.has('codeQuality') &&
  dims.technicalJudgment < 50 &&
  dims.codeQuality >= 60 &&
  (dims.codeQuality - dims.technicalJudgment) > 15;
```

含义:代码质量高但技术判断弱 → 可能是"AI 代码依赖症"候选人。

---

## P0-11: 43 信号 dimension 映射表

V5.0 共 **43 信号**(不是 40),3 个 LLM 白名单全在 MD。

| 模块 | 信号 | 维度 | LLM 白名单 | 权重 |
|---|---|---|---|---|
| P0 | sBaselineReading | technicalJudgment | 否 | 标准 |
| P0 | sAiCalibration | metacognition | 否 | 标准 |
| P0 | sDecisionStyle | metacognition | 否 | 标准 |
| P0 | sTechProfile | metacognition | 否 | **0.1 轻度** |
| MA | sSchemeJudgment | technicalJudgment | 否 | 标准 |
| MA | sReasoningDepth | technicalJudgment | 否 | 标准 |
| MA | sContextQuality | technicalJudgment | 否 | 标准 |
| MA | sCriticalThinking | technicalJudgment | 否 | 标准 |
| MA | sArgumentResilience | technicalJudgment | 否 | 标准 |
| MA | sCodeReviewQuality | codeQuality | 否 | 标准 |
| MA | sHiddenBugFound | codeQuality | 否 | 标准 |
| MA | sReviewPrioritization | codeQuality | 否 | 标准 |
| MA | sDiagnosisAccuracy | technicalJudgment | 否 | 标准 |
| MB | sTaskDecomposition | aiEngineering | 否 | 标准 |
| MB | sInterfaceDesign | aiEngineering | 否 | 标准 |
| MB | sFailureAnticipation | aiEngineering | 否 | 标准 |
| MB | sPromptQuality | aiEngineering | 否 | 标准 |
| MB | sIterationEfficiency | aiEngineering | 否 | 标准 |
| MB | sPrecisionFix | aiEngineering | 否 | 标准 |
| MB | sAiCompletionAcceptRate | aiEngineering | 否 | 标准 |
| MB | sChatVsDirectRatio | aiEngineering | 否 | 标准 |
| MB | sFileNavigationEfficiency | aiEngineering | 否 | 标准 |
| MB | sTestFirstBehavior | aiEngineering | 否 | 标准 |
| MB | sEditPatternQuality | aiEngineering | 否 | 标准 |
| MB | sModifyQuality | codeQuality | 否 | 标准 |
| MB | sBlockSelectivity | codeQuality | 否 | 标准 |
| MB | sChallengeComplete | codeQuality | 否 | 标准 |
| MB | sVerifyDiscipline | codeQuality | 否 | 标准 |
| MB | sAiOutputReview | codeQuality | 否 | 标准 |
| MB | sRulesQuality | codeQuality | 否 | 标准 |
| MB | sRulesCoverage | codeQuality | 否 | 标准 |
| MB | sRulesSpecificity | codeQuality | 否 | 标准 |
| MB | sAgentGuidance | aiEngineering | 否 | 标准 |
| MB | sWritingQuality | communication | 否 | 标准 |
| MB | sRuleEnforcement | codeQuality | 否 | 标准 |
| MD | sDesignDecomposition | systemDesign | **是** | 标准 |
| MD | sConstraintIdentification | systemDesign | 否 | 标准 |
| MD | sTradeoffArticulation | systemDesign | **是** | 标准 |
| MD | sAiOrchestrationQuality | aiEngineering | **是** | 标准 |
| SE | sMetaCognition | metacognition | 否 | 标准 |
| MC | sBoundaryAwareness | communication | 否 | 标准 |
| MC | sCommunicationClarity | communication | 否 | 标准 |
| MC | sReflectionDepth | metacognition | 否 | 标准 |

**维度信号数分布**(合计 43):
- technicalJudgment: 7 个(P0×1 + MA×6)
- aiEngineering: 13 个(MB×12 + MD×1)
- codeQuality: 12 个(MA×3 + MB×9)
- communication: 3 个(MB×1 + MC×2)
- metacognition: 5 个(P0×3 + SE×1 + MC×1,含 sTechProfile)
- systemDesign: 3 个(MD×3)

**权重聚合规则**:
- SignalDefinition 可选 `weight` 字段,默认 1.0;sTechProfile 唯一例外,weight = 0.1。
- 维度分 = `sum(value * weight) / sum(weight)`,value 为 null 的信号从分子分母同时剔除(N/A rescaling)。

```typescript
// metacognition 聚合示例(weights: sTechProfile=0.1, 其余=1.0)
// sum(weight) = 1 + 1 + 1 + 1 + 0.1 = 4.1
meta = (
  sAiCalibration * 1.0 +
  sDecisionStyle * 1.0 +
  sMetaCognition * 1.0 +
  sReflectionDepth * 1.0 +
  sTechProfile * 0.1
) / 4.1
```

- 未参与模块的信号 = null,按 N/A rescaling 从 sum(weight) 中同步剔除。

---

## 更新记录

| 日期 | 修订 | 来源 |
|---|---|---|
| 2026-04-16 | P0 问题 1-11 归档 | V5 设计窗口 P0 答案 |

