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
| `behavior:batch`(`event.type=chat_prompt_sent` / `chat_response_received`) | client → server | dispatched inside `behavior:batch` envelope; per-event `payload` shape: `{ prompt, responseLength, duration, diffShownAt?, diffRespondedAt?, documentVisibleMs? }` | Task 30a server-side dispatch in `behavior-handlers.ts` → `appendChatEvents` → `metadata.mb.editorBehavior.chatEvents[]` → sPromptQuality / sAiOutputReview | **Pattern C #6 自纠**:本表格 Task 30a 前列出 phantom event `v5:mb:chat:event`,Task 30a Phase 1 dual-direction grep 发现 client / ws.ts / server handler 全部 0 hits — chat events 实际走 shared `behavior:batch` envelope(Task 22 wiring),server 按 `event.type` dispatch。Task 30a PR 同 sweep 替换本行 |
| `behavior:batch`(`event.type=diff_accepted` / `diff_rejected`) | client → server | dispatched inside `behavior:batch` envelope; per-event `payload` shape: `{ accepted?, linesAdded, linesRemoved }`(`accepted` 缺失时由 `event.type` 推导) | Task 30a server-side dispatch in `behavior-handlers.ts` → `appendDiffEvents` → `metadata.mb.editorBehavior.diffEvents[]` → sEditPatternQuality / sAiOutputReview | **Pattern C #6 自纠**:同上,phantom event `v5:mb:diff:event` 替换为真实 `behavior:batch` 通道 |
| `behavior:batch`(`event.type=file_opened` / `file_switched` / `file_closed`) | client → server | dispatched inside `behavior:batch` envelope; per-event `payload` shape: `{ filePath, action?, duration? }`(`action` 缺失时由 `event.type` 推导) | Task 30a server-side dispatch in `behavior-handlers.ts` → `appendFileNavigation` → `metadata.mb.editorBehavior.fileNavigationHistory[]` → sFileNavigationEfficiency / sTestFirstBehavior | Task 30a 新建。Reference Phase 1 grep:client `useBehaviorTracker.ts` 已 emit 三个 sub-type |
| `behavior:batch`(`event.type=edit_session_completed`) | client → server | dispatched inside `behavior:batch` envelope; per-event `payload` shape: `{ filePath, startTime, endTime, keystrokeCount, closedBy?, durationMs? }` | Task 30a server-side dispatch in `behavior-handlers.ts` → `appendEditSessions` → `metadata.mb.editorBehavior.editSessions[]` → sEditPatternQuality / sModifyQuality | Task 30a 持久化 wired,**client emit Task 30b shipped**(`useEditSessionTracker` hook — 30s idle-debounce + file-switch boundary,ModuleBPage `handleFileChange` per-keystroke feed)。**Pattern F #14 schema drift 修正**:Task 30b brief 预测 6 字段含 `editCount` + ISO `startTime` string,pre-verify grep 发现实际 shared type 4 字段 `keystrokeCount` + numeric epoch ms — Option C(add `closedBy?` + `durationMs?` 2 optional,keep existing 4)避免 signal/server 改动,legacy snapshots pre-30b 仍 parseable。**sModifyQuality co-consumer**:Phase 1 grep `packages/server/src/signals/mb/stage2-quality/s-modify-quality.ts` 发现也读 `keystrokeCount`(原 brief 只列 sEditPatternQuality),Cluster A 覆盖率 +1 → 46/47 = 97.9% |
| `v5:mb:run_test` | client → server | `{ sessionId: string }` | Task 23 `run_test` handler 已补 `persistFinalTestRun` 调用,写 `metadata.mb.finalTestPassRate` + append `editorBehavior.testRuns[]`;sIterationEfficiency / sChallengeComplete 解锁 | **Pattern C #6 自纠 (a)**:本表格 Task 23 前写作 `v5:mb:run-test`(连字符),但 ws.ts L57 + mb-handlers.ts L208 + ModuleBPage Stage2 layout 全部已是 `v5:mb:run_test`(下划线)。canonical = `v5:mb:run_test`;Task 23 PR 同 sweep 修正本行。Payload `{ code }` 也是错的——实际 sandbox 从 `fileSnapshotService.getSnapshot(sessionId)` 拉文件,不需要 client 传 code |
| `v5:mb:test_result` | server → client | `{ stdout, stderr, exitCode, passRate, durationMs }` | MB stage 2 UI 显示测试结果 + ModuleBPage 折叠 `latestPassRate` | Task 12 已建立(原 `v5:mb:run-test:response` 是错记，实际事件名是 `v5:mb:test_result`) |
| `v5:mb:submit` | client → server | `{ sessionId, submission: V5MBSubmission }` (ack: `(ok: boolean) => void`) | Task 23 新建 server handler:`fileSnapshotService.persistToMetadata` + `persistMbSubmission`(strip editorBehavior)+ MODULE_SUBMITTED；sPrecisionFix + sChallengeComplete + sIterationEfficiency 三 signal 闭环 | **Pattern C #6 自纠 (b)**:本表格 Task 23 前注 "当前已在 ws.ts" 是错的——pre-verify grep `v5:mb:submit` 在 client/server 0 hits,`Verify ownership` 备注实属误导。Task 23 PR 同 sweep 把本行改为「新建」并补全 payload + ack signature。**Pattern H v2.2 cross-Task regression defense 关键**:此 handler 必须 STRIP `submission.editorBehavior` 后再 persist——ModuleBPage.tsx L204-211 候选人侧硬编码 6 个 empty array,naive spread-merge 会 silent 清空 Task 22 已 persist 的 `aiCompletionEvents` |

