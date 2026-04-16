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


文档 2：CodeLens V5 Frontend Agent 任务文档
markdown# CodeLens V5 前端开发任务文档

## 项目背景

你是 CodeLens V5 的前端 Agent，负责所有客户端代码、UI 组件、Cursor 模式交互、Admin 界面、候选人流程。

**前置状态**：
- V5 仓库已初始化：/Users/stevezhu/Projects/CodeLens-v5
- GitHub: https://github.com/fantasieleven-code/CodeLens-V5.git
- V4 基础设施已复制（A 类 5200+ 行）
- V4 前端已补充复制 5 个文件（你处理）：
  - packages/client/src/pages/ModuleCPage.tsx（TODO V5 标记）
  - packages/client/src/pages/SelfAssessPage.tsx（TODO V5 标记）
  - packages/client/src/pages/CompletePage.tsx（TODO V5 标记）
  - packages/client/src/components/forms/StructuredReasoningForm.tsx（TODO V5 标记）
  - packages/client/src/components/TopBar.tsx（TODO V5 标记）
- 3 个 B 类前端文件带 TODO 标记：
  - packages/client/src/hooks/useSocket.ts（你处理）
  - packages/client/src/hooks/useBehaviorTracker.ts（你处理）
  - packages/client/src/components/editors/RulesEditor.tsx（你处理）

**协作约定**：
- 你的分支：feat/frontend
- Backend 的分支：feat/backend
- 共享内容通过 main 分支同步（等 Backend 定义好 shared types 你再 pull）
- 每完成一个大 Task push feat/frontend，每完成一个 Phase merge 到 main

**依赖 Backend**：
- Task 1 前：Backend 完成基建 1-4（你才能 import shared types）
- Task 6 前：Backend 完成 Task 11（MC 后端）你才能联调 MC
- Task 7 前：Backend 完成 Task 12（MB 后端 Cursor endpoints）你才能联调 MB
- Task 10 前：Backend 完成 Task 15（Admin 后端 API）你才能联调 Admin

---

## 核心 UX 设计（必须遵守）

### V5 候选人流程
EvaluationIntroPage（说明页）
↓
Phase0Page（3 层 codeReading + 2 题 AI 判断 + 1 题 decision）
↓
ModuleAPage（R1 对抗 + R2 代码审查 + R3 对比诊断）
↓
ModuleBPage（Cursor 模式 4 阶段）或跳过
↓
ModuleDPage（designTask）或跳过
↓
SelfAssessPage（决策摘要 + 自评）
↓
ModuleCPage（MC 语音深度答辩）或跳过
↓
CompletePage（评估完成）

进度条在每个模块顶部显示。

### V5 MB Cursor 模式界面
┌────────────────────────────────────────────────┐
│ 任务描述栏（折叠，完整特性验收条件）              │
├────────┬────────────────────────┬─────────────┤
│文件树  │ Monaco 多文件编辑器     │ AI Chat 侧栏│
│        │ (inline completion)    │ @引用选择器 │
│        │                        │ diff预览    │
├────────┴────────────────────────┴─────────────┤
│ 终端面板（xterm.js / pytest 输出）             │
└────────────────────────────────────────────────┘

### V5 Admin 创建流程
3 步向导：
Step 1 岗位类型（6 选 1）
Step 2 候选人级别（3 选 1：junior/mid/senior）
Step 3 推荐套件 + 匹配 level 的题库

### V5 报告双层结构
- Layer 1：一页纸摘要（HR 看）
- Layer 2：详情展开（技术负责人看）

---

## Phase 0：前端基础（10 天）

**等待 Backend Task 1-4 完成（约 1 周）**

你在等待期间可以做的工作：
- 处理 3 个 B 类文件的 TODO 标记（不依赖 shared types）
- 研究 V4 前端代码（特别是 ModuleCPage）

### Task 1: B 类 TODO 处理（1-2 天）

#### 1.1 useSocket.ts TODO 处理

查看 packages/client/src/hooks/useSocket.ts 顶部的 TODO V5 注释。

**改造**：
- Socket 事件前缀 v4:* → v5:*
- 事件类型从 V4 改为 V5（从 @codelens-v5/shared import）
- Cursor 模式新增事件：
  - v5:mb:chat_generate / v5:mb:chat_stream / v5:mb:chat_complete
  - v5:mb:completion_request / v5:mb:completion_response
  - v5:mb:file_change
  - v5:mb:run_test / v5:mb:test_result
