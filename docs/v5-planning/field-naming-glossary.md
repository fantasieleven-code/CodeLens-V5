# Field Naming Glossary (Pattern C 防御)

> 目的:V5 里有多组**同前缀字段名**(aiClaim* / reflection* / decision* / scoring* 等),Claude 写 brief 时经常混淆。本文件是 **canonical 字段名 + 归属 + import path + 消费方** 的 single source of truth。
>
> 使用方式:每次写 Task brief 引用某字段前,**grep 本文件**确认字段精确命名 + import path。若 brief 和本文件冲突,以本文件为准;若本文件和 shared 实际冲突,以 shared 为准(本文件滞后更新)。

## Pattern C 历史命中(Day 1-2)

1. **Task 13a**:brief `aiClaimDetection` vs shared `aiClaimVerification`(observation #011)
2. **Task 13a**:brief `aiClaimedFeatures` vs shared `claimedFeatures`(observation #013)
3. **Task 7.5**:brief `MBViolationExample.aiClaimedReason` vs shared `explanation`(observation #018)
4. **Task 7.5**:brief `V5MBAudit.submittedAt` 不存在
5. **Task 7.5**:brief `violatedRuleId` 位置错(应在 audit.violations[] 不在 example 上)

## Canonical Field Glossary

### AI Claim 系列(P0 + 其他)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5Phase0Submission.aiClaimVerification` | Shared P0 | `@codelens-v5/shared/types/v5-phase0` | Phase0Page (write) + sAiClaimDetection signal (read) | 候选人对 AI 代码主张的判断 |
| `ExamModule(P0).aiOutputJudgment` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Phase0 题目数据 | P0 的 2 题 AI 代码判断 |
| `ExamModule(P0).aiClaimedFeatures` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | scoring signal(算法不读,keep in interface with comment) | Deceptive AI 声明的特性 |
| `MBViolationExample.explanation` | Shared MB | `@codelens-v5/shared/types/v5-mb` | Stage 4 audit + sRuleEnforcement signal | AI 执行结果的"官方"解释(groundTruth 的一部分) |
| `MBViolationExample.aiClaimedReason` | ⚠️ **不存在** (brief 误用) | — | — | Frontend Task 7.5 Props 暴露给候选人的字段,需要 mapping 从 shared `explanation` |

**常见混淆**:
- `aiClaimedReason`(brief 常用)≠ `explanation`(shared 实际)
- `aiClaimedFeatures`(ExamModule 保留)≠ `claimedFeatures`(不存在)
- `aiClaimVerification`(Submission 写)≠ `aiClaimDetection`(signal ID,不是字段)
- `aiClaimDetection`**是 signal 名**,不是字段名

### Decision 系列(P0 + SelfAssess)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5SelfAssessSubmission.decisionSummary`(V5.2+) | Shared(未实现) | 未建立 | 未来 ReportView | V5 决策摘要 — 候选人回顾 |
| `session.store.getDecisionSummary()` | Client store | `@/stores/session.store` | DecisionSummary Component | 运行时从 submissions 聚合 3 模块决策 |
| `sDecisionStyle` | Signal registry (P0) | `@/server/signals/p0/s-decision-style` | scoring | 决策风格 signal(不是字段) |
| `sDecisionLatencyQuality` | Signal registry (MB Cursor) | `@/server/signals/mb/cursor/s-decision-latency-quality` | scoring | signal(不是字段) |

**常见混淆**:
- `decisionSummary`(Submission 字段,V5.2+)≠ `getDecisionSummary()`(store method)
- `decisionStyle` / `decisionLatencyQuality`**是 signal 名**,不是字段名

### Reflection 系列(MC + SelfAssess)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ModuleCSubmission.answers[].answer` | Shared MC | `@codelens-v5/shared/types/v5-mc` | MC Emma + sReflectionDepth signal | MC 对话中候选人回答内容 |
| `V5SelfAssessSubmission.reflection` | Shared SelfAssess | `@codelens-v5/shared/types/v5-self-assess` | sReflectionDepth + sMetaCognition signals | 自评反思文本 |
| `sReflectionDepth` | Signal registry (MC) | `@/server/signals/mc/s-reflection-depth` | scoring | 反思深度 signal(综合 MC + SE) |

**常见混淆**:
- `reflection`(SelfAssess 字段)≠ MC answer(字段是 `answers[].answer`)
- `reflectionDepth`**是 signal**,不是字段

### Scheme 系列(MA Round 1)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MASubmission.round1.schemeId` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sSchemeJudgment signal | 候选人选的方案 id (A / B / C) |
| `V5MASubmission.round1.reasoning` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sReasoningDepth signal | 选方案的推理 |
| `ExamModule(MA).round1.schemes` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Task prompt | 3 个方案的 pros/cons 数据 |
| `sSchemeJudgment` | Signal registry | `@/server/signals/ma/s-scheme-judgment` | scoring | 方案判断准确度 signal |

### Challenge 系列(MA Round 1 / MB)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MASubmission.round1.challengeResponse` | Shared MA | `@codelens-v5/shared/types/v5-ma` | sArgumentResilience signal | 候选人对 system challenge 的回应 |
| `ExamModule(MA).round1.challengeText` | Shared ExamModule | `@codelens-v5/shared/types/v5-exam-module` | Task prompt | 系统对候选人方案的挑战文字 |
| `sChallengeComplete` | Signal registry (**MB**) | `@/server/signals/mb/stage2-quality/s-challenge-complete` | scoring | **注意:这是 MB 的,不是 MA 的!**MB testPassRate |

**常见混淆**:
- `challengeResponse`(MA R1 字段)和 `sChallengeComplete`(MB signal) **不相关**,是不同模块的不同东西!

### Audit 系列(MB Stage 4)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5MBSubmission.audit.violations[]` | Shared MB | `@codelens-v5/shared/types/v5-mb` | sRuleEnforcement signal | 候选人对 3 个 AI 执行结果的标注 |
| `V5MBSubmission.audit.violations[].markedAsViolation` | — | — | — | 候选人判断是否违规 |
| `V5MBSubmission.audit.violations[].violatedRuleId` | Shared MB | `@codelens-v5/shared/types/v5-mb` | sRuleEnforcement | 违规时选的 rule id(**在 audit 里,不在 example 上**) |
| `V5MBSubmission.audit.submittedAt` | ⚠️ **不存在** | — | — | Parent component 自己打 timestamp,不在 shared |
| `ExamModule(MB).violationExamples[].isViolation` | Shared (groundTruth) | `@codelens-v5/shared/types/v5-exam-module` | sRuleEnforcement | 正确答案(不给候选人) |
| `ExamModule(MB).violationExamples[].violatedRuleId` | Shared (groundTruth) | `@codelens-v5/shared/types/v5-exam-module` | sRuleEnforcement | 正确答案 rule id(不给候选人) |

### AI Orchestration 系列(MD + MB)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ModuleDSubmission.aiOrchestrationPrompts[]` | Shared MD | `@codelens-v5/shared/types/v5-md` | sAiOrchestrationQuality signal | MD 候选人写的 AI 协调 prompts |
| `sAiOrchestrationQuality` | Signal registry (LLM whitelist) | `@/server/signals/md/s-ai-orchestration-quality` | scoring | LLM 判断的 AI orchestration 质量 |
| `MBCursorModeEvents`(chatEvents + diffEvents)| Shared MB | `@codelens-v5/shared/types/v5-mb` | sChatVsDirectRatio / sPromptQuality 等 | Cursor 模式事件 |

### Signal Result 系列(Round 3 重构 1)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `SignalResult.value` | Shared | `@codelens-v5/shared/types/v5-signals` | dimension aggregation | 信号值 0-1 scale |
| `SignalResult.evidence[]` | Shared | `@codelens-v5/shared/types/v5-signals` | Report Layer 2 UI | 证据列表,上限 5 条 |
| `SignalEvidence.source` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 证据来源路径 |
| `SignalEvidence.excerpt` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 原文片段(≤200 字符) |
| `SignalEvidence.contribution` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 对 value 的贡献(可正可负) |
| `SignalEvidence.triggeredRule` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 规则名(如 `has_quantitative_marker`) |
| `SignalResult.algorithmVersion` | Shared | `@codelens-v5/shared/types/v5-signals` | — | 如 `sArgumentResilience@v1` / `@v1_llm` / `@v1_fallback` |

### Grade 系列(Round 3 重构 2)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `GradeDecision.grade` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | V5Grade enum |
| `GradeDecision.composite` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 0-100 scale |
| `GradeDecision.dimensions` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Radar | Record<V5Dimension, number> 0-100 |
| `GradeDecision.confidence` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 'high' / 'medium' / 'low' |
| `GradeDecision.boundaryAnalysis` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 升降档距离分析 |
| `GradeDecision.reasoning` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | 人类可读说明 |
| `GradeDecision.dangerFlag` | Shared | `@codelens-v5/shared/types/v5-grade` | Report Hero | B- 警告(AI 依赖症) |
| `V5_GRADE_COMPOSITE_THRESHOLDS` | Shared | `@codelens-v5/shared/types/v5-grade` | scoring | D=0/C=45/B=55/B+=65/A=75/S=85/S+=90 |

### Capability Profile 系列(Round 3 重构 4)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `CapabilityProfile.id` | Shared | `@codelens-v5/shared/types/v5-scoring` | scoring / report | 4 个 profile id |
| `CapabilityProfile.score` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Hero | 0-100 |
| `CapabilityProfile.label` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Hero | '自主'/'熟练'/'有潜力'/'待发展' |
| `CapabilityProfile.dimensionBreakdown` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Layer 2 | 展开时显示权重贡献 |
| `CapabilityProfile.evidenceSignals[]` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report Layer 2 | 3-5 个支撑 signal id |
| `CAPABILITY_PROFILE_DEFINITIONS` | Shared | `@codelens-v5/shared/types/v5-scoring` | scoring | 4 profile 的权重 + 模板 |

### Cursor Behavior 系列(Round 2 Part 3 调整 5)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `CursorBehaviorLabel.label` | Shared(Task 17 从 client 迁过来) | `@codelens-v5/shared/types/v5-scoring` | Report Hero | '深思熟虑型'/'熟练接受型'/'快速粘贴型'/'无序混乱型' |
| `CursorBehaviorLabel.summary` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report | 3-5 行 summary |
| `CursorBehaviorLabel.evidenceSignals[]` | Shared | `@codelens-v5/shared/types/v5-scoring` | Report | 支撑 signal id |
| `computeCursorBehaviorLabel` | **V5.1 deferred**,V5.0 orchestrator 返 undefined | — | — | 实现未做 |

### V5ScoringResult 系列(Task 17 新建)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `V5ScoringResult` (全部 fields) | Shared(Task 17 新建) | `@codelens-v5/shared/types/v5-scoring` | scoreSession 返回 + Report UI 消费 | 含 grade + composite + dimensions + confidence + boundaryAnalysis + reasoning + dangerFlag + signals + capabilityProfiles + cursorBehaviorLabel |
| `ScoreSessionInput` (flat input) | Shared(Task 17 新建) | `@codelens-v5/shared/types/v5-scoring` | scoreSession 参数 + Golden Path fixture | 含 session + submissions + examData + participatingModules + suiteId |

### Legacy Scoring Result(V3/V4 兼容)

| Field | 归属 | Import path | 消费方 | 备注 |
|-------|------|-------------|--------|------|
| `ScoringResult` (legacy, V3 shape) | Shared | `@codelens-v5/shared/types/scoring` | V3/V4 archive 代码 | **勿和 V5ScoringResult 混淆!V5 code 不用这个** |

## 使用规则

### 写 Task brief 前 Claude 必做:

1. **识别 brief 里引用的字段** — grep 本文件
2. 每个字段 confirm:
   - 归属(shared 哪个文件 / ExamModule 哪个 module / client store / ...)
   - **精确 canonical 名称**
   - **Import path**(Frontend / Backend 都能用得上)
   - 消费方(write / read 分别)
3. 若本文件和 brief 里引用的名字**有任何 ambiguity**,**stop-for-Steve-clarification**

### Backend / Frontend agent pre-verify 必做:

1. Grep shared 源码,对比 brief 里的字段名
2. Grep import path 看 actual module name 和本文件对齐
3. 若发现 mismatch:
   - 轻微(brief 简写 vs canonical): 按 canonical 执行,PR 说明
   - 严重(字段不存在 / 位置错 / import path 错): **stop-for-clarification**

### Task 完成后 Claude 必做:

1. 若本次 Task 涉及**新 shared field**,追加到本文件(含 import path)
2. 若 observations 里标注 Pattern C:**立即更新本文件对应条目**

## 本文件更新纪律

- 任何 shared type 变动 → 本文件同步
- 任何 Task 里发现的 field naming 混淆 → 本文件补充混淆案例
- V5.1 开发时继承本文件,继续扩展

# field-naming-glossary.md · Event Naming 小节 append

> **指令给 Steve**:将本文件**全部内容** append 到 repo 的
> `docs/v5-planning/field-naming-glossary.md` 末尾(现第 254 行之后)。
> 不替换现有内容,只追加。
>
> **Background**:Frontend PR #58 observation #3 发现 `self-assess:submit`
> 是 V4 legacy 命名,非 `v5:se:*` canonical。Pattern C 防御需扩到 socket
> event names(规则 2 Day 3 扩展)。本小节是 V5.0 所有 socket events 的
> canonical 名 single source of truth。

---

## Socket Event Naming Glossary(2026-04-19 Day 3 加入)

**使用规则**:
- 每次写 Task brief 里引用 socket event 名前,**grep 本小节**
- 每次 draft ws.ts 声明前,**cross-check 本小节**
- 若 brief 和本小节冲突,**以本小节为准**
- 若本小节和 ws.ts 实际冲突,**先更新本小节,再发 brief**

**Canonical naming convention**:
- V5 new events: `v5:<module>:<action>` 格式
- V4 legacy retention: 保留原 V4 名(Frontend 已用,不破坏现有 emit)
- Response / ack events: `<event>:response` 后缀

---

### **Module B(MB Cursor)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `behavior:batch` | client → server | `{ sessionId: string, events: EditorBehaviorEvent[] }` | Task 22 server handler 新建 + 持久化到 `session.metadata.mb.editorBehavior.aiCompletionEvents`(其余 event types Task 22.x follow-up) | **Pattern C #5 自纠**:本表格曾把 canonical 写作 `v5:mb:behavior:batch`(Pattern C 防御提醒注脚),但 Task 22 pre-verify 实际 grep 发现 client(`useBehaviorTracker.ts:122`)+ shared `ws.ts:27` 都已用 `behavior:batch`。canonical = `behavior:batch`(无 `v5:` prefix);Task 22 PR 同 sweep 修正本行。`sessionId` 在 envelope 顶层(非 per-event):server 无 socket-level session 中间件,client 必须显式传 |
| `behavior:batch:response` | server → client | (none — fire-and-forget) | Client tracker 不依赖 ack;handler 错误走 `logger.warn` + drop | Task 22 |
| `v5:mb:chat:event` | client → server | `{ type, content, timestamp }` | Task 13c MB signals 消费 | Task 7.3 PR #40 已建立 |
| `v5:mb:diff:event` | client → server | `{ fromContent, toContent, source }` | Task 13c MB signals 消费 | 已建立 |
| `v5:mb:run_test` | client → server | `{ sessionId: string }` | Task 23 `run_test` handler 已补 `persistFinalTestRun` 调用,写 `metadata.mb.finalTestPassRate` + append `editorBehavior.testRuns[]`;sIterationEfficiency / sChallengeComplete 解锁 | **Pattern C #6 自纠 (a)**:本表格 Task 23 前写作 `v5:mb:run-test`(连字符),但 ws.ts L57 + mb-handlers.ts L208 + ModuleBPage Stage2 layout 全部已是 `v5:mb:run_test`(下划线)。canonical = `v5:mb:run_test`;Task 23 PR 同 sweep 修正本行。Payload `{ code }` 也是错的——实际 sandbox 从 `fileSnapshotService.getSnapshot(sessionId)` 拉文件,不需要 client 传 code |
| `v5:mb:test_result` | server → client | `{ stdout, stderr, exitCode, passRate, durationMs }` | MB stage 2 UI 显示测试结果 + ModuleBPage 折叠 `latestPassRate` | Task 12 已建立(原 `v5:mb:run-test:response` 是错记，实际事件名是 `v5:mb:test_result`) |
| `v5:mb:submit` | client → server | `{ sessionId, submission: V5MBSubmission }` (ack: `(ok: boolean) => void`) | Task 23 新建 server handler:`fileSnapshotService.persistToMetadata` + `persistMbSubmission`(strip editorBehavior)+ MODULE_SUBMITTED；sPrecisionFix + sChallengeComplete + sIterationEfficiency 三 signal 闭环 | **Pattern C #6 自纠 (b)**:本表格 Task 23 前注 "当前已在 ws.ts" 是错的——pre-verify grep `v5:mb:submit` 在 client/server 0 hits,`Verify ownership` 备注实属误导。Task 23 PR 同 sweep 把本行改为「新建」并补全 payload + ack signature。**Pattern H v2.2 cross-Task regression defense 关键**:此 handler 必须 STRIP `submission.editorBehavior` 后再 persist——ModuleBPage.tsx L204-211 候选人侧硬编码 6 个 empty array,naive spread-merge 会 silent 清空 Task 22 已 persist 的 `aiCompletionEvents` |

---

### **Module A(MA Logic)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `ma:round1:submit` OR `v5:ma:round1:submit`(待 Task 26 grep)| client → server | `V5MASubmission['round1']` | **Task 26 新建 server handler** | Pattern C:Backend pre-verify grep MAPage 实际 emit 确认 prefix。若 V4 legacy 则保留 |
| `ma:round2:submit` OR `v5:ma:round2:submit` | client → server | `V5MASubmission['round2']` | **Task 26 新建 server handler** | 同上 |
| `ma:round1:submit:response` | server → client | `{ success: true, submissionId }` | MAPage onSubmit ack | Task 26 定义 shape |
| `ma:round2:submit:response` | server → client | 同上 | | |

**Cluster C-MA 修复 note**:Frontend MAPage 当前是 silent-success(Backend Q2 verified),
Task 26 必须**同时改 Frontend emit + 新建 Backend handler + 回 ack**。
否则 Frontend 改 emit 但 server 无 handler 会触发 SelfAssessPage 类型的
timeout 错觉(PR #58 timeout guard 在 MA 页未装)。Task 26 brief 要求
Frontend 同 sprint 子任务加 timeout guard 模板(复用 PR #58)。

---

### **Module D(MD Orchestration)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `v5:md:submit` | client → server | `V5ModuleDSubmission` | **Task 27 新建 server handler** | observation #023 预见:Task 8 defer Frontend emit,Task 14 defer Backend handler,Task 27 一次清偿 |
| `v5:md:submit:response` | server → client | `{ success: true, submissionId, score? }` | MDPage onSubmit ack | score 字段可选:若同步 scoring 完成可返回,否则 async |

---

### **Module 0(P0 Phase Zero)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `v5:p0:submit` OR `p0:submit`(待 Task 25 grep) | client → server | `V5Phase0Submission` | **Task 25 新建 server handler** | Pattern C:Backend pre-verify grep Phase0Page 当前有无 emit。若无(Backend Q2 verified:local-only)则 canonical 选 `v5:p0:submit` |
| `v5:p0:submit:response` | server → client | `{ success, submissionId }` | Phase0Page onSubmit ack | Task 25 定义 |

---

### **Module SE(SelfAssess)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `self-assess:submit` | client → server | `V5SelfAssessSubmission` | **Task 24 新建 server handler** | **V4 legacy 命名保留,不改为 v5:se:submit**(Frontend PR #58 已 emit 用此名,333 测试绿,改破坏)。**Pattern C defense 教训内化**:Claude 不按 "v5:" convention 推断,follow codebase 实际 |
| `self-assess:submit:response` | server → client | `{ success: true }` | SelfAssessPage onSubmit ack(Frontend PR #58 消费 → clearTimeouts)| Task 24 定义 shape;**必须 <8s 返回**,否则触发 PR #58 timeout guard toast |

---

### **Session / Admin events**(参考,V5.0 scope 内已 stable)

| Event name(canonical) | Direction | 消费方 | 备注 |
|----------------------|-----------|--------|------|
| `session:load` | client → server | ExamRouter | 已建立 |
| `session:loaded` | server → client | ExamRouter | 已建立 |
| `module:advance` | client → server | 模块切换 | 已建立 |
| `connect` / `disconnect` | Socket.IO 内置 | — | 标准 |

---

### **Event naming 混淆警示**

1. **`self-assess:submit` vs `v5:se:submit`** — **不是同一 event**。前者是
   V4 legacy 保留(Frontend PR #58 实际 emit 名),后者是 Claude brief 一次
   错写(#Pattern C 第 4 次命中)。**canonical 是 `self-assess:submit`**
2. **`behavior:batch` 的 prefix** — Task 22 pre-verify(2026-04-19)grep
   结果:`packages/client/src/hooks/useBehaviorTracker.ts:122` + 共享
   `packages/shared/src/types/ws.ts:27` 两侧一致用 **无 prefix** 的
   `behavior:batch`。本 glossary 第 218 行原写作 `v5:mb:behavior:batch`,
   Task 22 同 PR sweep 修正(**Pattern C 第 5 次命中**:glossary 预设 vs
   client/shared 实测不一致 → canonical 永远以 dual-direction grep 为准,
   不以 brief 预设)。Envelope 形状:`{ sessionId: string, events: [...] }`,
   sessionId 在顶层(server 无 socket-level session 中间件)
3. **Response event 形状** — 所有 `:response` 后缀 event 必须至少含
   `{ success: boolean }`,让 Frontend timeout guard 有 consistent 消费接口
4. **Ack 和 event 的区别** — Socket.IO 的 ack callback(第 3 参数 callback)
   和独立 `:response` event 是两种机制,V5 选 **ack callback 优先**(Frontend
   PR #58 基于 ack callback 的 settled flag pattern)

---

### **Task 22-27 brief 强制模板**

每个 Task brief 开头必须包含:

```markdown
## Event name pre-verify(Pattern C 防御)

| Event | grep 结果 file:line | Canonical 以哪方为准 |
|-------|-------------------|-------------------|
| <event 名> | packages/client/...:L / packages/shared/ws.ts:L / 0 hits | Client 实际 emit / glossary 本小节 / 两者一致 |
```

若 grep 结果和本 glossary 冲突,**stop-for-clarification**,不 silent 按某一方执行。

---

### **V5.1 候选扩展**(不阻 V5.0)

| 候选 | 理由 |
|------|------|
| `sAgentGuidance` 事件 payload schema lock | Frontend PR #48 observation 指出 sAgentGuidance 单 signal 敏感度过高(#060),V5.1 重构时 payload shape 可能变化 |
| Heartbeat / keepalive events | V5.0 过渡期依赖 Socket.IO 默认,V5.0.5 可考虑自定义 heartbeat 便于 metrics |
| Admin-scoped events(`admin:*` namespace)| Task 15 Admin API 启动时扩,暂不在本 glossary |

---

**Pattern 防御 tick**:
- [x] 规则 2 扩到 event 名(Day 3 新规)
- [x] 规则 10 dual-direction grep enforcement(每 event 有 client/server 双侧记录)
- [x] Pattern C 第 4 次命中(self-assess:submit)根因记录,前置防御案例化
- [x] Pattern C 第 5 次命中(behavior:batch prefix)Task 22 sweep 修正:glossary
      预设错,client/shared 实测对;canonical 以 grep 为准的规则强化
- [x] Pattern H v2.2(Task 22 引入):test-green ≠ production-ingest-intact;
      引入 lateral infra grep(auth / session / middleware)作为 pre-verify 必查项;
      引入 Pattern H gate 集成测试(handler envelope → metadata persist → signal
      field-read 三段不 mock 中间层),防 schema↔reality drift 沉默通过
- [x] Pattern C 第 6 次命中(Task 23 sweep)双重错记修正:
      (a) `v5:mb:run-test`(连字符)实际是 `v5:mb:run_test`(下划线);
      (b) `v5:mb:submit` 注 "已在 ws.ts" 实际 0 hits,Task 23 才新建。
      根因:glossary 当 ws.ts 推理来源,未 grep 实代码;Task 23 pre-verify 双侧 grep 抓到。
      规则强化:任何「已建立 / 已在 ws.ts」备注必须附 `git grep` 行号引证,否则 reviewer 必查
- [x] Pattern H v2.2 lateral regression grep(Task 23 扩展):
      新 handler 写 `metadata.mb.*` 前必须先 grep "现有 writer 到 metadata.mb.editorBehavior",
      确认新写不 spread-merge 整个 submission(否则 silent 清空 Task 22 sibling array)。
      Task 23 `v5:mb:submit` 因此 STRIP `editorBehavior` + `agentExecutions` + `rounds` 三键再 persist;
      集成测试 `mb-cluster-b-pipeline.test.ts` case (ii) 是该 defense 的回归门