---

### **Module A(MA Logic)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `moduleA:submit` | client → server | `{ sessionId: string; submission: V5ModuleASubmission }`(ack `(ok: boolean) => void`) | Task 26 `registerModuleAHandlers`(`packages/server/src/socket/moduleA-handlers.ts`)→ `persistModuleASubmission` 写 `metadata.moduleA.{round1, round2, round3, round4}` → MODULE_SUBMITTED;10 个 MA signals(sSchemeJudgment / sReasoningDepth / sContextQuality / sCriticalThinking / sArgumentResilience / sDiagnosisAccuracy / sPrincipleAbstraction TJ ×7,sCodeReviewQuality / sHiddenBugFound / sReviewPrioritization CQ ×3)解锁 | **Pattern C 决议(Phase 1 verify confirm)**:Phase 1 grep `packages/client/src/pages/ModuleAPage.tsx:174-222` 发现客户端只 `setModuleSubmissionLocal('moduleA', …)` 走本地 store,**0 个 socket emit**。canonical 选 `moduleA:submit` 小写连字符,与 `phase0:submit`(Task 25)/`self-assess:submit`(Task 24)命名约定一致(`v5:` 前缀仅用于多事件命名空间)。**Single final submit(Mode C)**:R1/R2/R3 是本地 UI gate(setR{N}Done),只有 R4 `handleFinalSubmit` 触发 emit;不是 per-round emit(早期 brief 推测 4 events,Phase 1 grep 推翻)。**V5-native shape**(无 V4 bridge,Phase 1 Q6(a)),server 直接 strict field pick 持久化。**4 rounds(非 design doc 3 rounds,Pattern D-2 drift)**:round4 由 Round 3 Part 3 调整 2 新增,required not optional。`sessionId` 在 envelope 顶层(Task 24 Option C 沿用,server 无 socket-level 中间件,Task 15 owner)。**Fire-and-forget emit**:本地 store 是 in-session UI 真值源,ack 不 gate `advance()`(无 timeout guard,V5.0.5 添加 retry/error UX) |
| `moduleA:submit` ack | server → client (callback) | `(ok: boolean) => void` | ModuleAPage handleFinalSubmit 注册 no-op callback(`(_ok: boolean) => {}`) | Task 26 实装。**ack signature lock**:`(ok: boolean)` 与 `phase0:submit` / `self-assess:submit` / `v5:mb:submit` 一致;`ok=false` 保留给 server 显式失败(zod 4-round schema invalid / persist throw) |