- 连接管理 + 重连逻辑保留

#### 1.2 useBehaviorTracker.ts TODO 处理

查看 packages/client/src/hooks/useBehaviorTracker.ts 顶部的 TODO V5 注释。

**改造**：
- V4BehaviorModule enum → V5 模块名（phase0/moduleA/mb/moduleD/selfAssess/modulec）
- 新增 Cursor 模式事件类型：
  - ai_completion_shown / ai_completion_accepted / ai_completion_rejected
  - chat_prompt_sent / chat_response_received
  - diff_accepted / diff_rejected
  - file_opened / file_switched / file_closed
  - cursor_move / key_press（只计数，不记录内容）
  - test_run
- PAYLOAD_LIMIT 保留
- flush 机制保留

#### 1.3 RulesEditor.tsx TODO 处理

查看 packages/client/src/components/editors/RulesEditor.tsx 顶部的 TODO V5 注释。

**改造**：
- 内部类型从 "Harness" 改名为 "Rules"
- 验证 import 路径（tokens 等）
- 保持 props-driven 不变

**验收**：
- 3 个文件编译通过（需要 Backend Task 1 shared types merge 后）
- 事件类型符合 V5

**PR**: chore(frontend): resolve B-tier TODO markers

---

### Task 2: 基础组件和报告 Section Registry（5 天）

等待 Backend Task 1-4 完成后开始。

#### 2.1 报告 Section 注册表

创建 packages/client/src/components/report/report-sections.tsx：

```typescript
interface ReportSection {
  id: string;
  moduleSource: string;  // '*' 或具体模块名
  component: React.FC<any>;
  priority: number;
  layer: 'summary' | 'detail';
}

const REPORT_SECTIONS: ReportSection[] = [
  // Layer 1 (summary)
  { id: 'hero', moduleSource: '*', component: ReportHero, priority: 0, layer: 'summary' },
  { id: 'radar', moduleSource: '*', component: RadarChart, priority: 10, layer: 'summary' },
  { id: 'recommendation', moduleSource: '*', component: RecommendationBadge, priority: 20, layer: 'summary' },
  
  // Layer 2 (detail)
  { id: 'tech-profile', moduleSource: 'phase0', component: TechProfileCard, priority: 5, layer: 'detail' },
  { id: 'ma-detail', moduleSource: 'moduleA', component: MADetailPanel, priority: 20, layer: 'detail' },
  { id: 'mb-detail', moduleSource: 'mb', component: MBDetailPanel, priority: 30, layer: 'detail' },
  { id: 'mb-cursor-behavior', moduleSource: 'mb', component: MBCursorBehaviorPanel, priority: 31, layer: 'detail' },
  { id: 'md-hero', moduleSource: 'moduleD', component: MDHeroSection, priority: 40, layer: 'detail' },
  { id: 'mc-transcript', moduleSource: 'modulec', component: MCTranscriptPanel, priority: 50, layer: 'detail' },
  { id: 'dimensions', moduleSource: '*', component: DimensionCards, priority: 60, layer: 'detail' },
  { id: 'signal-bars', moduleSource: '*', component: SignalBars, priority: 70, layer: 'detail' },
  { id: 'compliance', moduleSource: '*', component: ComplianceSection, priority: 100, layer: 'detail' },
];
```

#### 2.2 ReportRenderer

创建 packages/client/src/components/report/ReportRenderer.tsx：

```typescript
function ReportRenderer({ sessionId, suiteId }: Props) {
  const [layer, setLayer] = useState<'summary' | 'detail'>('summary');
  const { data: reportData } = useReportData(sessionId, layer);
  
  const suite = SUITES[suiteId];
  const sections = REPORT_SECTIONS
    .filter(s => s.layer === layer)
    .filter(s => s.moduleSource === '*' || suite.modules.includes(s.moduleSource))
    .filter(s => suite.reportSections.includes(s.id))
    .sort((a, b) => a.priority - b.priority);
  
  return (
    <div>
      {sections.map(s => <s.component key={s.id} data={reportData} />)}
      {layer === 'summary' && (
        <Button onClick={() => setLayer('detail')}>查看完整报告</Button>
      )}
    </div>
  );
}
```

#### 2.3 核心报告组件

实现 REPORT_SECTIONS 里引用的所有组件：

