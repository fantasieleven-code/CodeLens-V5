我按"**直接影响当前 Task 2 及未来 2 周工作**"和"**影响后续 debug/维护**"分两档。先回答 P0,P1 可以之后慢慢补。

---

## P0 — 立刻需要,影响本周决策

### 1. schema 相关(影响当前 Backend Task 2)
1. **ExamModule.moduleSpecific(Json 字段)里每个模块的结构长什么样?** Backend 要写 ExamDataService 的 getModuleData<T> 类型参数 T,需要知道每个 module 的 moduleSpecific 有什么字段。
2. **ExamInstance 是否需要保留 V4 的某些 analytics 字段(discriminationScore / usedCount 等)用于题库复用?** 上轮我让 Backend 全删,如果前窗设计时本来有"题库分析"规划,我就删错了。
3. **Session.metadata 里 submissions 字段的 V5 具体形状?** 是 `V5Submissions` 全量,还是分模块 lazy 存?是 Json 还是 Prisma 结构字段?
4. **V5 初始 migration 的策略**:是跑 `prisma migrate dev` 在服务器 DB 建表,还是先 `prisma validate` 本地通过,部署时再 migrate?

### 2. Frontend 当前工作(影响批 2b/3)
5. **V5 module.store.ts 的完整 API spec** 我在批 2a 临时定的:`suiteId / moduleOrder / currentModule / isComplete / advance / setSuite / reset`。前窗原始设计里还缺哪些?比如 `canGoBack?`、`progress percentage?`、`getCurrentModuleIndex?`
6. **V5 session.store.ts 的完整接口**,特别是 submissions 怎么存怎么读:是按模块 key 分别 setModuleSubmission,还是整体 setSubmissions?
7. **候选人流程 4 个新文件(EvaluationIntroPage / ProgressIndicator / App.tsx / module.store.ts)具体要做什么?** tasks.md 里说得简略,前窗有没有更详细的 UI 设计或交互图?
8. **DecisionSummary 组件(Task 9 建)的具体 props 和数据提取逻辑**:前窗定过的话我现在就先给前端看,批 2 时 SelfAssessPage 预留接入点

### 3. 集成点(影响 Backend Task 3-5)
9. **5 个套件的 weightProfile 具体权重值**:每个 suite 下 6 维度各多少权重?full_stack 和 ai_engineer 的差异是不是只有 aiEngineering 0.15→0.30?
10. **gradeCandidate 的 cap + floor 规则细节**:quick_screen capA 是怎么实现的?硬 cap 还是软 cap(S+降到A)?每个维度的 floor 数值具体是多少?
11. **40 信号的 dimension 映射表**:每个信号归属哪个维度,权重多少?前窗应该有一张完整表

---

## P1 — 这 1-2 周内要,影响后续 Task

### 4. 生成器相关(影响 Epsilon / Task 3-4)
12. **Step 0-8 generator 的每步输入输出 schema**:9 步各自的 prompt 框架、输入 context、输出字段
13. **前窗是否已经调优过 Step 0 的 prompt?** 调优迭代几轮了?合格标准是什么?
14. **V5.0 首批 6 个 BusinessScenario 的具体选择**:techStack × domain × challengePattern × level 的组合是哪 6 个?前窗有没有定?

### 5. Cursor 模式细节(影响 Task 5-7)
15. **Stage 1-4 具体状态机转换的完整规则**:比如 Stage 1 可跳过"本身是信号",跳过标记存哪里怎么计算
16. **Cursor 5 个行为信号的具体计算公式**:
    - sAiCompletionAcceptRate 反 U 曲线:x=0.5-0.7 最优,具体函数是?
    - sChatVsDirectRatio:30-50% 最优,怎么算"每个 action 的"而不是时长
    - sFileNavigationEfficiency:用什么 metric(比如 dependency order 匹配度)
    - sTestFirstBehavior:判断标准是"第一个看的是 tests/ 文件"还是"前 30 秒内看了 tests"
    - sEditPatternQuality:具体怎么 match scaffold 的 dependencyOrder
17. **Monaco inline completion 的 debounce 500ms 是硬数字还是 tunable?** 前窗讨论过这个数字的来源吗
18. **E2B / Docker / Static 三级降级的触发条件**:E2B 不可用到 Docker 是 hard check(API timeout)还是 soft check(quota 接近上限)?

### 6. MC(Module C)细节(影响 Task 11)
19. **MC probe 5 轮策略(baseline→contradiction→weakness→escalation→transfer)的每轮具体 prompt 模板**
20. **MC signal 的 3 个(sBoundaryAwareness / sCommunicationClarity / sReflectionDepth)计算规则**
21. **MC 前序 submission 锚点追问的具体机制**:Emma 怎么从 MA/MB/MD submission 里提取可追问点?

---

## P2 — 以后 debug 时要,影响维护

### 7. 效度与数据
22. **V5.0 发布后效度验证计划的详细方案**:20-30 人怎么选?评级标准?Spearman 计算细节?
23. **Golden Path fixture 每个等级(S/A/B/C)的"理想答案"**:S 级候选人在每个模块应该提交什么样的内容
24. **V4 过往 23 条 session 的基线数据**:这些 session 在 V4 的得分分布,V5 如果重放能否对齐

### 8. 部署与运维
25. **服务器 115.190.118.235 的 Postgres 配置**:版本、端口是否对公网开、backup 策略
26. **V5 上线切换的 runbook**:DNS / nginx / 数据库 / 证书 / 回滚机制
27. **现有监控、日志、alerting**:V4 有什么可以复用的?V5 需要加什么

### 9. 产品生态(这些你大概已经有,只是我不知道)
28. **CodeLens 的付费模型**:B 端买"每次评估 N 元"还是订阅制?
29. **客户试用会议的目标客户是谁**(行业、规模、决策链)
30. **MockPro 当前的 DAU / MAU / 付费转化率**(影响飞轮优先级判断)

---

## 给前窗的询问模板

把上面 30 个问题(或你选择的子集)贴给前窗,加一句:

```
我在新窗口推进 V5 执行,需要你在设计阶段积累的信息。请按问题序号逐条简短回答,
无需展开。如果某些问题当时没定,直接说"未定"或"需要现做决策",我记录下来。

如果答案长,可以分批回,每批 10 个。先回 P0 的 1-11 题。
```

---

## 几个操作建议

**建议 1:不要一次问 30 个**

前窗回 30 个问题会超长,容易遗漏。**分 3 批**:
- 批 1:P0 (1-11 题) — 回来我用,影响本周
- 批 2:P1 (12-21 题) — 后续 Task 启动时补
- 批 3:P2 (22-30 题) — 慢慢来

**建议 2:收集答案后归档到仓库**

前窗的回答不要只在对话里——**让一个 agent 把答案整理成 markdown 存到 `docs/v5-planning/v5-design-reference.md`**,未来所有 agent 都能查。这也是 memory 的一种持久化。

**建议 3:区分"已定"vs"待定"**

前窗的回答会分两类:
- **已定的决策**:我记录下来,后续按此执行
- **待定的,需要现在决策**:你来找我拍板,我帮你列选项

后一类是**今天节奏累的根源**——设计阶段没定的东西,执行阶段一定会冒出来。提前问出来,比被 Backend/Frontend 撞到再 block 强。

---

## 推荐执行顺序

1. **现在**:贴上面 P0 的 1-11 题给前窗
2. **前窗回答 P0**:你贴给我
3. **我基于答案**:
   - 修正当前正在走的决策(比如 Backend residual fields 删错的话回退)
   - 更新 Frontend 批 3 的 store spec
   - 给你后续 Task 的调度指令
4. **过几天**:补问 P1(11-21)和 P2(22-30)

先这么办。有什么问题我补或删再告诉我。

分批回答。先给 P0 (问题 1-11)。

---

## P0 第 1-4 题：Schema 相关

### 1. ExamModule.moduleSpecific 的结构

**直接回答。已定。**

每个模块的 moduleSpecific JSON 结构：

```typescript
// P0 模块
interface P0ModuleSpecific {
  systemCode: string;           // 300-500 行（按 level 调整）
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
    dependencyOrder: string[];   // 文件路径数组，按依赖先后
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
  expectedSubModules: Array<{    // 参考答案，不给候选人看
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
  // SE 题目不需要 examInstance 特有数据，是通用自评
  // 但需要从其他模块提取"决策摘要"（V5 新增）
  decisionSummaryTemplate: string;  // 模板
}

// MC 模块
interface MCModuleSpecific {
  probeStrategies: {
    baseline: string;       // baseline prompt 引用 key
    contradiction: string;
    weakness: string;
    escalation: string;
    transfer: string;
  };
  // MC 的动态上下文在 runtime 构建，examData 存策略引用
}
```

Backend 的 ExamDataService 可以这样签名：

```typescript
async getModuleData<T extends P0ModuleSpecific | MAModuleSpecific | MBModuleSpecific | MDModuleSpecific | SEModuleSpecific | MCModuleSpecific>(
  examInstanceId: string,
  moduleType: ModuleType
): Promise<T | null>
```

或者更干净的做法是按 moduleType 重载：

```typescript
async getP0Data(examInstanceId: string): Promise<P0ModuleSpecific | null>
async getMAData(examInstanceId: string): Promise<MAModuleSpecific | null>
// ...
```

这些 interface 应该加到 `packages/shared/src/types/v5-exam-modules.ts`（新文件）。Backend Task 2 需要先加这个文件再写 ExamDataService。

### 2. ExamInstance 是否保留 V4 的 analytics 字段

**三视角讨论。不确定。**

V4 的 analytics 字段包括：
- discriminationScore（区分度）
- usedCount（使用次数）
- avgDuration
- avgScore
- 可能还有 qualityReport

**Karpathy**：
"题库分析是效度验证的必备数据。V5.0 就 18 个预生成题库，如果没有 usedCount 和 avgScore，上线 3 个月后你根本不知道哪些题在区分候选人、哪些是废题。删了就是把产品迭代的耳朵塞住。analytics 字段必须保留。"

**Gemini**：
"客户角度看，题库质量是销售故事的一部分。如果客户问'你们的题目经过多少次验证？每道题的通过率分布？'你答不上来就显得不专业。discriminationScore 对 to B 客户来说是信任凭证。保留。"

**Claude Code 工程**：
"V5 Phase -1 没说要复用 V4 analytics 数据（V4 没有真实候选人数据，analytics 都是 0）。但 schema 保留字段是几乎零成本——几个 Int 和 Float 字段加 default 0。删除的成本是未来要加回去就得改 migration。建议保留。"

**结论：保留。**

具体保留哪些字段：

```prisma
model ExamInstance {
  // ... 核心字段
  
  // Analytics（V5.0 暂不使用，V5.1+ 启用）
  usedCount           Int      @default(0)
  avgCompletionMins   Float?
  avgCompositeScore   Float?
  discriminationScore Float?   // V4 已有的统计指标
  lastUsedAt          DateTime?
  qualityReport       Json?    // Step 8 产出的自检报告
  
  // ... 继续其他字段
}
```

**Backend 现在要做的**：
- Task 2 的 schema 加回这些字段（default 值都是 0/null）
- 不需要写对应的更新逻辑（V5.0 不主动维护）
- V5.1 再启用

这个是我之前给 Backend 的指令里的遗漏。让 Backend 补。

### 3. Session.metadata.submissions 形状

**直接回答。已定。**

存 Json 字段，结构符合 V5Submissions interface。**按模块 key 分别 set**，不要整体覆盖。

```prisma
model Session {
  id                String   @id @default(uuid())
  schemaVersion     Int      @default(5)
  candidateId       String
  examInstanceId    String
  
  suiteId           String   // 'full_stack' | 'architect' | ...
  moduleOrder       String[] // ['phase0', 'moduleA', 'mb', ...]
  
  metadata          Json     // 含 V5Submissions
  
  status            String   // 'in_progress' | 'completed' | ...
  startedAt         DateTime @default(now())
  completedAt       DateTime?
  
  // V5 scoring 结果（computed 后填充）
  scoringResult     Json?    // { signals, dimensions, composite, grade, dangerFlag }
  
  // ...
}
```

`metadata` 的结构：
```typescript
interface SessionMetadata {
  suiteId: SuiteId;
  moduleOrder: ModuleKey[];
  submissions: V5Submissions;  // 从 shared types import
  // V5.2 预留
  agentExecutions?: V5AgentExecution[];
}
```

**提交 API 约定**：每次提交一个模块就 set 一个 submissions.{moduleKey} 字段，其他模块不动。

```typescript
// 伪代码
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

**不要拆成独立 Submission 表**。原因：
- 单 Json 字段查询方便
- V5 规模还小，Postgres JSON 性能足够
- 拆表的好处（索引查询）V5.0 用不上

**但 scoringResult 单独字段**，不放 metadata：
- scoring 是只读产物，和 submission 语义不同
- 便于将来查询"所有 S 级 session"这种统计

### 4. V5 初始 migration 策略

**直接回答。**

**分两步走**：

**Step 1：Backend 本地**
```bash
cd packages/server
# 删除 V4 migrations 文件夹
rm -rf prisma/migrations

# 本地创建全新 init_v5 migration（需要本地 dev 数据库）
npx prisma migrate dev --name init_v5 --create-only