**Hydrator contract lock(Task 15 Admin API owner awareness)**:`metadata.moduleA.*` 是 top-level canonical namespace。**不要** hydrate `metadata.submissions.moduleA.*`(D-2 pre-Task 22 namespace,只有 archived V4 `mc-probe-engine.ts:369-370` 引用)。Task 15 Admin API hydration 必须读 `metadata.moduleA.*` 并 pass into `ScoreSessionInput.submissions.moduleA`。

**Round 2 commentType enum**:`'bug' | 'suggestion' | 'question' | 'nit'`。**不含 'style'**(sAestheticJudgment 不在 V5.0 43-signal set,V5.2+ A6 scope)。Zod schema 在 `moduleA-handlers.ts:50` 严格 validate 4 种值;`'style'` 触发 ack(false)。

**markedDefects 字段对齐**:`commentType` + `comment` + 可选 `fixSuggestion` 是 V5.0 锁定字段;`severity` 不在候选人侧(只在 `MAModuleSpecific.defects[]` ground truth 上,sHiddenBugFound 通过 defectId join 取)。

---

### **Module D(MD Orchestration)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `moduleD:submit` | client → server | `{ sessionId: string; submission: V5ModuleDSubmission }`(ack `(ok: boolean) => void`) | Task 27 `registerModuleDHandlers`(`packages/server/src/socket/moduleD-handlers.ts`)→ `persistModuleDSubmission` 写 `metadata.moduleD.{subModules, interfaceDefinitions, dataFlowDescription, constraintsSelected, tradeoffText, aiOrchestrationPrompts}` → MODULE_SUBMITTED;4 个 MD signals(sAiOrchestrationQuality AE,sConstraintIdentification / sDesignDecomposition / sTradeoffArticulation SD ×3)解锁。**Post-Task 27 milestone:41/47 = 87.2% signal coverage,AE 0→1,SD 0→3,所有 6 V5 维度非空(radar production-ready)** | **Pattern C 决议(Phase 1 verify confirm)**:早期占位 `v5:md:submit`(observation #023)被推翻,canonical 选 `moduleD:submit` 小写连字符,与 Task 26 `moduleA:submit` / Task 25 `phase0:submit` / Task 24 `self-assess:submit` 一致(`v5:` 前缀仅用于多事件命名空间,如 `v5:mb:*` / `v5:modulec:*`)。**Single final submit(Mode C)**:ModuleDPage `handleSubmit` 一次提交完整 6-field payload(无 per-section emit)。**V5-native shape(无 V4 bridge)**:Live `V5ModuleDSubmission` 是 6 fields(subModules / interfaceDefinitions / dataFlowDescription / constraintsSelected / tradeoffText / aiOrchestrationPrompts);design doc 提及的 `challengeResponse` / `designRevision` 从未上线 — Task 27 mirror live shape 而非 doc(Pattern D-2 lineage:Task 26 round4 的"trust live type over earlier design intent")。`sessionId` 在 envelope 顶层(Task 24 Option C 沿用,server 无 socket-level 中间件,Task 15 owner)。**Fire-and-forget emit**:本地 store 是 in-session UI 真值源,ack 不 gate `advance()`(无 timeout guard,V5.0.5 添加 retry/error UX)。**LLM whitelist split(3/4)**:sDesignDecomposition / sTradeoffArticulation / sAiOrchestrationQuality 通过 `gradeWithLLM` 走 ModelProvider;sConstraintIdentification 是纯规则。Persist contract 对两者一致 — LLM split 在 `signals/md/*` 内部,不影响 event shape |
| `moduleD:submit` ack | server → client (callback) | `(ok: boolean) => void` | ModuleDPage handleSubmit 注册 no-op callback(`(_ok: boolean) => {}`) | Task 27 实装。**ack signature lock**:`(ok: boolean)` 与 `moduleA:submit` / `phase0:submit` / `self-assess:submit` / `v5:mb:submit` 一致;`ok=false` 保留给 server 显式失败(zod 6-field schema invalid / persist throw) |