- ReportHero.tsx（grade + composite + 基本信息）
- RadarChart.tsx（复用 A 类 charts/RadarChart.tsx）
- RecommendationBadge.tsx（推荐/有条件推荐/不推荐）
- TechProfileCard.tsx（P0 技术画像）
- MADetailPanel.tsx（MA 三轮详情）
- MBDetailPanel.tsx（MB 4 阶段详情）
- MBCursorBehaviorPanel.tsx（Cursor 行为可视化：5 个信号的条形图）
- MDHeroSection.tsx（MD 设计拆分展示）
- MCTranscriptPanel.tsx（MC 对话转写）
- DimensionCards.tsx（6 维度卡片，未参与维度不渲染）
- SignalBars.tsx（所有信号条形图）
- ComplianceSection.tsx（合规声明）

#### 2.4 双层切换和 PDF 导出

- 默认 Layer 1
- 点击"查看完整报告"切到 Layer 2
- Layer 2 有"收起"返回 Layer 1
- PDF 导出两层都能导出（html2canvas + jsPDF，utils/pdfExport.ts 已复制）

#### 2.5 gradeCap 提示文案

quick_screen 的报告显示：
"本次评估使用快速筛选套件，评级上限为 A。如需 S/S+ 评级请使用全面评估套件。"

其他套件不显示。

**验收**：
- 5 个套件的报告各自正确展示 section
- Layer 1/Layer 2 切换
- PDF 导出两层

**PR**: feat(report): section registry + 2-layer structure

---

### Task 3: 候选人流程基础（3 天）

#### 3.1 EvaluationIntroPage

创建 packages/client/src/pages/EvaluationIntroPage.tsx：

候选人点评估链接后看到的第一页：
欢迎参加 [公司名] 技术评估
本次评估：

套件：[suite.nameZh]
预计时长：[suite.estimatedMinutes] 分钟
包含 [suite.modules.length] 个模块：
[模块列表 from moduleOrder]

评估将围绕一个真实业务系统展开。
你在每个模块看到的内容都是同一个系统的不同切面。
本次评估支持 AI 协作——
你可以使用任何你熟悉的方式与 AI 共同完成任务。
[开始评估]

从 SUITES[suiteId] 和 session.metadata 动态生成。

#### 3.2 ProgressIndicator 组件

创建 packages/client/src/components/ProgressIndicator.tsx：

每个模块页面顶部显示：
[✓ P0] [✓ MA] [→ MB] [ MD] [ SE] [ MC]
已完成 2/6 模块，剩余约 45 分钟

从 moduleOrder + 当前模块索引 + 各模块 estimatedMinutes 生成。

deep_dive 套件（85 分钟）必须显示，其他套件可选。

#### 3.3 TopBar 改造

处理 packages/client/src/components/TopBar.tsx 的 TODO：
- Rename TopBarV4 → TopBar
- 删除 V4 专用 props
- 更新文案

#### 3.4 App.tsx 路由

创建 packages/client/src/App.tsx：
```typescript
<Routes>
  <Route path="/exam/:sessionId" element={<ExamRouter />} />
  <Route path="/admin/*" element={<AdminRoutes />} />
  <Route path="/share/report/:token" element={<SharedReportPage />} />
</Routes>

// ExamRouter 根据 session.metadata.moduleOrder 决定当前页面
function ExamRouter() {
  const { currentModule } = useModuleStore();
  switch (currentModule) {
    case 'intro': return <EvaluationIntroPage />;
    case 'phase0': return <Phase0Page />;
    case 'moduleA': return <ModuleAPage />;
    case 'mb': return <ModuleBPage />;
    case 'moduleD': return <ModuleDPage />;
    case 'selfAssess': return <SelfAssessPage />;
    case 'modulec': return <ModuleCPage />;
    case 'complete': return <CompletePage />;
  }
}
```

创建 packages/client/src/stores/module.store.ts（无版本后缀）：
- 从 session.metadata.moduleOrder 初始化
- advance() / currentModule / isComplete

**验收**：
- 候选人流程从 intro → 各模块 → complete 正确切换
- 进度条实时更新
- 路由能处理套件差异

**PR**: feat(candidate): intro page + progress + routing

---

## Phase 1：模块前端（20 天）

### Task 4: P0 前端（7 天）

创建 packages/client/src/pages/Phase0Page.tsx。