# 检查生成的 SQL 是否正确
cat prisma/migrations/*_init_v5/migration.sql

# 应用到本地 dev DB
npx prisma migrate dev
```

**Step 2：生产服务器**
**不要**直接在生产跑 `prisma migrate dev`。生产用 `migrate deploy`：

```bash
# 在服务器 115.190.118.235 上
cd /opt/codelens-v5  # V5 新目录
npx prisma migrate deploy
```

**生产部署策略**：
1. 先备份 V4 生产 DB（V4 的 23 个 session 在这里）
2. 创建独立的 V5 DB（不共用 V4 DB）
   - 推荐新 DB 名字：`codelens_v5`
   - V4 DB 保留叫 `codelens_v4` 不动
3. V5 应用连接新 DB，跑 `migrate deploy`
4. V4 session 数据不需要迁移（V5 没有 V4 用户）

**Schema 验证**：Backend commit schema 前先跑 `npx prisma validate`，确保 schema 语法正确。CI 可以加这个检查。

**关键约束**：
- 不要用 `prisma db push`（生产环境不稳）
- 不要跳过 migration 文件（无法回滚）
- 每次 schema 改动都生成新 migration，走 Task 审核

---

## P0 第 5-8 题：Frontend 当前工作

### 5. V5 module.store.ts 完整 API

**直接回答。**

你临时定的 7 个方法是对的。需要补充以下：

```typescript
interface ModuleStore {
  // === 已有 ===
  suiteId: SuiteId | null;
  moduleOrder: ModuleKey[];
  currentModule: ModuleKey | 'intro' | 'complete' | null;
  isComplete: boolean;
  advance: () => void;
  setSuite: (suiteId: SuiteId, moduleOrder: ModuleKey[]) => void;
  reset: () => void;
  
  // === 补充 ===
  getCurrentModuleIndex: () => number;  // 当前模块在 moduleOrder 的索引
  getProgress: () => { 
    completed: number; 
    total: number; 
    percentage: number;
    remainingMinutes: number;  // 基于 SUITES[suiteId].estimatedMinutes 和剩余模块估算
  };
  
  // 不要 canGoBack / goBack
  // 候选人流程不允许回退（避免篡改已提交答案）
  
  // === V5.0 不要 ===
  // goToModule(module): 跳跃会破坏状态机
  // skipModule(): V5.0 不支持跳过（MB Stage 1 的"可跳过"是 Stage 内部状态）
}
```

**为什么不要 canGoBack**：

评估类产品核心是"答案不可篡改"。候选人一旦提交 P0 就不能回去改。这是产品原则。如果候选人提交后发现错了，联系 admin 重置 session（低频操作不做 UI）。

**getProgress 的 remainingMinutes 计算**：

```typescript
getProgress: () => {
  const totalModules = state.moduleOrder.length;
  const currentIdx = state.getCurrentModuleIndex();
  const completed = currentIdx + (state.isComplete ? 1 : 0);
  
  // 简单估算：每模块平均耗时 = suite.estimatedMinutes / moduleOrder.length
  const avgMinutes = SUITES[state.suiteId].estimatedMinutes / totalModules;
  const remainingMinutes = Math.max(0, (totalModules - completed) * avgMinutes);
  
  return {
    completed,
    total: totalModules,
    percentage: (completed / totalModules) * 100,
    remainingMinutes,
  };
}
```

### 6. V5 session.store.ts 完整接口

**直接回答。**

```typescript
interface SessionStore {
  sessionId: string | null;
  candidateId: string | null;
  suiteId: SuiteId | null;
  examInstanceId: string | null;
  moduleOrder: ModuleKey[];
  
  // submissions 按模块 key 分别存
  submissions: Partial<V5Submissions>;
  
  // Actions
  loadSession: (sessionId: string) => Promise<void>;
  setModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K,
    data: V5Submissions[K]
  ) => Promise<void>;
  
  // 只读 query（不提供 setAllSubmissions）
  getModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K
  ) => V5Submissions[K] | undefined;
  
  // 决策摘要提取（DecisionSummary 组件用）
  getDecisionSummary: () => {
    ma?: { schemeId: string; reasoning: string };
    mb?: { decomposition: string };  // planning 的 decomposition 第一行
    md?: { subModuleCount: number; constraintCount: number };
  };
  
  reset: () => void;
}
```

**setModuleSubmission 是 async**（因为要 emit socket 事件给 backend 保存）：

```typescript
setModuleSubmission: async (moduleKey, data) => {
  // 1. 更新本地 state
  set({ submissions: { ...state.submissions, [moduleKey]: data } });
  
  // 2. 发送到 backend（socket 或 REST）
  socket.emit(`v5:${moduleKey.toLowerCase()}:submit`, data);
  
  // 3. 等待 ack
  // ...
}
```

**注意**：
- Socket 事件前缀映射：`moduleA` → `v5:modulea:submit`（小写），`moduleC` → `v5:modulec:submit`（保持 V4 约定）
- Backend 收到后写 Session.metadata.submissions
- 不要 localStorage 持久化（V5.0 Cursor 模式文件快照交给 Backend FileSnapshotService）

**不需要的方法**：
- `setAllSubmissions`：批量设置违反"每个模块独立提交"原则
- `clearSubmission`：不允许清除已提交（符合产品原则）
- `getAllSubmissions`：前端不需要一次性读所有（按需 getModuleSubmission）

### 7. 候选人流程 4 个新文件详细设计

**直接回答。按 UI 设计给。**

#### EvaluationIntroPage.tsx

```
┌─────────────────────────────────────────────┐
│                                             │
│  [公司 logo]                                │
│                                             │
│  欢迎参加 {orgName} 技术评估                 │
│                                             │
│  ──────────────────────────────             │
│                                             │
│  本次评估                                    │
│    套件: {suite.nameZh}                     │
│    预计时长: {suite.estimatedMinutes} 分钟  │
│    包含模块: {moduleOrder.length} 个        │
│                                             │
│    · {phase0 icon} 基础代码阅读              │
│    · {moduleA icon} 方案权衡与代码审查       │
│    · {mb icon} AI 协作编程                  │
│    · {moduleD icon} 系统设计（如有）         │
│    · {selfAssess icon} 自我评估              │
│    · {modulec icon} 深度答辩（如有）         │
│                                             │
│  ──────────────────────────────             │
│                                             │
│  评估说明                                    │
│    · 本次评估围绕一个真实业务系统展开         │
│    · 所有模块都针对同一个系统的不同切面       │
│    · 支持 AI 协作，你可以使用任何熟悉的方式   │
│      与 AI 共同完成任务                      │
│    · 评估一旦开始无法暂停，请确保有充足时间   │
│    · 开始后每个模块提交后无法返回修改         │
│                                             │
│  ──────────────────────────────             │
│                                             │
│      [ 我已理解，开始评估 ]                 │
│                                             │
└─────────────────────────────────────────────┘
```

**Props**：无 props，从 useSessionStore 读 sessionId / suiteId，从 SUITES 读套件信息。

**交互**：
- 页面加载时 loadSession(sessionId)
- 点击"开始评估" → moduleStore.advance() → 进入第一个模块
- 如果 session 已经 in_progress，不展示 intro 直接跳到当前模块

**data-testid**：
- `evaluation-intro-container`
- `evaluation-intro-start-button`
- `evaluation-intro-suite-name`
- `evaluation-intro-estimated-minutes`
- `evaluation-intro-module-list`

#### ProgressIndicator.tsx

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

**视觉**：
- ✓（已完成）：实心圆 + 勾号
- ●（进行中）：实心圆 + 颜色高亮
- ○（未开始）：空心圆
- 连线表示顺序

**Props**：
```typescript
interface ProgressIndicatorProps {
  compact?: boolean;  // 紧凑模式（顶部 bar 用）
  showMinutes?: boolean;  // 是否显示剩余时间
}
```

**不从 props 读数据**，从 moduleStore 自动订阅。

**data-testid**：
- `progress-indicator-container`
- `progress-module-{moduleKey}`（每个模块点）
- `progress-completed-count`
- `progress-remaining-minutes`

**位置**：每个模块页面的顶部（TopBar 下方），或 TopBar 内。

#### App.tsx（路由）

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ExamRouter } from './ExamRouter';
import { AdminRoutes } from './routes/admin';
import { SharedReportPage } from './pages/SharedReportPage';

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

// ExamRouter.tsx
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

**注意 moduleC**：大写 C（和 V5Submissions.moduleC 对应）。Socket 事件保持 `v5:modulec:*` 小写约定。

#### module.store.ts

见问题 5 的完整 API。

### 8. DecisionSummary 组件 props 和数据提取

**直接回答。**

```typescript
interface DecisionSummaryProps {
  sessionId: string;
  variant?: 'minimal' | 'detailed';  // V5.0 用 minimal
}

// 实现
export function DecisionSummary({ sessionId, variant = 'minimal' }: DecisionSummaryProps) {
  const summary = useSessionStore(state => state.getDecisionSummary());
  
  if (!summary.ma && !summary.mb && !summary.md) {
    return null;  // 没有前序数据不展示
  }
  
  return (
    <Card className="decision-summary">
      <CardHeader>
        <CardTitle>你的前序决策回顾</CardTitle>
        <CardDescription>
          在下面自评前，先回顾一下你做过的关键决策
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.ma && (
          <div data-testid="decision-summary-ma">
            <strong>MA 方案选择：</strong>
            <span>方案 {summary.ma.schemeId}</span>
            <p className="reasoning">{truncate(summary.ma.reasoning, 100)}</p>
          </div>
        )}
        {summary.mb && (
          <div data-testid="decision-summary-mb">
            <strong>MB 编排思路：</strong>
            <p>{truncate(summary.mb.decomposition, 80)}</p>
          </div>
        )}
        {summary.md && (
          <div data-testid="decision-summary-md">
            <strong>MD 设计规模：</strong>
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

**数据提取逻辑**（在 session.store.ts 的 getDecisionSummary 方法）：

```typescript
getDecisionSummary: () => {
  const state = get();
  const s = state.submissions;
  
  return {
    ma: s.moduleA ? {
      schemeId: s.moduleA.round1.schemeId,
      reasoning: s.moduleA.round1.reasoning,
    } : undefined,
    
    mb: s.mb?.planning ? {
      decomposition: s.mb.planning.decomposition.split('\n')[0],  // 只取第一行
    } : undefined,
    
    md: s.moduleD ? {
      subModuleCount: s.moduleD.subModules.length,
      constraintCount: s.moduleD.constraintsSelected.length,
    } : undefined,
  };
}
```

**SelfAssessPage 的接入**：

```tsx
// SelfAssessPage.tsx
<div className="self-assess-page">
  <DecisionSummary sessionId={sessionId} variant="minimal" />
  
  <ConfidenceSlider 
    value={confidence} 
    onChange={setConfidence}
  />
  
  <ReasoningTextarea 
    value={reasoning}
    onChange={setReasoning}
  />
  
  <SubmitButton onClick={handleSubmit} />
</div>
```

Frontend 在批 2 做 SelfAssessPage TODO 处理时把 DecisionSummary 先占位（空实现）即可，批 3+ 补完整实现。

---

## P0 第 9-11 题：集成点

### 9. 5 套件 weightProfile 权重

**直接回答。已在 shared/src/types/v5-suite.ts 定义（Backend Task 1 已 merge）。**

Backend 的实现（确认）：

```typescript
full_stack: {
  technicalJudgment: 0.25,
  aiEngineering: 0.25,
  codeQuality: 0.20,
  communication: 0.15,
  metacognition: 0.10,
  systemDesign: 0.05,   // 不参与时通过 N/A rescaling 忽略
}

architect: {
  technicalJudgment: 0.25,
  systemDesign: 0.30,
  communication: 0.20,
  codeQuality: 0.10,
  metacognition: 0.10,
  aiEngineering: 0.05,
}

ai_engineer: {
  aiEngineering: 0.40,    // 翻倍
  technicalJudgment: 0.20,
  codeQuality: 0.15,
  communication: 0.15,
  metacognition: 0.05,
  systemDesign: 0.05,
}

quick_screen: {
  technicalJudgment: 0.35,
  aiEngineering: 0.30,
  codeQuality: 0.20,
  metacognition: 0.15,
  communication: 0,       // 不评
  systemDesign: 0,
}

deep_dive: {
  technicalJudgment: 0.20,
  aiEngineering: 0.20,
  systemDesign: 0.20,
  codeQuality: 0.15,
  communication: 0.15,
  metacognition: 0.10,
}
```

**full_stack vs ai_engineer 的差异**：不只是 aiEngineering 一个维度，是 4 个维度权重调整：
- aiEngineering: 0.25 → 0.40
- technicalJudgment: 0.25 → 0.20
- codeQuality: 0.20 → 0.15
- metacognition: 0.10 → 0.05

每个 suite 的 weightProfile.sum 都是 1.0，但 quick_screen 的 communication 和 systemDesign 是 0（不参与）。

### 10. gradeCandidate cap + floor 规则

**直接回答。**

**硬 cap**：超过 cap 的 grade 直接降到 cap，不是"降一级"。

```typescript
const gradeOrder = ['D', 'C', 'B', 'B+', 'A', 'S', 'S+'];
const currentIdx = gradeOrder.indexOf(computedGrade);
const capIdx = gradeOrder.indexOf(suite.gradeCap);

if (currentIdx > capIdx) {
  finalGrade = suite.gradeCap;  // 直接降到 cap
}
```

例如 quick_screen capA：composite 90+ 且 floors 达到 S+ 条件，计算出来是 S+，但因为 cap=A，最终直接 → A。

不是降一级（S+→S），是降到 cap（S+→A）。

**dimensionFloors 具体数值**（Backend 已在 shared 定义）：

```typescript
full_stack: {
  'S': { technicalJudgment: 80, aiEngineering: 80, codeQuality: 75 },
  'A': { technicalJudgment: 70, aiEngineering: 70, codeQuality: 65 },
}

architect: {
  'S+': { technicalJudgment: 85, systemDesign: 85, communication: 80 },
  'S': { technicalJudgment: 78, systemDesign: 78, communication: 72 },
}

ai_engineer: {
  'S': { aiEngineering: 85, technicalJudgment: 75, codeQuality: 70 },
  'A': { aiEngineering: 75, technicalJudgment: 65, codeQuality: 60 },
}

quick_screen: {
  'A': { technicalJudgment: 70, aiEngineering: 65, codeQuality: 60 },
  'B+': { technicalJudgment: 60, aiEngineering: 55, codeQuality: 50 },
}

deep_dive: {
  'S+': { technicalJudgment: 85, aiEngineering: 80, systemDesign: 85, communication: 80 },
  'S': { technicalJudgment: 78, aiEngineering: 75, systemDesign: 75, communication: 72 },
}
```

**floor 检查逻辑**：
- 如果候选人 composite 达到 S 分（85+）但某维度 floor 不达标（比如 technicalJudgment=75 < 80）→ 不给 S，降一级到 A
- 降一级后再检查 A 的 floor，如果也不达标继续降到 B+
- 未参与维度（N/A）的 floor 跳过不检查

**B- dangerFlag**（不改 grade，只标记）：

```typescript
const dangerFlag = 
  composite >= 55 &&  // B 及以上
  participating.has('technicalJudgment') &&
  participating.has('codeQuality') &&
  dims.technicalJudgment < 50 &&
  dims.codeQuality >= 60 &&
  (dims.codeQuality - dims.technicalJudgment) > 15;
```

含义：代码质量高但技术判断弱 → 可能是"AI 代码依赖症"候选人。报告里加警告不改 grade。

### 11. 43 信号 dimension 映射表

**直接回答。**

合计 43 个信号（3 个 LLM 白名单全在 MD）。Task 4 SignalRegistry 按下表注册。

**按维度汇总**：

| 维度 | 信号 | 数量 |
|---|---|---|
| technicalJudgment | sBaselineReading, sSchemeJudgment, sReasoningDepth, sContextQuality, sCriticalThinking, sArgumentResilience, sDiagnosisAccuracy | 7 |
| aiEngineering | sTaskDecomposition, sInterfaceDesign, sFailureAnticipation, sPromptQuality, sIterationEfficiency, sPrecisionFix, sAiCompletionAcceptRate, sChatVsDirectRatio, sFileNavigationEfficiency, sTestFirstBehavior, sEditPatternQuality, sAgentGuidance, sAiOrchestrationQuality | 13 |
| codeQuality | sCodeReviewQuality, sHiddenBugFound, sReviewPrioritization, sModifyQuality, sBlockSelectivity, sChallengeComplete, sVerifyDiscipline, sAiOutputReview, sRulesQuality, sRulesCoverage, sRulesSpecificity, sRuleEnforcement | 12 |
| communication | sWritingQuality, sBoundaryAwareness, sCommunicationClarity | 3 |
| metacognition | sAiCalibration, sDecisionStyle, sTechProfile, sMetaCognition, sReflectionDepth | 5 |
| systemDesign | sDesignDecomposition, sConstraintIdentification, sTradeoffArticulation | 3 |

LLM 白名单（仅 MD，3 个）：sDesignDecomposition, sTradeoffArticulation, sAiOrchestrationQuality。

**按模块展开**：

| 模块 | 信号 | 维度 | LLM 白名单 | 权重类型 |
|---|---|---|---|---|
| P0 | sBaselineReading | technicalJudgment | 否 | 标准 |
| P0 | sAiCalibration | metacognition | 否 | 标准 |
| P0 | sDecisionStyle | metacognition | 否 | 标准 |
| P0 | sTechProfile | metacognition | 否 | **轻度（0.1）** |
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

**合计 43 个**，3 个 LLM 白名单（全在 MD）。

**权重计算规则**：
- SignalDefinition 可选 `weight` 字段，默认 1.0；唯一例外 **sTechProfile = 0.1**（轻度）。
- 维度分 = `sum(value * weight) / sum(weight)`，value 为 null 的信号从分子分母同时剔除（N/A rescaling）。

例如 metacognition 维度（sum(weight) = 1+1+1+1+0.1 = 4.1）：
```
meta = (
  sAiCalibration * 1.0 +
  sDecisionStyle * 1.0 +
  sMetaCognition * 1.0 +
  sReflectionDepth * 1.0 +
  sTechProfile * 0.1
) / 4.1
```

注意：有些信号可能因为模块未参与是 null，这时候 dim 的聚合只用参与的信号（再归一化）。

---

## 立即给 Backend 的修正

**基于问题 2 的讨论**，Backend 在 Task 2 Prisma schema 里需要**保留 analytics 字段**：

```
发给 Backend 窗口：

Task 2 Schema 改动增补：ExamInstance 保留 analytics 字段（我之前指令漏了）。

基于三视角 review（效度验证 + 客户信任 + 零成本），以下字段必须保留：
- usedCount: Int @default(0)
- avgCompletionMins: Float?
- avgCompositeScore: Float?
- discriminationScore: Float?
- lastUsedAt: DateTime?
- qualityReport: Json?  (Step 8 产出)

V5.0 不主动维护这些字段的更新逻辑，V5.1 启用统计和区分度分析。
但 schema 里必须有这些字段，否则 V5.1 加回来要改 migration 成本高。

其他 V4 的 deprecated 字段（schemes / defectsInBest / harnessReference 
/ scaffold / phase0Questions / failureScenario / samples / v4Requirement）
继续按原计划删除。

这些应该存在 ExamModule.moduleSpecific 里（按模块类型分）。
```

---

## 要我继续吗

P0 1-11 题答完。下一步：

**选 A**：你拿着这份答案发给 Backend 和 Frontend，让他们基于这些规格继续 Task 2 / Frontend 的批 2b-3

**选 B**：我现在继续答 P1 (12-21)，一次性给你完整参考

**选 C**：先停下来 review P0 答案，看有没有和你设计直觉不符的地方（特别是问题 2 analytics 字段保留的决策，如果你觉得不对我们再讨论）

我倾向 **A**：Backend 在 Task 2 的关键决策依赖问题 1-4 的答案，现在不发过去 Backend 会被阻塞。P1 问题主要影响 2 周后的 Task，不急。

但你决定节奏。

继续答 P1 (12-21 题)。

---

## P1 第 12-14 题：生成器相关

### 12. Step 0-8 Generator 每步输入输出 schema

**直接回答。9 个 step 的完整规格。**

#### Step 0：BusinessScenario 总纲

```typescript
// 输入
interface Step0Input {
  spec: ExamSpec;  // techStack + domain + challengePattern + archStyle? + level
}

// 输出
interface Step0Output {
  scenario: BusinessScenario;  // 从 shared 的 v5-business-scenario.ts
}

// Prompt 框架
`你是一个资深技术架构师。基于以下规格生成一个真实的业务系统场景。

技术栈: {techStack}
业务领域: {domain}
挑战模式: {challengePattern}
架构风格: {archStyle || '根据业务合理选择'}
难度级别: {level}

要求：
1. systemName: 系统中文名 + 英文名
2. businessContext: 500-800 字描述系统上下文、用户、核心业务流程
3. coreEntities: 3-5 个核心实体，每个含属性和关系
4. techStackDetail: 具体版本号（Spring Boot 3.2 / FastAPI 0.110 等）
5. businessFlow: 5-8 步核心流程
6. userRoles: 2-3 个用户角色

约束：
- 业务场景必须真实，中国企业常见
- techStack 和 domain 组合要合理（如 golang + payment 不建议用于金融核心）
- level={level} 决定复杂度：
  * junior: 单一业务流程，2-3 个实体
  * mid: 多流程互通，4-5 个实体，涉及缓存/队列
  * senior: 分布式场景，多服务协作，涉及一致性/性能

输出 JSON，严格符合 BusinessScenario interface。`
```

#### Step 1：P0 派生

```typescript
// 输入
interface Step1Input {
  scenario: BusinessScenario;
  level: Level;
}

// 输出
interface Step1Output {
  systemCode: string;           // 主体代码
  codeReadingQuestions: {
    l1: { question: string; options: string[]; correctIndex: number };
    l2: { question: string };
    l3: { question: string };
  };
  aiOutputJudgment: Array<{     // 2 题
    codeA: string; codeB: string; context: string; 
    groundTruth: 'A' | 'B' | 'both_good' | 'both_bad';
  }>;
  decision: {
    scenario: string;
    options: Array<{ id: string; label: string; description: string }>;
  };
}

// Prompt 要点
`基于 BusinessScenario 的 coreEntities[0] 和 businessFlow 前 3 步，
生成一段 {systemCode 行数} 行代码实现某个核心功能。

systemCode 行数：
- junior: 150-200
- mid: 300-500
- senior: 500-800

codeReading 三层递进：
- L1: "这段代码做什么？" 4 选 1，测基础理解
- L2: "这段代码在 {challengePattern} 场景下有什么问题？" textarea，测批判性阅读
- L3: "如果要支持 10x 流量增长，这段代码哪些地方要改？" textarea，测扩展性思考

aiOutputJudgment 2 题：
- 题 1：两段代码对同一问题（比如实现 {coreEntity} 的 CRUD），
  A 是"正确但朴素"的实现，B 是"看起来优雅但有 bug"的实现。
  groundTruth='A'，测试候选人能识别隐藏 bug。
- 题 2：两段代码对应两种架构选择（比如"直连 DB"vs"加 cache"），
  A 和 B 都合理但适用场景不同。groundTruth='both_good'，测试"区分场景的能力"。

decision: 一个架构决策场景（3 选 1），答案有最优解但需要推理。`
```

#### Step 2：MA schemes

```typescript
// 输入
interface Step2Input {
  scenario: BusinessScenario;
  systemCode: string;  // 从 Step 1
  level: Level;
}

// 输出
interface Step2Output {
  requirement: string;
  schemes: Array<{ id: 'A' | 'B' | 'C'; name: string; description: string; 
                    pros: string[]; cons: string[]; performance: string; cost: string; }>;
  counterArguments: Record<string, string[]>;  // 每方案 2 个反驳点
}

// 关键约束
// - cons 不能字面包含 defects 的关键词（Phase -1 已知 bug 修复）
// - 3 方案要有明确权衡场景：哪个方案在哪类场景下最优
// - counterArguments：针对候选人选某方案后，给 2 个强度递进的反驳点
//   第一个温和："是否考虑过 X"
//   第二个尖锐："你的方案在 Y 场景下会失败"
```

#### Step 3：MA defects

```typescript
// 输入
interface Step3Input {
  scenario: BusinessScenario;
  systemCode: string;
  schemes: Step2Output['schemes'];
  level: Level;
}

// 输出
interface Step3Output {
  codeForReview: string;  // 包含 defects 的代码
  defects: Array<{
    defectId: string;
    line: number;
    content: string;
    severity: 'critical' | 'major' | 'minor';
    category: string;          // 如 'sql_injection' / 'n_plus_1' / 'race_condition'
    relatedScheme?: 'A' | 'B' | 'C';  // 和哪个方案相关
  }>;
  decoys: Array<{ line: number; content: string }>;  // 假缺陷（看起来像缺陷但其实不是）
}

// 约束
// - defects 数量：junior 3-4 / mid 5-7 / senior 7-10
// - severity 分布：critical 1-2 / major 2-3 / minor 2-3
// - decoys 数量：defects 数量的 30-50%（test false positive 识别能力）
// - 至少 1 个 defect 跨 2+ schemes 相关（测权衡能力）
```

#### Step 4：MB scaffold

```typescript
// 输入
interface Step4Input {
  scenario: BusinessScenario;
  systemCode: string;
  level: Level;
}

// 输出
interface Step4Output {
  featureRequirement: {
    description: string;
    acceptanceCriteria: string[];  // 5 条
  };
  scaffold: {
    files: Array<{ path: string; content: string; knownIssueLines?: number[] }>;
    tests: Array<{ path: string; content: string; purpose: string }>;
    dependencyOrder: string[];  // 文件路径数组
  };
  harnessReference: {
    keyConstraints: string[];
    constraintCategories: string[];
  };
}

// 约束
// - files 数量：junior 3 / mid 4 / senior 5-6
// - tests 数量：12-15 个（覆盖所有 acceptanceCriteria）
// - dependencyOrder 必须体现"从底层到上层"（如 repo → service → controller）
// - keyConstraints 5-8 条（如"不使用全局状态"/"必须写单元测试"）
// - constraintCategories 3-5 类（Stage 4 审计题库从这里挑 3 个生成违规示例）
```

#### Step 5：MA failureScenario

```typescript
// 输入
interface Step5Input {
  scenario: BusinessScenario;
  systemCode: string;
  schemes: Step2Output['schemes'];
  defects: Step3Output['defects'];
  level: Level;
}

// 输出
interface Step5Output {
  successCode: string;
  failedCode: string;
  diffPoints: Array<{ line: number; description: string }>;
  rootCause: string;
}

// 约束（Phase -1 已知 bug 修复）
// - rootCause 必须和 challengePattern 匹配
//   precision → rootCause 涉及精度/边界条件
//   concurrency → rootCause 涉及并发/竞态
//   consistency → rootCause 涉及一致性/事务
// - successCode 和 failedCode 差异不要超过 5 处，但每处差异都是关键
// - diffPoints 要给"关键 3-5 处"，不是全部 diff
```

#### Step 6：MB violations

```typescript
// 输入
interface Step6Input {
  harnessReference: Step4Output['harnessReference'];
  scaffold: Step4Output['scaffold'];
}

// 输出
interface Step6Output {
  violationExamples: Array<{    // 3 个
    exampleIndex: number;        // 0-2
    code: string;                // AI 生成的代码片段
    isViolation: boolean;        
    violationType?: string;      // 对应 constraintCategories
    explanation: string;         // 为什么违反 / 为什么没违反
  }>;
}

// 约束
// - 3 个例子分布：2 真违规（不同 category）+ 1 语义边界诱饵
// - "语义边界"例子：代码初看像违规但实际没违反（如"看起来用了全局状态但其实是配置读取"）
// - 每个例子的 code 5-20 行，不超过
```

#### Step 7：MD designTask

```typescript
// 输入
interface Step7Input {
  scenario: BusinessScenario;
  level: Level;
}

// 输出
interface Step7Output {
  designTask: {
    description: string;
    businessContext: string;
    nonFunctionalRequirements: string[];
  };
  expectedSubModules: Array<{ name: string; responsibility: string }>;
  constraintCategories: string[];           // 5-7 类
  designChallenges: Array<{                  // 2-3 个条件触发
    trigger: string;                         // 候选人满足什么条件后触发
    challenge: string;
  }>;
}

// 约束
// - designTask 必须基于 BusinessScenario 但增加复杂度（不是重复 Step 1 的 systemCode）
// - expectedSubModules: junior 3-4 / mid 5 / senior 6-8
// - constraintCategories: 覆盖性能、一致性、可用性、可扩展性、安全、成本中至少 5 类
// - designChallenges trigger 示例："如果候选人没提到缓存层"→ challenge "如何降低 DB 压力"
```

#### Step 8：跨模块一致性检查

```typescript
// 输入
interface Step8Input {
  allModuleOutputs: {
    scenario: BusinessScenario;
    p0: Step1Output;
    ma_schemes: Step2Output;
    ma_defects: Step3Output;
    mb: Step4Output;
    ma_failure: Step5Output;
    mb_violations: Step6Output;
    md?: Step7Output;
  };
}

// 输出
interface Step8Output {
  qualityReport: {
    checks: Array<{
      name: string;
      passed: boolean;
      details?: string;
    }>;
    overallPassed: boolean;
  };
}

// 检查项（8 条）
// 1. systemCode 和 scaffold 同一系统（entity 名称重合 > 50%）
// 2. schemes cons 不字面复述 defects（关键词 overlap < 20%）
// 3. rootCause 匹配 challengePattern（用 LLM 判断语义）
// 4. businessFlow 和 featureRequirement 合理衔接
// 5. constraintCategories 和 keyConstraints 不冲突
// 6. expectedSubModules 和 scenario.coreEntities 对齐
// 7. violationExamples 的 violationType 都在 constraintCategories 中
// 8. llm_quality_judge: 检查 codeOutline 是否和 description 一致
//    （Phase -1 bug：V4 是检查 description 末尾，改为检查 codeOutline）

// 如果任一 check failed，返回 qualityReport，由 generator 决定重跑哪步
```

### 13. Step 0 prompt 是否已调优

**直接回答。**

**未调优**。前窗设计阶段只定义了 prompt 框架（见问题 12 的 Step 0 prompt），没有真实跑过 LLM 迭代。

**Backend Task 9 的职责**：
- 基于问题 12 的 prompt 框架起始版本
- 至少 10 轮迭代调优
- 合格标准：
  1. 生成的 BusinessScenario 能通过 Step 1 的输入检查（Step 1 不报错）
  2. 3 个不同维度组合（不同 techStack/domain/level）都能生成合法输出
  3. 人工审核（你或你找的工程师）认为"是真实业务场景"
  4. businessContext 长度稳定在 500-800 字（不频繁超出）
  5. coreEntities 的 attributes 和 relationships 有实质内容（不是 placeholder）

**调优方式**：
- 每轮跑 3-5 个不同 spec 生成
- 记录失败案例到 prompt-testing/step0-failures.md
- prompt 存入 PromptRegistry，每轮新版本 v2/v3/...
- 最终 v10+ 版本作为 V5.0 生产版本（key=generator.step0_scenario, version=current）

这是异步长时间工作，不在单次对话内完成。Backend 的 Task 9 正式启动时我会给调优 runbook。

### 14. V5.0 首批 BusinessScenario 组合

**直接回答。之前已定 18 个（6 scenario × 3 level）。**

6 个核心 scenario：

| # | techStack | domain | challengePattern | archStyle | 备注 |
|---|---|---|---|---|---|
| 1 | java_spring | payment | precision | monolithic_layered | Java 后端典型 |
| 2 | python_fastapi | ecommerce | concurrency | microservice | 电商秒杀场景 |
| 3 | nodejs_nest | logistics | consistency | event_driven | 物流配送 |
| 4 | python_fastapi | social | performance | microservice | 社交 feed 高并发 |
| 5 | java_spring | payment | consistency | microservice | 支付分布式事务 |
| 6 | go_gin | ecommerce | concurrency | monolithic_layered | Go 高并发经典 |

每个 scenario × 3 level (junior/mid/senior) = 18 个 ExamInstance。

**覆盖考量**：
- 4 个语言都覆盖
- payment 2 个（金融是核心 B 端场景）
- ecommerce 2 个（通用电商）
- logistics / social 各 1 个
- challengePattern 4 种（precision/concurrency/consistency/performance）
- archStyle 3 种（monolithic/microservice/event_driven）

**V5.0 不覆盖的 domain**：content / saas / 所有前端场景。V5.1 扩展。

**V5.0 不覆盖的 challengePattern**：observability / security。V5.1 扩展。

---

## P1 第 15-18 题：Cursor 模式

### 15. Stage 1-4 状态机完整规则

**三视角讨论。不确定。**

**Karpathy**：
"状态机规则必须明确，否则 bug 会在用户体验里显现。Stage 1 可跳过这件事本身是信号——但是'跳过'和'填了但填得烂'是两种不同的信号值，要区分开。skipped flag 存 session.submissions.mb.planning.skipped，计算 sTaskDecomposition 时先看 skipped 再看内容。"

**Gemini**：
"候选人看到'可跳过'按钮会多一个决策负担。UX 上要明确'跳过'的 implication：'跳过此环节将以默认方式评估，建议有经验的候选人填写'。不要让候选人以为跳过=不扣分。"

**Claude Code 工程**：
"Stage 2 内部子状态机要明确哪些事件 emit。Chat 模式和直接编辑模式能否并行？如果候选人一边开着 Chat 等回复一边在编辑器打字，事件怎么记录？这是实现细节但影响信号计算。"

**结论：给完整状态机规则。**

#### Stage 0（前置，不算正式 stage）
```
状态：loading → ready
动作：候选人打开 MB 页面，加载 scaffold、tests、featureRequirement
进入 Stage 1 的条件：自动进入
```

#### Stage 1: planning
```
状态：in_planning → submitted | skipped

UI 元素：
- 3 个 textarea（decomposition/dependencies/fallback）
- "提交" 按钮（至少一个 textarea 有内容才能点）
- "跳过此环节" 按钮（始终可点）

行为：
- 提交 → submissions.mb.planning = { decomposition, dependencies, fallback, submittedAt, skipped: false }
- 跳过 → submissions.mb.planning = { decomposition: '', dependencies: '', fallback: '', submittedAt: now, skipped: true }
- 提交后或跳过后 → 锁定 Stage 1 UI → 进入 Stage 2

信号影响：
- sTaskDecomposition: skipped=true → 返回 0.0 / skipped=false → 按内容计算
- sInterfaceDesign: skipped=true → 0.0 / 否则按 scaffold 函数名命中计算
- sFailureAnticipation: skipped=true → 0.0 / 否则按降级关键词 + 步骤引用计算
```

#### Stage 2: execution
```
状态：in_execution → submitted

UI 元素：
- MultiFileEditor（Monaco 多文件）
- AIChatPanel（Chat 侧栏 + @引用选择器）
- InlineCompletionProvider（Monaco 灰色提示）
- 终端面板（pytest 输出）
- "提交" 按钮（始终可点，但有确认弹窗）

内部子状态机（并行）：
  Chat 流：idle → generating → diff_pending → diff_applied | diff_rejected → idle
  Inline 流：idle → typing → fetching → showing → accepted | rejected → idle
  Test 流：idle → running → completed → idle

行为：
- 候选人可随时切换 Chat / 直接编辑 / 运行测试
- 所有文件变更实时 emit v5:mb:file_change 到 backend
- 所有 AI 事件实时 emit 到 backend（completion_shown/accepted/rejected, chat_prompt/response, diff_accepted/rejected）
- 提交按钮 → 确认弹窗："确认提交？提交后无法再修改代码。" → 锁定 → 进入 Stage 3

强制规则：
- testPassRate 不是强制门槛（即使 0% 也能提交，但会影响 sChallengeComplete 信号）
- 候选人可以跳过任何 acceptanceCriteria，不是全部必须完成
- 最少编辑时长无约束（V5.0 不强制 30s 等 minimum time）

信号触发点：
- 进入 Stage 2 时记录 startTime
- 每次 file switch 记录 fileNavigationHistory
- 退出 Stage 2 时记录 totalEditMs
```

#### Stage 3: standards
```
状态：in_standards → submitted

UI 元素：
- RulesEditor（markdown 编辑器写 RULES.md）
- AGENT.md 切换（可选）
- "提交" 按钮

行为：
- 候选人写编程规范（不少于 50 字才能提交）
- AGENT.md 可选（有 AGENT.md 的候选人 sAgentGuidance 信号有数据，否则为 null）
- 提交 → 锁定 → 进入 Stage 4

信号触发点：
- sRulesQuality/Coverage/Specificity：基于 rulesContent 计算
- sAgentGuidance：如果 agentContent 为空，值为 null
```

#### Stage 4: audit
```
状态：in_audit → submitted → complete

UI 元素：
- 3 张 AI 执行结果卡片（从 ExamModule.violationExamples 读）
- 每张卡片的标注切换（合规 / 违规）
- 违规时的 rule 选择器（从候选人 RULES.md 提取的规则列表）
- "完成评估" 按钮

行为：
- 3 张卡片依次展示（或同时展示，V5.0 选同时）
- 候选人标注每张卡片 + 违规时选择违反了哪条 rule
- 所有 3 张标注完才能点"完成评估"
- 点击后 → 进入 Stage complete

信号触发点：
- sRuleEnforcement：对比候选人标注和 groundTruth
  - 标注对 + 违规时 rule 选对 = 1.0
  - 只标注对但 rule 选错 = 0.5
  - 标注错 = 0.0
  - 3 张平均
```

**所有 Stage 完成后 MB 模块的 submission 状态**：

```typescript
submissions.mb = {
  planning: { decomposition, dependencies, fallback, submittedAt, skipped },
  editorBehavior: { 
    aiCompletionEvents, chatEvents, diffEvents,
    fileNavigationHistory, editSessions, testRuns 
  },
  finalFiles: [...],
  finalTestPassRate: 0.0-1.0,
  standards: { rulesContent, agentContent? },
  audit: { violations: [...] },
};
```

### 16. Cursor 5 信号具体计算公式

**直接回答。完整公式。**

#### sAiCompletionAcceptRate（反 U 曲线）

```typescript
function sAiCompletionAcceptRate(events: AiCompletionEvent[]): number | null {
  const shown = events.filter(e => e.type === 'shown').length;
  const accepted = events.filter(e => e.type === 'accepted').length;
  
  if (shown < 5) return null;  // 样本太少不算
  
  const rate = accepted / shown;
  
  // 反 U 曲线：peak at 0.6
  // Score = 1 - 4 * (rate - 0.6)^2，clamp 到 [0, 1]
  // rate=0.6 → score=1.0
  // rate=0.5 或 0.7 → score=0.96
  // rate=0.3 或 0.9 → score=0.64
  // rate=0.1 或 1.0 → score=0.36  
  // rate=0 或过度接受 → 低分
  
  const score = 1 - 4 * Math.pow(rate - 0.6, 2);
  return Math.max(0, Math.min(1, score));
}
```

**含义**：
- 50-70% 接受率：反映"batería AI 但不盲从"
- >90% 接受率：盲接受，可能没看仔细
- <20% 接受率：过度拒绝，AI 价值没利用

#### sChatVsDirectRatio

**按事件数而非时长计算**（Karpathy 担心时长计算会因候选人思考时间不均衡）。

```typescript
function sChatVsDirectRatio(events: EditorEvent[]): number | null {
  // Chat actions：每次发 prompt
  const chatActions = events.filter(e => e.type === 'chat_prompt_sent').length;
  
  // Direct actions：
  // - 每个 keystroke 序列（连续 10+ 字符的输入）算一个 direct action
  // - 或每次接受 inline completion 算一个 direct action
  const directActions = 
    countKeystrokeSequences(events, 10) + 
    events.filter(e => e.type === 'completion_accepted').length;
  
  const total = chatActions + directActions;
  if (total < 5) return null;
  
  const chatRatio = chatActions / total;
  
  // 反 U 曲线：peak at 0.4
  // 0.3-0.5 最优（混合使用）
  const score = 1 - 4 * Math.pow(chatRatio - 0.4, 2);
  return Math.max(0, Math.min(1, score));
}

function countKeystrokeSequences(events, minLength): number {
  // 连续 keystroke events（间隔 < 500ms）聚合为一个序列
  // 序列长度 >= minLength 才算一个 direct action
  // 实现略（常规 streaming 聚合算法）
}
```

#### sFileNavigationEfficiency

**基于 dependencyOrder 匹配度**。

```typescript
function sFileNavigationEfficiency(
  history: FileNavigationEvent[],
  dependencyOrder: string[]  // 从 scaffold.dependencyOrder
): number | null {
  // 取候选人打开的文件顺序（去重，保留首次打开顺序）
  const seenFiles = new Set<string>();
  const openOrder: string[] = [];
  for (const event of history) {
    if (event.action === 'open' && !seenFiles.has(event.filePath)) {
      seenFiles.add(event.filePath);
      openOrder.push(event.filePath);
    }
  }
  
  if (openOrder.length < 2) return null;
  
  // 和 dependencyOrder 计算 Kendall tau（秩相关）
  // 简化：计算"候选人顺序 vs 依赖顺序"的逆序对数
  const tau = calculateKendallTau(openOrder, dependencyOrder);
  
  // tau ∈ [-1, 1]，映射到 [0, 1]
  return (tau + 1) / 2;
}
```

**含义**：
- tau=1：完全按依赖顺序看（repo → service → controller）
- tau=0：随机顺序
- tau=-1：完全反向（controller → service → repo），也可能是"从测试出发逆推"

#### sTestFirstBehavior

**判断标准：前 60 秒内是否打开了 tests/ 目录下的任何文件**。

```typescript
function sTestFirstBehavior(
  history: FileNavigationEvent[],
  startTime: number
): number | null {
  if (history.length === 0) return null;
  
  const first60sEvents = history.filter(
    e => e.timestamp - startTime < 60_000
  );
  
  const firstTestOpen = first60sEvents.find(e => 
    e.action === 'open' && e.filePath.startsWith('tests/')
  );
  
  if (firstTestOpen) {
    // 60s 内看了 tests，满分
    return 1.0;
  }
  
  // 60s 没看 tests，看是否在前 5 分钟内看了
  const first5minEvents = history.filter(
    e => e.timestamp - startTime < 300_000
  );
  const laterTestOpen = first5minEvents.find(e => 
    e.action === 'open' && e.filePath.startsWith('tests/')
  );
  
  return laterTestOpen ? 0.5 : 0.0;
}
```

**含义**：
- 1.0：前 60 秒内看 tests（test-first mindset）
- 0.5：5 分钟内看了（迟但还行）
- 0.0：5 分钟都没看（很可能直接开写）

#### sEditPatternQuality

**计算候选人编辑顺序和 dependencyOrder 的一致性**。

```typescript
function sEditPatternQuality(
  editSessions: EditSession[],
  dependencyOrder: string[]
): number | null {
  // 按首次编辑时间对文件排序
  const firstEditByFile = new Map<string, number>();
  for (const session of editSessions) {
    const existing = firstEditByFile.get(session.filePath);
    if (!existing || session.startTime < existing) {
      firstEditByFile.set(session.filePath, session.startTime);
    }
  }
  
  // 候选人编辑顺序
  const editOrder = Array.from(firstEditByFile.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([path]) => path)
    .filter(path => dependencyOrder.includes(path));  // 只看 scaffold 文件
  
  if (editOrder.length < 2) return null;
  
  const tau = calculateKendallTau(editOrder, dependencyOrder);
  return (tau + 1) / 2;
}
```

**和 sFileNavigationEfficiency 的区别**：
- Navigation：打开文件的顺序
- Edit：实际编辑（修改）的顺序

两者可能不一致：候选人先全看完再编辑 vs 边看边改。sEditPatternQuality 更反映"真实工作流程"。

### 17. Monaco inline completion debounce 500ms 来源

**直接回答。**

**500ms 是软约束，tunable**。

来源：
- Cursor / GitHub Copilot 实际产品使用 300-500ms 区间
- 300ms 太激进（候选人还在思考时就弹出）
- 1000ms 太慢（候选人已经想好开始打字）
- 500ms 是中间值，给候选人 0.5s 的"意图确认时间"

**Backend 实现建议**：
- 存在 config/runtime.ts 或类似位置
- 默认值 500ms
- 可通过环境变量 COMPLETION_DEBOUNCE_MS 覆盖
- 不暴露给候选人调整（保持评估一致性）

**V5.1 可调整**：
- 基于真实数据看哪个值候选人体验最好
- 不同语言可能不同（Python 函数签名长，完成慢；Go 短，完成快）

### 18. E2B / Docker / Static 降级触发条件

**直接回答。Hard check + 启动时检测。**

```typescript
class SandboxFactory {
  private cachedProvider: SandboxProvider | null = null;
  private lastCheckTime = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;  // 5 分钟
  
  async getProvider(): Promise<SandboxProvider> {
    // Cache 避免每次都探测
    if (this.cachedProvider && Date.now() - this.lastCheckTime < this.CACHE_TTL_MS) {
      return this.cachedProvider;
    }
    
    // Step 1: 尝试 E2B
    if (await this.e2bAvailable()) {
      this.cachedProvider = new E2BSandboxProvider();
      this.lastCheckTime = Date.now();
      logger.info('Sandbox: using E2B');
      return this.cachedProvider;
    }
    
    // Step 2: 降级 Docker
    if (await this.dockerAvailable()) {
      this.cachedProvider = new DockerSandboxProvider();
      this.lastCheckTime = Date.now();
      logger.warn('Sandbox: E2B unavailable, using Docker');
      return this.cachedProvider;
    }
    
    // Step 3: 最终降级 Static
    this.cachedProvider = new StaticCheckProvider();
    this.lastCheckTime = Date.now();
    logger.error('Sandbox: E2B and Docker both unavailable, using Static (no execution)');
    return this.cachedProvider;
  }
  
  private async e2bAvailable(): Promise<boolean> {
    try {
      // E2B SDK 提供 health check
      const response = await fetch('https://api.e2b.dev/health', {
        signal: AbortSignal.timeout(3000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  private async dockerAvailable(): Promise<boolean> {
    try {
      const { exitCode } = await execAsync('docker info', { timeout: 3000 });
      return exitCode === 0;
    } catch {
      return false;
    }
  }
  
  invalidateCache() {
    this.cachedProvider = null;
  }
}
```

**触发条件总结**：

| 条件 | 降级触发 |
|---|---|
| E2B API 3s 超时 | E2B → Docker |
| E2B API 返回 4xx/5xx | E2B → Docker |
| E2B quota 耗尽（返回 429） | E2B → Docker |
| Docker daemon 不响应 | Docker → Static |
| Docker 返回 permission denied | Docker → Static |

**监控**：每次降级发 Sentry 告警（E2B 挂是 P1，Docker 也挂是 P0）。

**不做的**：
- 不做"软检查"（quota 接近上限时预降级）——V5.0 复杂度不值得
- 不做"重试"（failed → retry → 仍失败再降级）——简单直接降级更稳
- 不做"双活"（同时跑 E2B 和 Docker）——资源浪费

---

## P1 第 19-21 题：MC 细节

### 19. MC probe 5 轮 prompt 模板

**直接回答。V4 已有，V5 改造点说明。**

V4 的 mc-probe-engine.ts 里已有 5 轮 strategy 的 prompt（398 行）。V5 改造只改：
1. DIMENSION_SIGNALS 映射 V4→V5（见 Module C 后端改造）
2. SessionContext 扩展读 V5Submissions（含 MD）
3. prompt 迁到 PromptRegistry

**5 轮 strategy prompt 模板骨架**：

#### Round 1: baseline
```
你是 Emma，一位资深技术面试官。

候选人前序表现摘要：
{sessionContextSummary}

请针对候选人在 {mostInterestingModule} 的回答，提出一个开放式问题让候选人
展开阐述。问题应该：
- 聚焦在候选人做出的一个关键决策或判断
- 不含引导倾向（不暗示对错）
- 10-30 字中文问句

候选人上一轮回答（如有）：{previousAnswer}

输出纯文本问题（不要引号）。
```

#### Round 2: contradiction
```
你是 Emma。基于候选人 baseline round 的回答，提出一个"看似矛盾"的追问。

候选人之前的回答片段：
- MA 选择：{ma.round1.schemeId}，理由：{ma.round1.reasoning}
- MC baseline 回答：{baselineAnswer}

找出回答里一个潜在的自相矛盾或和前序模块决策冲突的地方，追问：
"你刚才说 X，但你在 MA 选择方案 {schemeId} 的理由是 Y，这两个怎么统一？"

问题应该：
- 基于事实（引用候选人原话或决策）
- 不攻击性（用"我想理解..."等缓和措辞）
- 给候选人澄清机会

输出纯文本问题。
```

#### Round 3: weakness
```
你是 Emma。针对候选人的整体表现，识别最薄弱的环节进行追问。

候选人信号数据摘要：
- sCodeReviewQuality: {value}
- sPromptQuality: {value}
- sTradeoffArticulation: {value}
...

最低分信号：{weakestSignal}，对应模块：{weakestModule}

针对这个薄弱点，提一个"揭露深度不足"的追问。例如：
- 如果 sPromptQuality 低 → "你当时给 AI 的 prompt 很简短，能说说你选择这种风格的理由吗？"
- 如果 sTradeoffArticulation 低 → "你的 MD 权衡只写了一句，能展开说说三个方案各自的失败模式吗？"

输出纯文本问题。
```

#### Round 4: escalation
```
你是 Emma。在候选人回答变化的基础上升级难度。

候选人 weakness round 回答：{weaknessAnswer}
候选人擅长模块：{strongestModule}

提一个"更高层次"的追问，测试候选人的元认知和抽象能力。例如：
- "你刚才讲了 X 的实现，如果让你把这个能力教给一个入职新人，你会怎么说？"
- "如果这个系统要支持 10x 流量，你的方案哪些地方会先崩？"
- "你做的这个决策背后的原则是什么？在其他场景下还适用吗？"

输出纯文本问题。
```

#### Round 5: transfer
```
你是 Emma。最后一轮，测试知识迁移能力。

候选人 escalation round 回答：{escalationAnswer}
候选人技术画像：{techProfile}

提一个"迁移到不同场景"的追问。例如：
- "你在 MA 选择方案 B 的理由是 Y。如果现在场景换成 {differentScenario}，
   你会选哪个方案？理由会变吗？"
- "你在 MD 设计的 X 结构，如果放到 {differentDomain} 领域会有哪些挑战？"

问题应该：
- 有足够的场景跨度（不是换参数）
- 测试"原则理解"vs"模式套用"

输出纯文本问题。
```

**每个 prompt 的 key**：
- mc.probe_engine.baseline
- mc.probe_engine.contradiction
- mc.probe_engine.weakness
- mc.probe_engine.escalation
- mc.probe_engine.transfer

Backend Task 11 从 PromptRegistry 读取，替换 {variable}，调用 ModelProvider。

### 20. MC 3 个信号计算规则

**直接回答。**

#### sBoundaryAwareness（边界意识）

**定义**：候选人是否承认自己回答的局限、不熟悉的地方、不确定的点。

```typescript
function sBoundaryAwareness(mcAnswers: V5ModuleCAnswer[]): number | null {
  if (mcAnswers.length < 3) return null;
  
  // 关键词：表达不确定 / 承认局限 / 区分场景
  const boundaryMarkers = [
    // 承认不确定
    '我不太确定', '不是很清楚', '可能', '也许', '估计',
    // 区分场景
    '取决于', '要看', '如果是', '在...情况下',
    // 承认局限
    '没考虑过', '这个没经验', '理论上', '我的理解是',
    // 元认知
    '可能我理解得不对', '这个问题要看具体'
  ];
  
  let totalMarkers = 0;
  let totalAnswers = 0;
  
  for (const answer of mcAnswers) {
    if (answer.answer.length < 30) continue;  // 太短的回答不算
    totalAnswers += 1;
    totalMarkers += countMarkers(answer.answer, boundaryMarkers);
  }
  
  if (totalAnswers === 0) return null;
  
  // 平均每答里的 marker 数
  const avgMarkers = totalMarkers / totalAnswers;
  
  // avgMarkers = 0: 0.0（完全没有边界意识）
  // avgMarkers = 1: 0.5（基本有边界）
  // avgMarkers = 2: 0.8（良好）
  // avgMarkers >= 3: 1.0（充分）
  return Math.min(1.0, avgMarkers / 3);
}
```

#### sCommunicationClarity（沟通清晰度）

**定义**：候选人回答的结构化程度和准确性。

```typescript
function sCommunicationClarity(mcAnswers: V5ModuleCAnswer[]): number | null {
  if (mcAnswers.length < 3) return null;
  
  let totalScore = 0;
  let totalAnswers = 0;
  
  for (const answer of mcAnswers) {
    if (answer.answer.length < 30) continue;
    totalAnswers += 1;
    
    let score = 0;
    
    // 因子 1: 长度合理性（30%）
    // 30-150 字最佳，过长或过短扣分
    const len = answer.answer.length;
    if (len >= 30 && len <= 150) score += 0.3;
    else if (len <= 30) score += 0.3 * (len / 30);
    else score += 0.3 * Math.max(0, 1 - (len - 150) / 300);
    
    // 因子 2: 结构化标记（30%）
    // 包含"首先/其次/最后"/"1./2./3."/"原因/方法/结果"
    const structureMarkers = ['首先', '其次', '最后', '另外', '原因', '方法', '结果'];
    const structureCount = countMarkers(answer.answer, structureMarkers);
    score += 0.3 * Math.min(1, structureCount / 2);
    
    // 因子 3: 技术词精确度（40%）
    // 包含具体技术术语（数据库名/框架名/算法名/具体数字）
    const technicalTerms = extractTechnicalTerms(answer.answer);
    score += 0.4 * Math.min(1, technicalTerms / 3);
    
    totalScore += score;
  }
  
  if (totalAnswers === 0) return null;
  return totalScore / totalAnswers;
}
```

**V5.1 加 argumentStructure 因子**（Gemini 之前建议），现在先不加。

#### sReflectionDepth（反思深度）

**定义**：候选人在 MC 中体现的元认知和反思能力。

```typescript
function sReflectionDepth(mcAnswers: V5ModuleCAnswer[]): number | null {
  if (mcAnswers.length < 3) return null;
  
  const reflectionMarkers = [
    // V4 原有（Phase -1 扩充）
    '我觉得', '我认为', '反思',
    // V5 新增
    '如果重来', '下次会', '学到了', '应该', '原本以为',
    '后来发现', '换个角度', '其实', '没想到', '意识到',
    // 高级反思
    '我错了', '之前没想到', '这次的教训',
    '更好的做法', '我会重新考虑'
  ];
  
  let totalMarkers = 0;
  let highDepthCount = 0;  // 含"高级反思"关键词
  let totalAnswers = 0;
  
  const highDepthMarkers = ['我错了', '之前没想到', '这次的教训', '更好的做法'];
  
  for (const answer of mcAnswers) {
    if (answer.answer.length < 30) continue;
    totalAnswers += 1;
    totalMarkers += countMarkers(answer.answer, reflectionMarkers);
    if (countMarkers(answer.answer, highDepthMarkers) > 0) {
      highDepthCount += 1;
    }
  }
  
  if (totalAnswers === 0) return null;
  
  // 基础反思得分
  const baseScore = Math.min(1.0, totalMarkers / totalAnswers / 2);
  
  // 高级反思加成
  const depthBonus = highDepthCount / totalAnswers * 0.3;
  
  return Math.min(1.0, baseScore + depthBonus);
}
```

### 21. MC 前序 submission 锚点追问机制

**直接回答。**

Emma 从前序 submissions 提取"可追问点"的逻辑在 Backend mc-voice-chat.ts 的 `buildDynamicSystemPrompt`。

**提取策略**：

```typescript
function extractAnchorPoints(submissions: V5Submissions): AnchorPoint[] {
  const anchors: AnchorPoint[] = [];
  
  // 从 MA 提取
  if (submissions.moduleA) {
    anchors.push({
      source: 'ma.round1',
      type: 'scheme_choice',
      content: `选了方案 ${submissions.moduleA.round1.schemeId}，理由：${submissions.moduleA.round1.reasoning.slice(0, 200)}`,
      probeHint: `追问方案权衡的深度、对其他方案的了解`,
    });
    
    if (submissions.moduleA.round2.markedDefects.length > 0) {
      const topDefect = submissions.moduleA.round2.markedDefects[0];
      anchors.push({
        source: 'ma.round2',
        type: 'code_review',
        content: `标注了 ${submissions.moduleA.round2.markedDefects.length} 处问题，最严重的是 Line ${topDefect.line}: ${topDefect.comment}`,
        probeHint: `追问为什么认为这处最严重、修复方案的副作用`,
      });
    }
    
    anchors.push({
      source: 'ma.round3',
      type: 'diagnosis',
      content: `诊断：${submissions.moduleA.round3.diagnosisText.slice(0, 200)}`,
      probeHint: `追问诊断推理过程、能否举出类似场景`,
    });
  }
  
  // 从 MB 提取
  if (submissions.mb) {
    if (submissions.mb.planning && !submissions.mb.planning.skipped) {
      anchors.push({
        source: 'mb.planning',
        type: 'decomposition',
        content: `MB 任务分解：${submissions.mb.planning.decomposition.slice(0, 200)}`,
        probeHint: `追问为什么这样分解、和直接让 AI 写的区别`,
      });
    }
    
    const completionRate = calculateAcceptRate(submissions.mb.editorBehavior.aiCompletionEvents);
    anchors.push({
      source: 'mb.behavior',
      type: 'ai_usage',
      content: `AI 补全接受率 ${(completionRate * 100).toFixed(0)}%，Chat/直接编辑比例 ${calculateChatRatio(submissions.mb.editorBehavior).toFixed(2)}`,
      probeHint: `追问为什么是这个使用模式、什么时候会偏离`,
    });
    
    anchors.push({
      source: 'mb.final',
      type: 'quality',
      content: `最终测试通过率 ${(submissions.mb.finalTestPassRate * 100).toFixed(0)}%`,
      probeHint: `如果通过率不高，追问哪些 test 没过、原因；如果高，追问哪些边界没覆盖`,
    });
  }
  
  // 从 MD 提取（V5 新增锚点）
  if (submissions.moduleD) {
    anchors.push({
      source: 'md.design',
      type: 'design_decomposition',
      content: `MD 设计 ${submissions.moduleD.subModules.length} 个子模块，选了 ${submissions.moduleD.constraintsSelected.length} 类约束`,
      probeHint: `追问为什么这样划分、模块间接口设计、被弃的设计方案`,
    });
    
    anchors.push({
      source: 'md.tradeoff',
      type: 'tradeoff',
      content: `MD 权衡：${submissions.moduleD.tradeoffText.slice(0, 200)}`,
      probeHint: `追问权衡的量化依据、失败模式分析`,
    });
  }
  
  return anchors;
}
```

**Emma 如何使用 anchors**：

在每轮 probe 的 prompt 里，Emma 会：
1. 看 anchors 列表
2. 根据当前 round 的 strategy（baseline/contradiction/weakness/escalation/transfer）选择合适的 anchor
3. 在 system prompt 里强调"围绕 {anchor.source} 展开"

每轮后记录本轮用了哪个 anchor，避免下一轮重复。

**5 轮 anchor 分配建议**：
- baseline: 选最"中性"的 anchor（通常是 ma.round1 的方案选择）
- contradiction: 选两个不同来源的 anchor，寻找矛盾（ma.round1 vs mb.behavior 经常能找到）
- weakness: 选信号最低的模块对应的 anchor（signals 数据来源）
- escalation: 选候选人最擅长的模块 anchor，升级挑战
- transfer: 选 md.design 或 mb.final 的 anchor（这类最容易迁移到别的场景）

---

## 一个重要提醒

**sTechProfile 权重 0.02 的权重分配问题**

问题 11 里我说 sTechProfile 在 metacognition 维度占 0.02，其他信号等分剩下 0.98。这意味着：

```
meta = avg(sAiCalibration, sDecisionStyle, sMetaCognition, sReflectionDepth) * 0.98
     + sTechProfile * 0.02
```

**但这和"等权聚合"的默认规则冲突**。其他维度的信号都是等权，只有 sTechProfile 特殊。

**Backend 实现时要处理**：
- SignalDefinition 增加 `weight?: number` 可选字段，默认 1.0
- sTechProfile.weight = 0.04（因为 metacognition 有 5 个信号，0.04 / (4 + 0.04) ≈ 0.01）

精确公式：
```
dimensionScore = sum(signal.value * signal.weight) / sum(signal.weight)

对 metacognition:
  weights: [1, 1, 1, 1, 0.04]  // 最后一个是 sTechProfile
  sum(weights) = 4.04
  sTechProfile 实际贡献 = 0.04 / 4.04 ≈ 0.01
```

所以 sTechProfile 实际权重约 1%，不是 2%。如果你希望严格 2%，要调整 weight 为 0.0816（让最终占比达到 2%）。

**简化方案**：sTechProfile.weight = 0.1，大约占 metacognition 的 2.4%。够用。

这是信号系统设计的细节，Backend 实现 Task 13 时要明确。

---

## 汇总

P0 1-11 题：✓ 已答
P1 12-21 题：✓ 已答

**遗漏发现**（需要补给 Backend）：
1. ExamInstance 保留 analytics 字段（问题 2）——已在 P0 回答里给修正指令
2. V5_GenericSignalDefinition 需要 `weight?: number` 字段（sTechProfile 特殊权重）——问题 11/P1 补充

**关键决策已明确**：
- ExamModule.moduleSpecific 6 个模块的 TypeScript interface 全部定义
- module.store.ts 和 session.store.ts 完整 API
- EvaluationIntroPage / ProgressIndicator 的完整设计
- 5 套件权重 + gradeCandidate floor 规则
- 43 信号全量映射表 + 计算公式
- Step 0-8 generator 完整 I/O schema
- 6 个 BusinessScenario 选择 + level 变异规则
- Cursor 模式 4 阶段状态机
- 5 个 Cursor 信号数学公式
- E2B → Docker → Static 降级逻辑
- MC 5 轮 probe 策略 + 3 信号计算 + anchor 提取

**还需要下次回答**：P2 (22-30)，涉及效度验证、生产部署、产品生态。这些不阻塞 Task 2-14 启动，可以慢慢补。

你要我继续答 P2 吗？还是你先拿这份给 Backend / Frontend 用？

继续 P2 (22-30)。

---

## P2 第 22-24 题：效度与数据

### 22. V5.0 效度验证详细方案

**三视角讨论。不确定。**

**Karpathy**：
"20-30 人是最低可接受样本，但对 S+ 这种极端等级几乎没有统计意义。至少需要在每个 grade band 有 3-5 个样本。20 人如果全部是 B-A 区间，上下端的效度完全不知道。理想 30-50 人。"

"评级标准最大的陷阱是'主观锚点'——你让合作客户的内部评级来对比 V5 评分，但客户的内部评级本身可能是错的（比如他们偏爱'熟悉业务'的工程师，而不是真的技术强的）。Spearman 相关 0.6 可能反映的是'V5 和客户偏见的一致性'，而不是'V5 和真实技术能力的一致性'。"

"更严格的做法是：找 3-5 家客户，每家提供 5-10 人，用他们各自的内部评级。如果 V5 在 5 家都和客户评级正相关但相关系数不同，反而是好信号（说明 V5 捕捉的是共同的技术信号，不是单一客户的偏见）。"

**Gemini**：
"销售叙事角度看，客户会问'你们的评分准不准'。完美答案是'我们在 20+ 工程师上做了验证，和内部评级相关 0.X'。但这个答案只有在 0.6+ 时才有说服力。低于 0.5 要避免谈数字。"

"客户会问'这 20 人怎么选的'。如果是'CodeLens 联合创始人的朋友'，客户会怀疑偏样本。理想选择是合作客户的真实候选人池，而不是认识的人。"

"效度验证的频率要持续，不是一次性。V5.0 发布后 2 周做第一轮，3 个月后做第二轮（数据量 100+），6 个月做第三轮。相关系数稳定 > 0.6 才能写入销售材料。"

**Claude Code 工程**：
"效度验证的工程实现需要一个专用 Admin 页面：批量导入内部评级（CSV）+ 显示 CodeLens 评分对比 + 自动算 Spearman。这本身是 2-3 天开发。V5.0 不做（Backend 任务文档明确），V5.0.1 做。"

"数据收集格式：每人一条记录，包含 sessionId + 客户内部评级（1-5 或 S/A/B/C 格式）+ 角色（前端/后端）+ 工作年限。Spearman 计算只需 sessionId 的 V5 composite 和内部评级的秩相关。"

**结论：详细方案**

**Phase 1：V5.0 发布前（2 周）**
- 找 2 个熟悉的工程师朋友跑 full_stack suite（真实性抽查）
- 目的：确保题目"看起来真实"而不是 LLM 生成的假场景
- 数据：2 人的完整反馈（书面 + 30 分钟电话）
- 不是统计效度，是产品理解检查

**Phase 2：V5.0 发布后 2 周（启动正式验证）**
- 找 1 家合作客户（可以是早期试用客户，不付费）
- 客户提供 20-30 名已有内部评级的工程师
- 评级格式：客户自有（S/A/B/C 或 1-10 分）
- 每人跑 full_stack suite（其他套件样本太少不做）
- 数据收集：
  - sessionId + V5 composite + V5 grade
  - 客户内部评级
  - 角色 + 工作年限
  - 是否 AI 熟练使用（客户自评）
- 跑完后计算：
  - Spearman 相关（V5 composite vs 内部评级）
  - 分角色相关（前端 vs 后端是否一致）
  - 分年限相关（1-3 年 vs 3-7 年）
- 结果处理：
  - r > 0.6：发布效度白皮书（"在 30 人样本上 V5 和内部评级相关 r=X"）
  - r 0.5-0.6：可接受，继续收集 100+ 人
  - r < 0.5：分维度分析，识别哪个维度偏差大（如果是 communication 偏差，可能是 ASR 问题；如果是 aiEngineering 偏差，可能是反 U 曲线假设错）。弱维度标注"实验性"并暂停对外推广 V5.0

**Phase 3：V5.0 发布后 3 个月**
- 3 家客户各提供 5-15 人（合计 30-50 人）
- 跨客户比较相关系数
- 如果都 > 0.6：V5 效度可靠
- 如果差异大（某家 0.3 某家 0.7）：那家 0.3 的客户可能有特殊偏见，不作为主要参考

**Phase 4：V5.0 发布后 6 个月**
- 100+ 候选人数据
- 可以做更精细分析：
  - 每维度的 predictive validity
  - MD / MC 等 LLM 白名单信号的稳定性
  - 不同 suite 的内部一致性（α 系数）

**具体操作**：
- Admin 页面开发（2-3 天，V5.0.1 做）
- 定义数据收集 schema（简单 CSV：sessionId,externalRating,role,yearsOfExperience）
- 计算脚本（Python scipy.stats.spearmanr，10 行代码）
- 白皮书模板（1 天写）

**销售策略**：
- V5.0 发布时不谈效度数字（"还在验证中"）
- V5.0 + 1 个月：有 30 人数据后可以在销售材料里说"我们和客户内部评级一致性为 X"
- 3 个月后才把数字放到 landing page

这个方案 Karpathy 觉得最严格，Gemini 觉得销售上可操作，工程上 V5.0.1 实现 Admin 页面即可。

### 23. Golden Path fixture 每等级理想答案

**直接回答。给完整规格。**

每个 grade 的 fixture 需要定义：
- 每个模块的完整 submission
- 预期信号值（43 个）
- 预期维度分数（6 个）
- 预期 composite 分数
- 预期 grade

#### S 级 fixture（full_stack suite）

**Phase 0**：
```typescript
{
  codeReading: {
    l1Answer: 'B',  // 假设 B 是 correctIndex
    l2Answer: '这段代码在 SQL 查询里直接拼接字符串，存在 SQL 注入漏洞。另外 N+1 查询问题在 line 45 明显，会在大数据量下成为瓶颈。还有一个隐含问题是没有事务处理，删除操作失败会留下孤儿数据。',  // 200 字技术精确
    l3Answer: '分布式场景下主要改 3 个地方：1) 数据库从单实例改分库分表，按 user_id hash 分 16 片；2) 缓存层加 Redis，热点数据 TTL 5 分钟；3) 接口幂等性设计，用 request_id 作为去重 key。另外异步任务要考虑分布式锁，Redis SETNX 或 Zookeeper 都可以，具体看团队栈。',  // 300+ 字，具体方案
    confidence: 85,
  },
  aiOutputJudgment: [
    { choice: 'A', reasoning: '代码 A 虽然写法朴素但逻辑正确。代码 B 的 stream 处理在并发下会有问题，第 12 行的 map 操作不是线程安全的，会导致计数错误。' },
    { choice: 'both_good', reasoning: '两段代码针对不同场景：A 适合读多写少（缓存友好），B 适合写多读少（避免 cache miss 放大）。没有绝对优劣，看业务模式。' },
  ],
  decision: {
    choice: 'option_2',
    reasoning: '选择方案 2（主动刷新 + 短 TTL）而不是 1（被动 + 长 TTL）或 3（不缓存）。理由：业务是支付场景精度优先，TTL 太长会导致状态不一致。短 TTL 配合主动刷新在 DB 负载和一致性之间平衡。方案 3 的直连 DB 在高并发下会打爆。',
  },
}
```

**Module A**：
```typescript
{
  round1: {
    schemeId: 'B',
    reasoning: '方案 B (Redis 主动刷新缓存)最优。理由 3 点：1) 我们的 QPS 预期 5000，方案 A 直连 DB 的连接池会是瓶颈（MySQL 单实例 2000 max）；2) 一致性上方案 B 的 write-through 策略比方案 C 的最终一致更适合支付场景；3) 成本上 B 比 C 低，因为不需要 Kafka 这种重基础设施。唯一风险是 Redis 单点，缓解方案是主从 + sentinel。',
    structuredForm: {
      scenario: '支付交易读多写少，QPS 5k，单笔金额 1-10k 元',
      tradeoff: 'A 方案简单但 DB 瓶颈；B 方案复杂度中等但性能好；C 方案最终一致牺牲了支付业务的一致性要求',
      decision: '选 B，以 Redis 主从保证可用性',
      verification: '用压测工具模拟 5k QPS，观察 P99 延迟 < 200ms 和数据一致性',
    },
    challengeResponse: '我的论据成立。B 方案"成本低"是指 infra 成本，不是开发成本——开发成本 B 确实比 A 高但比 C 低。C 方案的可扩展性优势在我们当前 QPS 规模（5k）不会显现，未来如果 10x 增长才需要升级到 C。现在选 B 是正确的 YAGNI 权衡。',
  },
  round2: {
    markedDefects: [
      { defectId: 'd1', commentType: 'bug', comment: 'SQL 注入漏洞，Line 23', fixSuggestion: '用 prepared statement' },
      { defectId: 'd2', commentType: 'bug', comment: 'Line 45 有 N+1 查询', fixSuggestion: 'JOIN 或 IN 批量查' },
      { defectId: 'd3', commentType: 'suggestion', comment: '事务边界太大', fixSuggestion: '拆分到 Service 层' },
      { defectId: 'd4', commentType: 'question', comment: 'Line 78 的重试次数写死 3 次', fixSuggestion: '建议配置化' },
    ],
  },
  round3: {
    correctVersionChoice: 'success',
    diffAnalysis: '两版代码的关键差异：1) successCode Line 15 用了 synchronized 块保护 counter；2) successCode 在 Line 28 加了 try-finally 释放锁；3) failedCode 缺少这两处，在并发下会导致计数错误和死锁。',
    diagnosisText: 'failedCode 的根因是共享可变状态没有同步保护。当多线程同时进入 update 方法时，counter++ 不是原子操作（读-改-写三步），导致部分更新丢失。解决方案除了 synchronized，也可以用 AtomicInteger，更高性能。',
  },
}
```

**MB (Cursor 模式)**：
```typescript
{
  planning: {
    decomposition: '3 步：1) 先修改 UserRepository 加查询方法 getByEmail；2) 在 UserService 里实现 checkEmailExists 逻辑，调用 repo 并处理 null；3) Controller 层加 /users/check-email endpoint 返回 200/409',
    dependencies: 'UserController 依赖 UserService，UserService 依赖 UserRepository，所以按 Repository → Service → Controller 顺序实现',
    fallback: '如果 Redis 缓存层添加失败，降级到直接 DB 查询（加日志告警）。如果新 endpoint 在上线后压力大，用 nginx 限流 100 qps',
    skipped: false,
  },
  editorBehavior: {
    aiCompletionEvents: /* 生成反 U 曲线的 60% accept rate */ [...],
    chatEvents: /* chat/direct 比例 40% */ [...],
    fileNavigationHistory: /* 按 dependencyOrder 打开 */ [...],
    editSessions: /* 按 dependencyOrder 编辑 */ [...],
    testRuns: /* 3-5 次测试 */ [...],
  },
  finalFiles: /* 全部测试通过的实现 */ [...],
  finalTestPassRate: 1.0,
  standards: {
    rulesContent: `# Coding Rules
    
1. 所有 public 方法必须有单元测试覆盖
2. 禁止在 Controller 里直接访问 Database
3. 错误处理必须用自定义异常而不是 RuntimeException
4. 日志级别：业务错误 warn，系统异常 error
5. 所有 SQL 必须通过 Repository 层，禁止在 Service 拼 SQL`,
    agentContent: `# Agent Instructions
    
- 生成代码前先看 tests/ 目录的测试期望
- 修改代码时保持和已有代码风格一致（缩进、命名）
- 涉及 DB 操作先在 Repository 加方法，不要在 Service 直接 query`,
  },
  audit: {
    violations: [
      { exampleIndex: 0, markedAsViolation: true, violatedRuleId: 'rule_3' },
      { exampleIndex: 1, markedAsViolation: false },  // 语义边界诱饵
      { exampleIndex: 2, markedAsViolation: true, violatedRuleId: 'rule_2' },
    ],
  },
}
```

**MC**：
```typescript
[
  // Round 1 baseline
  {
    round: 1,
    question: '你在 MA 选择了方案 B，能说说这个决策的核心依据是什么？',
    answer: '核心依据是我们的业务规模和特点。5k QPS 的场景下，方案 A 的直连会因为 MySQL 连接池（2k max）打爆；方案 C 的最终一致性不适合支付场景。方案 B 在读性能和一致性之间找到平衡。具体实现上是 Redis 主从 + sentinel 保证 HA，cache-aside 模式配合 write-through 更新。',
    probeStrategy: 'baseline',
  },
  // Round 2 contradiction
  {
    round: 2,
    question: '你刚才说"选 B 是因为一致性要求高"，但 B 方案的 cache-aside 本质也是最终一致（有短暂不一致窗口）。这是不是自相矛盾？',
    answer: '你的质疑对，我用词不准确。严格说方案 B 是"强一致性 + 短窗口最终一致"。支付场景对"提交后立即可见"的强一致性要求高，而 Redis 的 write-through 能做到这点。方案 C 是"最终一致 + 长窗口不一致"，通过 Kafka 异步刷新，在高并发下窗口可能秒级。对支付场景不可接受。所以不是矛盾，是我之前说得太粗。',
    probeStrategy: 'contradiction',
  },
  // Round 3 weakness
  {
    round: 3,
    question: '看你的 Stage 1 planning，步骤写得很短。如果让你重做，会怎么规划？',
    answer: '确实我当时写得简略，因为熟悉这个套路。如果重做，会加上每步的失败处理：1) Repository 加方法时，如果 DB 连接失败怎么 fallback；2) Service 的幂等性保证，相同请求重复调用的行为；3) Controller 层的参数校验规则。另外还应该写上每步的单元测试 expected case。这样 AI 协作时能一次性覆盖完整场景。',
    probeStrategy: 'weakness',
  },
  // Round 4 escalation
  {
    round: 4,
    question: '假设这个系统要支持 10x 流量增长，你的方案 B 哪里会先崩？',
    answer: 'Redis 单实例会先成为瓶颈。5k QPS 到 50k 时 Redis 单机 10w QPS 虽然理论能扛，但内存大小和网络带宽会先顶不住。缓解路径：先从 Redis 主从改 cluster 分片；到 100k QPS 时再考虑分区策略和热点打散；最后可能走多级缓存（本地 + Redis + DB）。另外要关注数据库的写压力，读用缓存挡得住，但写路径还是直连 DB。',
    probeStrategy: 'escalation',
  },
  // Round 5 transfer
  {
    round: 5,
    question: '如果场景从支付改成直播打赏（高并发、容忍短暂不一致），你会选哪个方案？',
    answer: '会重新选。直播打赏场景方案 C 可能更合适：1) 并发量大（百万级），cache-aside 的 Redis 会成为瓶颈；2) 用户体验上允许"榜单几秒后更新"，一致性窗口可接受；3) Kafka 异步刷新可以批量聚合写入，降低 DB 压力。方案 B 的同步 write-through 在这个场景会是瓶颈。我之前在支付场景选 B 的核心原则是"一致性优先于性能"，到打赏场景原则反转为"性能优先于一致性"，所以方案也要换。',
    probeStrategy: 'transfer',
  },
]
```

**SelfAssess**：
```typescript
{
  confidence: 80,
  reasoning: 'MA 的方案选择和代码审查我比较有把握，MB 的编排经验丰富但 Stage 3 规范可能写得不够严谨。MC 的一致性追问让我意识到用词需要更精确。整体表现应该在 80-85 分。',
}
```

**预期信号值**（摘 10 个高分代表）：
```typescript
{
  sBaselineReading: 0.9,
  sSchemeJudgment: 0.92,
  sReasoningDepth: 0.88,
  sArgumentResilience: 0.95,  // 挑战后维持立场
  sCodeReviewQuality: 0.85,
  sTaskDecomposition: 0.9,
  sAiCompletionAcceptRate: 0.98,  // 60% rate，peak
  sChatVsDirectRatio: 0.95,  // 40% ratio，peak
  sTestFirstBehavior: 1.0,
  sRuleEnforcement: 0.85,
  sCommunicationClarity: 0.88,
  sReflectionDepth: 0.92,  // Round 2-5 都有反思
  // ... 其他信号
}
```

**预期维度分数**：
```typescript
{
  technicalJudgment: 87,
  aiEngineering: 85,
  codeQuality: 82,
  communication: 86,
  metacognition: 84,
  systemDesign: null,  // full_stack 不含 MD
}
```

**预期 composite**：85.2
**预期 grade**：S
**预期 dangerFlag**：false

---

#### A 级 fixture（关键差异 vs S 级）

- Phase 0 L3 答 150 字（比 S 的 300 字短），缺少"幂等性"这类高阶概念
- MA Round 1 reasoning 80 字（精简但完整），structuredForm 每项 30-50 字
- MA Round 1 challengeResponse：承认挑战的部分合理，稍微调整立场但坚持核心
- MB testPassRate 0.85（大部分通过但有边界 case 没覆盖）
- MB completionAcceptRate 0.75（略高于 peak 但还合理）
- MC Round 5 的迁移回答 150 字（vs S 的 300 字），知道场景会变但没清楚说"原则反转"
- SelfAssess confidence 70

**预期 composite**：77
**预期 grade**：A

---

#### B 级 fixture（关键特征）

- Phase 0 L3 答 80 字，方案笼统（"加缓存"但不说细节）
- MA Round 1 reasoning 40 字，structuredForm 有空项
- MA challengeResponse：立场动摇，改选了另一个方案但理由单薄
- MB testPassRate 0.6
- MB completionAcceptRate 0.88（太依赖 AI）
- MB planning 跳过或草率
- MC 回答短促，Round 4 escalation 答不深入
- SelfAssess confidence 60，reasoning 模糊

**预期 composite**：58
**预期 grade**：B

---

#### C 级 fixture（关键特征）

- Phase 0 L3 答"没思路"或 30 字空话
- MA Round 1 reasoning 20 字不完整，只选了 schemeId 不填 structuredForm
- MA markedDefects 全是 'bug' 类型（触发 V4 fallback）
- MA Round 3 选错 correctVersionChoice
- MB testPassRate 0.3
- MB completionAcceptRate 0.95（几乎全接受）
- MB 跳过 planning，standards 写了 10 个字
- MC 回答多是"我不太清楚"/"应该是这样吧"
- SelfAssess confidence 50，reasoning 空白

**预期 composite**：42
**预期 grade**：C

---

**fixture 实现位置**：
- `e2e/fixtures/golden-paths-v5/full_stack/s-grade-fixture.ts` 等
- 每个 fixture 是一个 default export 的 object
- 包含 `submissions` + `expectedSignals` + `expectedDimensions` + `expectedComposite` + `expectedGrade`

**Golden Path spec 如何使用**：
- 加载 fixture → 调用 scoring.service → 对比 signals / dimensions / grade
- 允许小误差（例如信号值 ±0.05，composite ±2）
- 超出误差报错

这些 fixture 由 Epsilon (Backend 的 Phase 3 Task 17) 写，不是现在写。但现在定义规格让 Backend 心里有数。

### 24. V4 23 条 session 基线数据

**直接回答。**

**V4 的 23 条 session 不能用作 V5 的基线数据**。原因：

1. **V5 的 submission 结构和 V4 不同**
   - V4 没有 Cursor 模式的 editorBehavior
   - V4 没有 Stage 3 standards 和 Stage 4 audit
   - V4 没有 MD 的 designTask
   - V4 的 Module A 没有 R1 challenge 和 R3 compare diagnosis
   
2. **V5 的信号和 V4 不同**
   - V5 的 43 信号有 22 个是 V4 没有的（Cursor 行为 5 个 + Stage 3/4 新增 4 个 + 其他）
   - V4 的旧信号在 V5 里很多被重新定义（如 sReflectionDepth 扩了关键词）
   
3. **V4 没有真实候选人数据**
   - 23 条都是内部测试（Steve + Liam 等）
   - 没有统计意义

**V4 数据在 V5 的价值**：

**正面价值（有限）**：
- 可以作为"V4 → V5 迁移没有破坏性回归"的参考（但只能看特定信号）
- V4 Golden Path 的 S/A/B/C fixture 可以作为 V5 fixture 设计的参考（但不直接复用）

**负面价值**：
- 混入 V5 数据会污染统计
- Backend 读 V4 session 会报错（schema 不兼容）

**处理方式**：
- V4 数据保留在生产 DB 但 V5 代码不读
- 新建 codelens_v5 数据库，V5 所有 session 从 0 开始
- V4 数据作为"历史参考"保留，不进入 V5 分析

**效度验证用的是全新 V5 数据**（问题 22 的 Phase 2），不是 V4 基线。

---

## P2 第 25-27 题：部署与运维

### 25. 服务器 Postgres 配置

**不确定。需要你确认。**

我知道的（从 memory 和对话）：
- 服务器：115.190.118.235
- V4 部署路径：/opt/codelens/
- 应用连接 Postgres（具体参数未知）

**我不知道的**：
- Postgres 版本（可能 13/14/15/16 之一）
- 端口（默认 5432 但可能改过）
- 是否对公网开放（建议不开，内部 VPC 访问）
- backup 策略（是否有 pg_dump 定时任务）
- 连接池配置（PgBouncer？）

**三视角建议**：

**Karpathy**：
"没做 backup 就是赌没有硬件故障。V5 上线前必须确认 backup 机制。推荐 pg_dump 每天凌晨 + WAL 归档到对象存储。"

**Gemini**：
"生产数据安全是客户信任的底线。V5 签约时客户可能会问'你们的数据备份和隔离策略是什么'。必须有答案。"

**Claude Code 工程**：
"V5 Task 2 开始前需要本地 dev DB 跑 migration。本地 Postgres 16 + Docker 是标准做法。生产部署交给 Task 20（性能监控）之后的部署阶段。"

**需要你现在做的**：
SSH 到服务器确认以下信息：

```bash
# SSH 到服务器
ssh -i ~/.ssh/codelens_deploy_key root@115.190.118.235