**Hydrator contract lock(Task 15 Admin API owner awareness)**:`metadata.moduleD.*` 是 top-level canonical namespace。**不要** hydrate `metadata.submissions.moduleD.*`(D-2 pre-Task 22 namespace,只有 archived V4 `mc-probe-engine.ts` 引用)。Task 15 Admin API hydration 必须读 `metadata.moduleD.*` 并 pass into `ScoreSessionInput.submissions.moduleD`。

**Pattern H 6th gate dual-block coverage**:`packages/server/src/tests/integration/moduleD-pipeline.test.ts` 是 V5.0 首个 LLM whitelist Pattern H 模板:
- Block 1(fallback path):exercises `.fallback!()` 直接,不调用 ModelProvider — 证明 persist → signal field-name alignment 不依赖 LLM nondeterminism;
- Block 2(LLM mock):mock `modelFactory.generate` 返回 canned JSON,assert 3 个 LLM whitelist 信号路由到 `gradeWithLLM` 并返回 LLM_VERSION(structural,不校准 score);
- Cross-Task 5-namespace 防护(mb / selfAssess / phase0 / moduleA / moduleC)— Pattern H 阶梯封顶。

---

### **Module 0(P0 Phase Zero)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `phase0:submit` | client → server | `{ sessionId: string, submission: V5Phase0Submission }`(ack `(ok: boolean) => void`) | Task 25 `registerPhase0Handlers`(`packages/server/src/socket/phase0-handlers.ts`)→ `persistPhase0Submission` 写 `metadata.phase0.{codeReading, aiOutputJudgment, aiClaimVerification, decision, inputBehavior?}` → MODULE_SUBMITTED;5 个 P0 信号(sBaselineReading TJ / sTechProfile / sDecisionStyle / sAiCalibration METACOGNITION / sAiClaimDetection TJ)解锁 | **Pattern C 决议**:Phase 1 verify(grep `packages/client/src/pages/Phase0Page.tsx`)发现客户端只 `setModuleSubmissionLocal('phase0', …)` 走本地 store,**0 个 socket emit**。canonical 选 `phase0:submit` 小写连字符,与 Task 24 `self-assess:submit` 命名约定一致(`v5:` 前缀仅用于多事件命名空间,如 `v5:mb:*` / `v5:modulec:*`)。**V5-native shape**(无 V4 bridge,Phase0Page 直接构造 V5Phase0Submission)。`sessionId` 在 envelope 顶层(Task 24 Option C 沿用,server 无 socket-level 中间件,Task 15 owner)。**Fire-and-forget emit**:本地 store 仍是 in-session UI 真值源,ack 不 gate `advance()`(无 timeout guard,V5.0.5 添加 retry/error UX) |
| `phase0:submit` ack | server → client (callback) | `(ok: boolean) => void` | Phase0Page handleSubmit 注册 no-op callback(`(_ok: boolean) => {}`) | Task 25 实装。**ack signature lock**:`(ok: boolean)` 与 `self-assess:submit` / `v5:mb:submit` 一致;`ok=false` 保留给 server 显式失败(zod schema invalid / persist throw) |

---

### **Module SE(SelfAssess)events**