**布局**：
┌──────────────────────────────────────────┐
│ 任务描述：阅读以下代码并回答问题          │
├──────────────────────────────────────────┤
│ SystemCode 展示（300-500 行，语法高亮）   │
│ (使用 monaco-editor 只读模式)            │
├──────────────────────────────────────────┤
│ L1: 这段代码做什么？（单选）              │
│   [A] ... [B] ... [C] ... [D] ...        │
├──────────────────────────────────────────┤
│ L2: 这段代码有什么问题/优化空间？          │
│   [textarea, 100-300 字]                 │
├──────────────────────────────────────────┤
│ L3: 如果要扩展到分布式，需要改什么？       │
│   [textarea, 200-500 字]                 │
├──────────────────────────────────────────┤
│ AI 输出判断 (1/2)                        │
│ ┌──────────────┬──────────────┐         │
│ │ 代码 A        │ 代码 B        │         │
│ └──────────────┴──────────────┘         │
│ 你的选择: [A] [B] [都好] [都有问题]      │
│ 理由: [textarea]                         │
├──────────────────────────────────────────┤
│ AI 输出判断 (2/2)                        │
│ [同样结构]                                │
├──────────────────────────────────────────┤
│ 决策场景：[场景描述]                      │
│ 你的选择: [选项 A/B/C]                    │
│ 理由: [textarea]                         │
├──────────────────────────────────────────┤
│ [提交]                                   │
└──────────────────────────────────────────┘

**data-testid**（Golden Path 测试用）：
- phase0-code-display
- phase0-l1-question / phase0-l1-answer
- phase0-l2-answer
- phase0-l3-answer
- phase0-ai-judgment-1-code-a / phase0-ai-judgment-1-code-b
- phase0-ai-judgment-1-choice / phase0-ai-judgment-1-reason
- phase0-ai-judgment-2-code-a / ...
- phase0-decision-choice / phase0-decision-reason
- phase0-submit

**交互**：
- L1 必答才能看到 L2
- L2 必答才能看到 L3
- 所有字段必填才能提交
- 提交 → emit v5:phase0:submit（payload 符合 V5Phase0Submission）
- Backend 响应 → advance() 到 moduleA

**AI 输出判断的双版代码**：
Backend 从 ExamModule (P0) 的 aiOutputJudgment 字段读取。
每题展示 2 段代码（correctCode + buggyCode）缩略到 30-50 行。
候选人选 A/B/两个都好/两个都有问题 + 填理由。

**验收**：
- 3 层 UI 依次展开
- 2 题 AI 判断交互正常
- 提交后 submission 符合 V5Phase0Submission

**PR**: feat(p0): 3-layer reading + AI output judgment UI

---

### Task 5: MA 前端（8 天）

创建 packages/client/src/pages/ModuleAPage.tsx。

#### 5.1 Round 1 对抗环节
┌────────────────────────────────────────────┐
│ 方案选择                                    │
│ [方案 A 卡片] [方案 B 卡片] [方案 C 卡片]  │
│   pros/cons/performance/cost                │
│ 你选择：[单选]                              │
│ 理由：[textarea]                            │
│ 结构化输入：                                │
│   Scenario: [StructuredReasoningForm]      │
│   Tradeoff: [...]                          │
│   Decision: [...]                          │
│   Verification: [...]                      │
│ [提交]                                     │
├────────────────────────────────────────────┤
│ ⚠️ 系统挑战                                 │
│ "你的论据的薄弱点是：                        │
│  - 你说 B 方案成本低，但没说明计算假设      │
│  - 你没考虑 C 方案的可扩展性优势"           │
│                                            │
│ 你的回应：[textarea]                       │
│ [提交回应]                                 │
└────────────────────────────────────────────┘

**StructuredReasoningForm** 组件已从 V4 复制（B.8），处理它的 TODO 后复用。

**data-testid**：
- ma-r1-scheme-a / ma-r1-scheme-b / ma-r1-scheme-c
- ma-r1-reasoning
- ma-r1-structured-scenario / ma-r1-structured-tradeoff / ma-r1-structured-decision / ma-r1-structured-verification
- ma-r1-challenge-text
- ma-r1-challenge-response
- ma-r1-submit

#### 5.2 Round 2 代码审查模式
┌────────────────────────────────────────────┐
│ 代码审查                                    │
│ ┌─────────────────────────────────────┐   │
│ │ [代码显示，行号 + 可点击标注]         │   │
│ │ Line 1: def process(data):          │   │
│ │ Line 2:     return data              │   │
│ │ Line 3: [+ 添加评论]                 │   │
│ └─────────────────────────────────────┘   │
│                                            │
│ 当前评论：                                  │
│   Line 15: [bug] SQL 注入漏洞              │
│     修复建议：用参数化查询                  │
│     [删除]                                 │
│   Line 32: [suggestion] 缺少单元测试        │
│                                            │
│ [提交审查]                                 │
└────────────────────────────────────────────┘