# 查 Postgres 版本
psql --version
# 预期：psql (PostgreSQL) 15.x 或类似

# 查进程
ps aux | grep postgres

# 查配置文件
cat /etc/postgresql/*/main/postgresql.conf | grep -E "listen_addresses|port|max_connections"

# 查 backup
ls -la /var/backups/postgresql/ 2>/dev/null
crontab -l | grep pg_dump

# 查 V4 DB
sudo -u postgres psql -l | grep codelens
```

把结果贴给我，我再给具体的 V5 部署建议。

### 26. V5 上线切换 runbook

**三视角讨论 + 结论。**

**Karpathy**：
"V4 → V5 的切换不是'下线 V4 上线 V5'这么简单。V5 是全新应用，要完整部署 stack（Node.js + Postgres + Redis + E2B），测试通过后才切 DNS。"

**Gemini**：
"客户友好的切换：V5 上线期间不能影响正在评估的候选人。V4 的 23 条 session 都是测试的，但 V5 上线日如果真有候选人在用（早期客户试用），中断会影响体验。"

**Claude Code 工程**：
"V4 没有真实候选人（0 付费客户），切换不需要考虑用户体验问题。可以直接替换。"

**结论：三阶段切换**

**Stage 1：V5 预部署（V5.0 发布前 1 周）**
```bash
# 在服务器上
cd /opt
mkdir codelens-v5
cd codelens-v5

# 部署 V5 代码
git clone https://github.com/fantasieleven-code/CodeLens-V5.git .
npm install
npm run build

# 创建 V5 数据库
sudo -u postgres createdb codelens_v5

# 跑 V5 migration
npx prisma migrate deploy

# 启动 V5 服务（暂用新端口，不冲突 V4）
PORT=3001 npm start

# V5 此时在 http://115.190.118.235:3001 可访问
# V4 继续在 http://115.190.118.235:3000 或 80 端口
```

**Stage 2：V5 测试（3-5 天）**
```bash
# 内部测试 V5
# - Admin 登录 v5.codelens.recruitagent.cc
# - 跑完整 evaluation flow
# - 查看报告
# - Golden Path 跑通

# Nginx 配置两个 subdomain
# codelens.recruitagent.cc → V4 (port 3000)
# v5.codelens.recruitagent.cc → V5 (port 3001)
```

**Stage 3：切换（V5.0 发布日）**
```bash
# 修改 Nginx
# codelens.recruitagent.cc → V5 (port 3001)
# v4.codelens.recruitagent.cc → V4 (port 3000，保留 1 个月后下线)

# 更新 SSL 证书（如果需要）

# V5 证书续期（Let's Encrypt）
certbot renew

# 重启 Nginx
systemctl reload nginx

# 监控 V5 日志和 Sentry
tail -f /var/log/codelens-v5/app.log

# V4 保留运行 1 个月（应对回滚）
```

**回滚机制**：
```bash
# 如果 V5 上线后出现严重问题（< 24h 内）
# 改 Nginx 指回 V4
sed -i 's/proxy_pass http:\/\/localhost:3001/proxy_pass http:\/\/localhost:3000/' /etc/nginx/sites-enabled/codelens
systemctl reload nginx

# 回滚后继续用 V4，解决 V5 问题后再切回
```

**1 个月后 V4 下线**：
```bash
# V4 停服
systemctl stop codelens-v4

# 备份 V4 DB
pg_dump codelens_v4 > /var/backups/codelens-v4-final.sql

# V4 DB 保留（不删）
# V4 代码保留在 /opt/codelens/（不删）

# 这是"优雅下线"，不是 "rm -rf"
```

**需要的资源**：
- Nginx 配置改动（30 分钟）
- DNS 解析添加 v5. 和 v4. subdomain（10 分钟，DNS 生效 30 分钟）
- SSL 证书（Let's Encrypt 自动）
- 监控（Sentry 已在 V4 复用，V5 新建 project）

**时间估算**：
- Stage 1 部署：1 天
- Stage 2 测试：3-5 天
- Stage 3 切换：2 小时（DNS + Nginx + 监控）
- 回滚窗口：1 周密切监控

### 27. 现有监控、日志、alerting

**直接回答。V4 已有部分基础设施。**

V4 已复制到 V5 的 A 类代码（基础设施）：
- `packages/server/src/lib/sentry.ts` - Sentry 集成
- `packages/server/src/lib/langfuse.ts` - LLM 调用追踪
- `packages/server/src/lib/logger.ts` - 结构化日志（pino）
- `packages/server/src/middleware/errorHandler.ts` - 错误处理中间件
- `packages/server/src/middleware/requestLogger.ts` - 请求日志

**V5 继续使用的**：
- Sentry: 错误追踪 + 性能监控
- Langfuse: LLM 调用完整链路（prompt + response + latency + cost）
- Pino logger: 结构化日志（JSON 格式）
- Request middleware: 每个 API 调用的 access log

**V5 新增的**：

#### 1. 性能监控埋点（Backend Task 20）

```typescript
// 示例：sandbox 执行性能
export async function executeSandbox(files, command) {
  const start = Date.now();
  const tx = Sentry.startTransaction({ op: 'sandbox.execute', name: 'E2B execute' });
  
  try {
    const result = await sandboxProvider.execute(sandbox, command, 30000);
    const duration = Date.now() - start;
    
    // 性能指标
    tx.setMeasurement('duration_ms', duration, 'millisecond');
    tx.setMeasurement('stdout_size', result.stdout.length, 'byte');
    
    // P95 超过阈值告警
    if (duration > 15000) {
      logger.warn('Sandbox execution exceeded 15s', { duration, command });
    }
    
    return result;
  } finally {
    tx.finish();
  }
}
```

#### 2. Alerting 规则（Sentry）

建议的告警规则（在 Sentry 配置）：
- P1：LLM API 失败率 > 5% in 5min → Slack webhook
- P1：Sandbox 创建失败率 > 10% in 10min → Slack webhook
- P0：整体 error rate > 1% in 1min → PagerDuty / Phone
- P0：Session 创建失败率 > 20% in 5min → Phone

#### 3. 业务监控（自定义）

V5.1 实现 Admin dashboard 看：
- 每日活跃 session 数
- 平均完成时长
- 各 grade 分布
- 各套件使用率
- LLM 调用次数和成本

V5.0 不做 dashboard，先用 SQL query + Metabase（如果客户多起来再做专用 UI）。

#### 4. 日志分级

```typescript
// Pino logger 的配置
{
  level: process.env.LOG_LEVEL || 'info',
  // development: debug
  // production: info
  
  transport: {
    // 开发：pretty
    // 生产：JSON 到文件 + Sentry transport
  },
}
```

**V5.0 监控清单**：

| 监控项 | 工具 | 状态 |
|---|---|---|
| JS 错误 | Sentry | V4 复用 |
| API 性能 | Sentry | V4 复用，V5 加新指标 |
| LLM 调用 | Langfuse | V4 复用 |
| 业务日志 | Pino + 文件 | V4 复用 |
| Sandbox 健康 | 自定义埋点 | **V5.0 Task 20 做** |
| Health check | /health endpoint | V4 复用 |
| 告警 | Sentry integration | **需要配置 Slack webhook** |
| Dashboard | 无 | V5.1 做 |

**需要你做的**：
- 注册 Slack workspace（如果没有）
- 配置 Sentry → Slack webhook
- 设置告警阈值

---

## P2 第 28-30 题：产品生态

### 28. CodeLens 付费模型

**不确定。需要你决定。**

我知道的：
- 目标客户是企业 HR + 技术团队
- 目标场景是招聘评估（替代传统技术面试或筛选）
- 你之前没在对话里明确定价

**三视角讨论**：

**Karpathy**：
"技术产品的定价应该反映'替代什么'。CodeLens 替代的是'30 分钟技术面试官时间 + 候选人 1 小时'。一场面试的成本约 200-500 美元（面试官时间 + 招聘漏斗成本）。CodeLens 一场评估定价 50-100 美元可以有明显 ROI 优势，也有利润空间。"

**Gemini**：
"B 端客户常见的模型：
1. 按评估次数（per-assessment）：简单，客户预算可控。但高频客户成本高，低频客户不续费。
2. 订阅制 seat-based：按技术 HR 账号数付费。客户预算可控。
3. 订阅制 volume-based：每月 N 次评估，超出部分单独计费。

对 CodeLens 这种"结果驱动"的产品，per-assessment + 订阅混合可能最好：
- 基础订阅（5000 元/月）包含 20 次评估
- 超出部分 200 元/次
- 大客户季度续费享折扣"

**Claude Code 工程**：
"V5.0 的定价不影响技术实现，Backend 有 orgId 字段（V5.2 启用多租户时用），计费系统 V5.0 不做。先按'试用定价'跑 3-6 个月，收集客户付费意愿数据再决定。"

**我的建议**：

**V5.0（发布后 3 个月）免费试用**：
- 没有效度数据，不能收钱
- 每个客户 20 次免费评估
- 目标：收集真实候选人数据 + 效度证据

**V5.0 + 3 个月开始收费**：
- 定价：300 元/次评估 或 5000 元/月 20 次（含）
- 早期客户打折：50% off 前半年（买客户故事）
- 销售目标：10 个付费客户/月

**V5.1 定价稳定**：
- 基础订阅 8000 元/月（30 次评估）
- 超出 300 元/次
- 季度包年享 20% 折扣

**竞品参考**：
- HackerRank：$59/assessment (约 420 元)
- Codility：$199-$499/month 订阅
- 国内牛客网：5000-20000 元/年 企业版

CodeLens 定位在国内市场，定价略低于国外，接近牛客但差异化在"AI 协作评估"。

**需要你做的**：
- 确认定价策略（免费试用期多长 / 正式定价多少）
- 定价影响销售话术 + 客户合同

### 29. 客户试用会议目标客户

**不确定。问你。**

我知道的（从对话）：
- 你提过"下周有客户试用会议"（之前某次对话）
- 会议目标："secure 3 real candidates free trial commitment, no pricing discussion"
- 客户方：HR + 技术负责人（CTO 作为 backup）
- 给的材料：PPT / Admin 报告展示 / 可能让技术人跑一次 Module A Round 1

**我不知道的**：
- 客户公司名 + 行业 + 规模
- 决策链（HR 是 decision maker 还是 CTO？）
- 客户当前的招聘工具（有没有 HackerRank 或其他替代品）
- 为什么联系到你（朋友推荐 / 冷启动 / 销售团队）

**如果你愿意告诉我这些，我能给**：
- 针对该客户的演示重点建议
- 可能的异议处理（如"我们已经用 HackerRank"）
- 试用期建议的 milestone（3 次评估后看什么数据）

**如果不告诉我也没关系**，这是商业信息，不是技术决策。

### 30. MockPro DAU/MAU/付费转化率

**不确定。问你。**

我知道的：
- MockPro 是 C 端面试陪练产品
- 语音对话（Volcano RTC + Emma AI interviewer）
- 针对中国求职者
- 付费模式是 individual-paid（C 端）

**我不知道的**：
- 当前用户规模
- 付费转化率
- 留存率
- 收入情况

**为什么问题 30 对 V5 重要**：

你的三产品飞轮是：MockPro (C 端候选人池) → CodeLens (B 端企业评估) → HireFlow (B 端 AI 面试)。飞轮的核心逻辑是"C 端候选人的数据成为 B 端的价值"。

**Karpathy 可能会问**：
"MockPro 如果没有 DAU，飞轮就没启动。CodeLens 投入 12 周开发，但没有 C 端用户池做差异化，CodeLens 只是另一个 HackerRank 竞品。"

**Gemini 可能会问**：
"MockPro 付费转化率决定公司现金流。如果 MockPro 月收入 < 10 万，CodeLens 的开发投入（12 周你自己的时间）ROI 要看 CodeLens 自己能不能快速变现。"

**Claude Code 工程角度**：
"这和 V5 代码实现无关。但资源分配决定优先级：如果 MockPro DAU 低，应该修复 MockPro（已经有用户在用的产品）而不是再建一个新产品。"

**如果你愿意分享**：
- 当前 DAU 如果 < 100：建议评估 MockPro 是否需要先修复
- 如果 DAU 100-1000：继续 CodeLens 但同时投入 MockPro 运营
- 如果 DAU 1000+：CodeLens 飞轮假设成立，V5 是正确投入

这不影响技术决策，但影响战略决策。你决定是否分享。

---

## 总结

P0 (1-11)、P1 (12-21)、P2 (22-30)：✓ 全部答完

**三个不确定的需要你决策**（问题 25、28、29、30）：

1. **服务器 Postgres 配置**（问题 25）：SSH 上去查一下告诉我
2. **付费模型**（问题 28）：免费试用 3 个月 + 300 元/次 / 5000 元月包 可以吗
3. **客户试用会议细节**（问题 29）：你决定是否分享
4. **MockPro 数据**（问题 30）：你决定是否分享

**后续建议**：
- 让 Backend 或 Frontend 把这 30 题的答案归档到 `docs/v5-planning/v5-design-reference.md`
- 未来任何 agent 遇到设计疑问先查这个文档
- 如果查不到再问我

你现在可以：
- 把 P0 答案先发给 Backend（Task 2 schema 需要 analytics 字段修正 + moduleSpecific 结构）
- P1 / P2 答案归档备用
- Backend / Frontend 继续原 Task，遇到具体问题再回来查