| Event name(canonical) | Direction | Payload | 消费方 | 备注 |
|----------------------|-----------|---------|--------|------|
| `self-assess:submit` | client → server | `{ sessionId, selfConfidence (0-100), selfIdentifiedRisk?, responseTimeMs }` (V4-legacy field set; ack `(ok: boolean) => void`) | Task 24 `registerSelfAssessHandlers` (`packages/server/src/socket/self-assess-handlers.ts`) → `persistSelfAssess` 写 `metadata.selfAssess.{confidence, reasoning}`(V4→V5 normalize)→ MODULE_SUBMITTED;sMetaCognition 解锁 | **V4 legacy 命名保留**,不改为 v5:se:submit(Frontend PR #58 已 emit 用此名,改破坏)。**Pattern C #7 自纠**:Task 24 brief 假设 Frontend emit V5SelfAssessSubmission,实际 Frontend 是 dual-shape bridge(local store V5,socket emit V4),Backend pre-verify 抓到 — server 加 V4→V5 normalize map(selfConfidence/100 → confidence,selfIdentifiedRisk → reasoning,responseTimeMs drop,reviewedDecisions undefined)。`sessionId` 是 Task 24 Option C 加的(envelope 顶层,server 无 socket-level 中间件,Task 15 owner)。**Dual-shape bridge 是 V5.0.5 cleanup item**:Frontend 应直接 emit V5SelfAssessSubmission,server 撤销 normalize 层 |
| `self-assess:submit` ack | server → client (callback) | `(ok: boolean) => void` | SelfAssessPage L97-122 timeout guard 消费(settled flag + 8s setTimeout fallback) | Task 24 实装。**ack signature lock**:`(ok: boolean)` 而非 `{ success: boolean }`,因 PR #58 测试 L175,189 hard-assert boolean。**必须 <8s 返回**(`persistSelfAssess` + `eventBus.emit` 正常 <100ms,远在 timeout 内),否则 SelfAssessPage 显示 toast |

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
- [x] Pattern C 第 7 次命中(Task 24 sweep)dual-shape bridge 暴露:
      brief 假设 `self-assess:submit` payload = `V5SelfAssessSubmission`,但 Backend pre-verify
      grep `SelfAssessPage.tsx:104-122` + `ws.ts:43-46` 实际是 V4-legacy 字段集
      (`selfConfidence` 0-100 / `selfIdentifiedRisk` / `responseTimeMs`),且 Frontend 在 local
      store 写 V5 shape(`confidence` / `reasoning`)、socket emit 写 V4 shape — 这是 PR #58
      留下的 dual-shape bridge(Backend Cluster D vacuum 期间过渡)。Task 24 `registerSelfAssessHandlers`
      在 server 加 V4→V5 normalize 层 + Frontend payload 加 `sessionId` 一行(Option C tactical
      fix);dual-shape 解除是 V5.0.5 backlog。集成测试 `self-assess-pipeline.test.ts` case (i) 是
      normalize 回归门、case (ii) 是 cross-Task state preservation 门(Task 22 aiCompletionEvents
      + Task 23 finalTestPassRate / finalFiles 都不被 SE 写覆盖)
- [x] Pattern H v2.2 第 3 个 gate 实例(Task 24):非 MB-namespaced writer 也必须有 cross-Task
      preservation assertion。Pattern library 累积:Cluster A ingest(Task 22)/ Cluster B
      persistToMetadata(Task 23)/ Cluster D dual-shape normalize(Task 24)三个独立 writer 都
      proven 不互相 clobber。Task 25-27 Cluster C P0/MA/MD submit handlers 直接复用此 pattern

---

## Fixture Design Notes(2026-04-20 Task A1 加入)

> **Background**:Task A1 引入 `sCalibration`(V5.0 Metacognition 7th signal · first
> meta-signal)后,4 个 Golden Path archetype fixture 的 `selfAssess.confidence`
> 值获得显式 psychometric 意义 — 它不再只是填 "合理" 数值,而是塑造
> archetype 的 Dunning-Kruger narrative。本小节为 fixture maintainer 记录原则。

### 设计原则

1. **confidence 是 psychometric 叙事,不是分数填空**。每个 archetype 的
   `selfAssess.confidence` 值应呼应该 archetype 的 meta-cognition 画像:

| Archetype | confidence | 实际 composite | gap | sCalibration | 画像 |
|-----------|------------|----------------|-----|--------------|------|
| Liam      | 0.78       | 89.61          | 11.8 | 0.849       | 高水平 · 略低估(谦虚 / 不炫) |
| Steve     | 0.65       | 81.44          | 16.2 | 0.750       | 扎实 · 中度低估(有数据意识) |
| Emma      | 0.55       | 58.78          | 3.2  | 1.000       | 自知 · 完美校准(中段选手典型) |
| Max       | **0.90**   | 18.40          | 71.3 | **0.000**   | **Dunning-Kruger anchor**(初学者高估) |

2. **Max 的 0.90 confidence 是 Dunning-Kruger psychometric anchor,不是随意填值**。
   observation #057 曾讨论过 Max 0.40 retroactive override 方案,但经心理学文献
   (Kruger & Dunning 1999)证实:真实 D 级选手**不会**自评 0.40 —— 他们的
   缺陷恰恰是**不知道自己不知道**,所以自评偏高。0.90 保留是为 sCalibration = 0
   提供"perfect DK anchor"—— fixture 若将来被改成 0.40,sCalibration 会
   upward-drift 到 ~0.5,narrative 整个塌掉(Max 不再是 DK 典型,变成"谦虚的 D",
   违反 archetype 设计意图)。

3. **narrative-first 原则**:fixture `confidence` / `selfAssess.reasoning` /
   submission 质量**联合**决定 archetype 的可识别性。任何 fixture tuning 必须
   先对齐 narrative(Liam 谦虚 · Steve 扎实 · Emma 自知 · Max DK),再调数字。
   psychometric narrative > 数值 calibration 精度。

### sCalibration 预期区间(V5.0 Task A1 baseline)

见 `packages/server/src/tests/fixtures/golden-path/expectations.ts::FIXTURE_EXPECTATIONS`
的 `sCalibrationRange` 字段(Liam [0.75, 0.95] · Steve [0.65, 0.85] · Emma
[0.95, 1.0] · Max [0.0, 0.1])。band 比 composite 略窄因为 sCalibration 的
gap 公式敏感度高于 composite 的 6-dim 加权均值。

### V5.1 fixture tuning 候选(非紧急)

- Golden Path 4 archetype 没有一个触发 "direction=undefined"(perfect
  calibration gap=0)分支 · Emma 最近(gap=3.2)但仍 underconfident ·
  V5.1 可调一个 fixture 的 confidence 使其 gap≤5 且与 composite 完全
  equal,覆盖 direction-annotation 的 undefined 分支(当前仅 sCalibration
  unit test case "perfect calibration" 覆盖)

## Candidate vs CandidateProfile

两个 concept 同源 "candidate" 词根但**截然不同**,Task B-A12 Pattern C 第 8 次
occurrence,预防 reviewer / 未来 Claude 混用。

### Candidate(HR 身份实体)

- **位置**: Prisma `Candidate` table(persistent row,HR 创建流程维护)
- **时态**: 长期持久 · 跨 session 复用 · 代表"这个人"
- **字段**: `id` / `name` / `email` / `createdAt`
- **修改语义**: HR 编辑 candidate 档案,影响历史 session 的 snapshot 字段
  不回写(snapshot 独立)
- **使用**: `/admin/sessions` 列表的 candidate 字段(V5AdminCandidateSnapshot
  取自 Candidate row 的瞬时 copy)

### CandidateProfile(Session 上的 JSON 快照)

- **位置**: `Session.candidateProfile` 列(Json? · Task B-A12 新增)
- **时态**: Session 级临时快照 · 候选人**进入 exam 前**填写 · 不可回改
- **字段**: 7 项 self-report(yearsOfExperience / currentRole /
  primaryTechStack / companySize / aiToolYears / primaryAiTool /
  dailyAiUsageHours)· 全部 enum/bounded scalar,非 FK
- **修改语义**: 候选人提交后 Session-scoped immutable(Pattern H add-
  nullable-only,旧 session 读 null 不破坏 shape);HR 不编辑,新 session
  需要重新提交
- **使用**: `/admin/sessions/:sessionId/profile` 读接口、Report header 展示
  候选人答题前的技术背景上下文(evaluate scoring 时的 prior);候选人
  submit via `POST /api/candidate/profile/submit`

### 一句话区分

> Candidate = "这个人是谁"(HR 维护,跨 session);CandidateProfile = "他
> 答题前怎么自评自己"(候选人提交,钉在当次 session)。

Report 可同时出现:header 顶显示 Candidate.name/email,副栏显示 profile
snapshot 的 yearsOfExperience / currentRole / AI-tool 背景。