创建 packages/client/src/components/ma/CodeReviewMarker.tsx（替代 V4 DefectMarker）。

点击行号 → 弹出评论框：
- commentType: bug / suggestion / question / nit
- comment: textarea
- fixSuggestion: textarea（可选）

候选人至少标注 1 处才能提交。

**V4 fallback 处理**：
如果候选人所有 commentType 都是 'bug'，后端降级为 V4 sDefectDetection（保证不退步）。

**data-testid**：
- ma-r2-code-display
- ma-r2-review-line-{lineNum}
- ma-r2-review-type / ma-r2-review-comment / ma-r2-review-fix
- ma-r2-submit

#### 5.3 Round 3 对比诊断
┌────────────────────────────────────────────┐
│ 以下是两个版本的代码：                      │
│ ┌──────────────┬──────────────┐            │
│ │ 版本 A        │ 版本 B        │            │
│ │ [代码]        │ [代码]        │            │
│ └──────────────┴──────────────┘            │
│                                            │
│ 1. 哪个是正确版本？                         │
│    [A] [B]                                 │
│                                            │
│ 2. 两版代码的关键差异：                      │
│    [textarea]                              │
│                                            │
│ 3. 问题的根因：                             │
│    [textarea]                              │
│                                            │
│ [提交]                                     │
└────────────────────────────────────────────┘

双版代码从 ExamModule (MA) 的 failureScenario.successCode 和 failedCode 读取。

**data-testid**：
- ma-r3-code-success / ma-r3-code-failed
- ma-r3-correct-choice
- ma-r3-diff-analysis / ma-r3-diagnosis
- ma-r3-submit

**新建组件**：
- components/ma/SchemeCompare.tsx
- components/ma/ChallengePanel.tsx
- components/ma/CodeReviewMarker.tsx
- components/ma/DiffComparePanel.tsx

**验收**：
- R1 对抗环节：候选人必须回应挑战才能提交
- R2 代码审查：至少 1 处才能提交
- R3 对比诊断：必须选正确版本 + 填 diff 分析

**PR**: feat(ma): R1 challenge + R2 code review + R3 compare diagnosis

---

### Task 6: MC 前端改造（2 天）

packages/client/src/pages/ModuleCPage.tsx 已从 V4 复制（1401 行，90% 可复用）。

**处理 TODO V5 注释**：

1. Socket 事件前缀替换（grep -n "v4:" 约 15 处）：
   - v4:modulec:start → v5:modulec:start
   - v4:modulec:answer → v5:modulec:answer
   - v4:modulec:complete → v5:modulec:complete

2. Submission 类型替换：
   - V4ModuleCAnswerPayload → V5ModuleCAnswer
   - import from @codelens-v5/shared

3. Store 引用：
   - useV4ModuleStore → useModuleStore

**保留不动**：
- Volcano RTC 集成（整个 SDK setup）
- Emma 语音对话逻辑
- ASR 实时转写展示
- 状态机（connecting/speaking/listening/transition/completed）
- 错误处理和重连
- 文字 fallback 模式
- 轮次展示

**联调 Backend Task 11**：
- Backend getSessionContext 现在读 V5 submissions（含 MD 锚点）
- 你的前端应该看到 Emma 能追问 MA + MB + MD 的内容

**验收**：
- RTC 连接成功
- Emma 追问基于前序 submission
- sReflectionDepth 在 MD 参与时方差更大（Backend 验收）

**PR**: feat(mc): V5 frontend adaptation

---

### Task 7: MB Cursor 模式前端（12 天）

等待 Backend Task 5（SandboxProvider）+ Task 12（MB endpoints）完成。

#### 7.1 MultiFileEditor（2 天）

创建 packages/client/src/components/editors/MultiFileEditor.tsx：

薄包装 @monaco-editor/react：
- props-driven
- 多文件 tab 切换
- 每个文件一个 monaco.editor.ITextModel
- 按扩展名语法高亮

```typescript
interface MultiFileEditorProps {
  files: Array<{ path: string; content: string; language: string }>;
  activeFilePath: string;
  readOnly?: boolean;
  onFileChange: (path: string, content: string) => void;
  onFileSelect: (path: string) => void;
  onCursorChange?: (path: string, line: number, column: number) => void;
  pendingDiff?: { path: string; oldContent: string; newContent: string };
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
  inlineCompletion?: { line: number; column: number; text: string };
  onAcceptCompletion?: () => void;
  onRejectCompletion?: () => void;
}
```

子组件：
- packages/client/src/components/editors/FileTree.tsx
- packages/client/src/components/editors/EditorTabs.tsx（新建，不复用 V3 的同名组件）
- packages/client/src/components/editors/DiffOverlay.tsx

**验收**：能渲染 scaffold 的多个文件，tab 切换流畅。

#### 7.2 AIChatPanel（2 天）

创建 packages/client/src/components/chat/AIChatPanel.tsx：

布局：
- 顶部：Chat 历史（候选人 prompt + AI 回复）
- 底部：Prompt 输入框 + 发送按钮 + "@" 引用选择器

**@ 引用选择器**（解决 Monaco 粘贴乱码问题）：
- 候选人输入 "@" 触发
- 弹出列表：@files / @functions / @tests
- 选择后自动插入 "```{path}:{line}-{line}\n{content}\n```" 到 prompt

**Diff 应用流程**：
1. 候选人发 prompt → emit v5:mb:chat_generate
2. Backend 返回 diff → 在编辑器显示 diff 预览（DiffOverlay）
3. 候选人 Accept → 应用到 MultiFileEditor → 触发 onFileChange → emit v5:mb:file_change
4. 候选人 Reject → 丢弃 diff

**验收**：Chat 对话正常，@ 引用插入代码块，diff 接受/拒绝生效。

#### 7.3 InlineCompletionProvider（2 天）

创建 packages/client/src/components/editors/InlineCompletionProvider.tsx：

使用 Monaco 的 `registerInlineCompletionsProvider`：
- 候选人停输入 500ms 后触发
- 发送 v5:mb:completion_request
- Backend 返回 completion 文本
- 显示灰色提示文本
- Tab 接受，继续打字拒绝

```typescript
monaco.languages.registerInlineCompletionsProvider(language, {
  provideInlineCompletions: async (model, position, context, token) => {
    if (token.isCancellationRequested) return { items: [] };
    
    const response = await socketEmitAsync('v5:mb:completion_request', {
      filePath: currentFilePath,
      content: model.getValue(),
      line: position.lineNumber,
      column: position.column,
    });
    
    // Behavior event
    trackEvent('ai_completion_shown', { filePath, line });
    
    return { items: [{ insertText: response.completion }] };
  }
});
```

Debounce 500ms。取消机制：新 request 发出时取消旧（AbortController）。

**行为数据采集**：
- ai_completion_shown：compute 返回时
- ai_completion_accepted：按 Tab 时
- ai_completion_rejected：继续打字时

**验收**：输入停 500ms 显示灰色，Tab 接受，继续打字拒绝，行为事件正确 emit。

#### 7.4 MB1PlanningPanel（1 天）

创建 packages/client/src/components/mb/MB1PlanningPanel.tsx：

Stage 1 布局：
- 展示 featureRequirement（5 个验收条件）
- 3 个 textarea：
  - 分步计划（步骤 + 依赖）
  - 接口设计（函数签名 + 职责）
  - 降级方案
- 可跳过按钮（跳过本身是信号）

**data-testid**：
- mb-planning-decomposition / mb-planning-dependencies / mb-planning-fallback
- mb-planning-submit / mb-planning-skip

#### 7.5 ViolationAuditPanel（1 天）

创建 packages/client/src/components/mb/ViolationAuditPanel.tsx：

Stage 4 布局：
- 展示 3 个 AI 执行结果卡片（从 ExamModule (MB).violationExamples 读）
- 每个卡片：
  - AI 生成的代码
  - 标注：合规 / 违规
  - 如果违规，从候选人 RULES.md 里选择违反了哪条

**data-testid**：
- mb-violation-card-{i}
- mb-violation-toggle-{i}
- mb-violation-rule-select-{i}
- mb-audit-submit

#### 7.6 ModuleBPage 4 阶段集成（5 天）

创建 packages/client/src/pages/ModuleBPage.tsx：

状态机（4 阶段串行）：
planning → execution → standards → audit → complete

Stage 2 execution 内部子状态机：
idle → chat_generating → diff_pending → diff_applied → idle
idle → inline_typing → inline_fetching → inline_showing → inline_accepting → idle
idle → running_test → test_completed → idle

布局：
- Stage 1: MB1PlanningPanel（可跳过）
- Stage 2: Cursor 模式（MultiFileEditor + AIChatPanel + InlineCompletionProvider + 终端面板）
- Stage 3: RulesEditor（B.1 已迁移，处理 TODO 后复用）+ 可选 AGENT.md
- Stage 4: ViolationAuditPanel

**终端面板**：使用 xterm.js（如果 V4 有相关 dep）或只读 pre + pytest 输出展示。

useBehaviorTracker 扩展（Task 1 已做）。

**联调**：
- Backend Task 12 的 endpoints 必须完成
- Cursor 行为数据通过 useBehaviorTracker 采集并发送

**验收**：
- 4 阶段完整流程
- Cursor 模式候选人能完成特性开发
- 行为数据完整采集
- 终端显示 pytest 输出

**PR**: feat(mb): complete 4-stage with Cursor mode

---

### Task 8: MD 前端（2 天）

创建 packages/client/src/pages/ModuleDPage.tsx：

布局：
- designTask 展示（从 ExamModule (MD).designTask 读）
- subModules 输入（动态添加/删除模块卡片）
- interfaceDefinitions 输入
- dataFlowDescription textarea
- constraintsSelected 多选（从 designChallenges 的 constraintCategories 生成）
- tradeoffText textarea
- aiOrchestrationPrompts 输入

**data-testid**：
- md-design-task-display
- md-submodule-{i}-name / md-submodule-{i}-responsibility / md-submodule-{i}-interfaces
- md-add-submodule
- md-interface-definitions
- md-data-flow
- md-constraints-selected
- md-tradeoff-text
- md-ai-orchestration-{i}
- md-submit

**验收**：能提交 V5ModuleDSubmission，联调 Backend Task 14。

**PR**: feat(md): frontend page

---

### Task 9: SelfAssess + Complete 改造（1 天）

#### 9.1 SelfAssessPage TODO 处理

处理 packages/client/src/pages/SelfAssessPage.tsx 的 TODO。

**新增：决策摘要展示**（V5 新功能）：

创建 packages/client/src/components/selfassess/DecisionSummary.tsx：
- 从 session.metadata.submissions 提取：
  - MA round1.schemeId + reasoning 前 100 字
  - MB planning.decomposition 第一行
  - MD subModules.length + constraintsSelected.length
- 以 readonly 卡片展示：
你的 MA 方案：B（Redis 缓存主动刷新）
你的 MB 编排：3 步分解...
你的 MD 设计：5 个模块，选了 6 类约束
- 放在 confidence slider 之前

#### 9.2 CompletePage TODO 处理

处理 packages/client/src/pages/CompletePage.tsx 的 TODO。

大部分保持不变，只改 import 路径和 V4→V5 字段。

**验收**：
- 候选人能看到前序决策摘要再做自评
- 完成页正常展示

**PR**: feat(selfassess-complete): V5 adaptation

---

## Phase 2：Admin 和集成（7 天）

### Task 10: Admin 创建流程（3 天）

等待 Backend Task 15（Admin 后端 API）完成。

创建 packages/client/src/pages/admin/CreateSessionPage.tsx：

**3 步向导**：

Step 1 - 岗位类型：
[后端/全栈] [前端] [运维/SRE] [AI 工程师] [架构师/CTO] [校招/实习]

Step 2 - 候选人级别（Step 1 选完后显示）：
[初级 (0-2年)] [中级 (2-5年)] [高级 (5-8年)]

Step 3 - 系统推荐套件：
映射表（2 层 if-else）：
后端/全栈 mid → full_stack + mid 题库
后端/全栈 senior → architect + senior 题库
前端 mid/senior → full_stack / architect
运维/SRE 任何级别 → architect
AI 工程师 任何级别 → ai_engineer
架构师/CTO → deep_dive
校招/实习 → quick_screen + junior 题库
显示推荐理由 + 套件详情 + 预计时长 + gradeCap
[确认使用] [手动选择]

**SuiteSelector 组件**（手动选择用）：
- 展示 5 个套件卡片
- 每个卡片：名称 + 预计时长 + gradeCap + 适用岗位

**匹配 ExamInstance**：
- 后端根据 suiteId + level 返回匹配的 ExamInstance 列表
- Admin 选一个具体题目
- Backend 创建 Session

**验收**：
- 3 步向导流畅
- 推荐逻辑正确
- 能创建 5 个套件的 session

**PR**: feat(admin): 3-step recommendation wizard

---

### Task 11: Admin Session 管理（2 天）

从 V4 的 admin.ts 参考（C 类已删除但 legacy/v4 分支有），V5 从零建：

- packages/client/src/pages/admin/SessionsPage.tsx（列表 + 筛选）
- packages/client/src/pages/admin/SessionDetailPage.tsx（详情 + 报告 + rescore 按钮）

调用 Backend Task 15 提供的 API。

session 列表显示：
- 候选人名
- 套件
- 状态（进行中/已完成）
- 创建时间
- Grade（已完成）
- 操作（查看报告 / 重新评分 / 删除）

session 详情使用 Task 2 的 ReportRenderer 展示报告。

**PR**: feat(admin): session management

---

### Task 12: 集成测试和收尾（2 天）

- 修复所有 TypeScript 编译错误
- 整体 UX 流程测试（手动走一遍 5 个套件）
- 和 Backend 联调 Golden Path L1
- 修复发现的 UI bug

---

## 工作量总结

| Phase | Task | 天数 |
|---|---|---|
| Phase 0 等待 Backend | Task 1（B 类 TODO）| 1-2（等待期间做）|
| Phase 0 前端基础 | Task 2-3 | 8 |
| Phase 1 模块前端 | Task 4-9 | 32 |
| Phase 2 Admin 和集成 | Task 10-12 | 7 |
| **总计** | | **48 天 / 约 9.5 周** |

---

## 和 Backend 的同步点

每个关键交付点：

| 时间点 | Backend 完成 | 你能开始 |
|---|---|---|
| 第 2 周末 | Task 1-4 | Task 2 报告 Section Registry |
| 第 3 周末 | Task 6 ModelProvider | 无直接依赖 |
| 第 4 周末 | Task 11 MC 后端 | Task 6 MC 前端改造 |
| 第 5 周末 | Task 12 MB endpoints | Task 7 MB Cursor 模式 |
| 第 6 周末 | Task 15 Admin API | Task 10 Admin 创建流程 |
| 第 7 周末 | Task 19 题库 | 端到端测试 |

你的关键路径：等待 Backend Task 1（shared types）+ Task 12（MB endpoints）。

---

## 故障备用任务（Backend 慢了你可以填的空窗期）

- UI 组件优化（Button/Modal/Table 等基础组件的设计细节）
- data-testid 完整性审查（确保 Golden Path 测试能找到所有元素）
- 移动端响应式测试（V5.0 桌面优先但基础响应式要支持）
- 无障碍性改进（ARIA labels）
- 候选人体验细节（loading 状态、错误提示文案）

这两份文档的关键特性
一次性纳入所有内容：

6 维度 / 40 信号 / 5 套件 / Cursor 模式 / 出题引擎
Module C 前后端完整方案
18 个预生成题库（按 level 分档）
Golden Path 全套件分层
模型一致性检查
效度验证计划
性能监控埋点

解决了之前识别的所有矛盾点：

2 agent 分工清晰（Backend 62 天 / Frontend 48 天）
每个 B 类 TODO 文件明确归属
Backend 优先交付 shared types 让 Frontend 不阻塞
Prompt Registry 激活但不阻塞 MC 前端（MC 可先用硬编码 prompt）
测试基础设施复用 + 新建分开说明
V5 不做兼容层（V4 完全删除）

三视角最终评分（V5.0 发布后）：

P0: 9.0 ✓ 实现
MA: 9.5 ✓ 实现（R1+R2+R3 完整改造）
MB: 9.5 ✓ 实现（4 阶段 + Cursor 模式）
MD: 8.5 ✓ 实现
SE: 5.0 ✓ 实现（决策摘要）
MC: 8.0 ✓ 实现（锚点追问 + MD 锚点）
综合 8.3

没有遗漏：

性能监控（Sentry + Langfuse）
Admin 后端 API（session 创建 + 报告 API）
OpenAPI 生成
效度验证决策树
Cursor 行为 fixture generator
V4 前端补充的 5 个文件 TODO 处理

把这两份文档分别发给 2 个 Claude Code 窗口。

窗口 1（Backend）：发文档 1，让它按 Task 1 → Task 21 顺序执行
窗口 2（Frontend）：发文档 2，让它先做等待期任务（Task 1），然后按依赖顺序做 Task 2-12