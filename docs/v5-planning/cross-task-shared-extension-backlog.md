# Cross-Task Shared Extension Backlog (Pattern B 防御)

> 目的:Claude 发 brief 时,**提前识别**当前 Task 会触发的 shared / 跨 package 扩展,避免 Pattern B(cross-task shared extensions 发现过晚)。
> 
> 使用方式:每次发 Task brief 前,**grep 本文件**看该 Task 有无前置 cross-task 扩展点。若有,在 brief 里**明示**"本 Task 同时扩 shared X"或"等前置 Task Y 先扩 shared"。

## Pattern B 历史命中(Day 1-2)

| 案例 | Trace | 概率判断(回顾) | 防御状态 |
|------|-------|----------------|----------|
| Task 12 → ws.ts events 扩展(8 client + 4 server) | PR #36 hotfix | **必然**(Frontend 7.6 集成必需) | Failed — 预见 |
| Task 11 → P0 aiClaimVerification 字段 | PR #39 retroactive | **高概率** | Failed — 预见 |
| Task 10 → MAModuleSpecific.migrationScenario | Task 13b local narrow #014 | **高概率** | Pending — local narrow 应急 |

## 当前 Pending Cross-Task Shared Extensions

### **概率标注说明**

- **必然**(inevitable):Task 的 core deliverable 必需 shared 扩展,defer 会直接 block 下游 Task
- **高概率**(high):Task 按 frontend/backend-agent-tasks.md 设计必含 shared 扩展,可能本身 scope 里
- **中概率**(medium):Task 可能需要 shared 扩展,但可以 local narrow cast 或 duplicate type 短期绕过
- **低概率**(low):Task 理论上可能触发 shared 变动,但大概率不会

---

### **Backend Task 14 owners**(MD 后端)— **DONE via Task 27**

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| ~~`packages/shared/ws.ts`:`v5:md:submit` event + payload shape~~ | ~~必然~~ | **DONE(Task 27)**:canonical 重命名为 `moduleD:submit`(lowercase-hyphen,与 Task 24-26 命名一致),payload `{ sessionId; submission: V5ModuleDSubmission }` + ack `(ok: boolean) => void`。Observation #023 闭环。 | — |
| ~~`packages/shared/ws.ts`:`v5:md:submit:response` event(如需)~~ | ~~中概率~~ | **未实装(Task 27 决议)**:沿用 ack callback 即可(与 Task 25/26 一致),不引入独立 response event。score 推送如果未来需要走 V5.0.5 retry/error UX。 | — |

### **Backend Task 15 owners**(Admin API)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/shared/src/types/`:`V5AdminSessionCreate` / `V5AdminSession` / `V5AdminExamInstance` / `V5AdminStatsOverview` | **必然** | Frontend Task 12 Layer 2 消费(当前用 adminApi.types.ts 本地 shim) | Task 15 brief **明示扩多个 admin types** |
| `packages/shared/src/types/v5-session.ts`:扩 `V5Session.status` 枚举(可能新增 'scored' / 'expired') | **高概率** | Admin session 生命周期管理 | Brief 提 |
| `packages/shared/src/types/v5-scoring.ts`:`V5ReportResponse`(Report 数据 wrapper) | **高概率** | Frontend Task 12 Layer 2 ReportViewPage 切换真 API | Brief 提 |

### **Backend Task 10 owners**(Step 1-8 Generator)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/shared/src/types/v5-modules.ts`:`MAModuleSpecific.migrationScenario` 字段 | **必然** | Task 13b 已打 cross-task-shared-extension-pending observation(#014),signals 用 local narrow cast 应急 | Task 10 完成时**回顾 Task 13b observation #014** |
| `packages/shared/src/types/v5-modules.ts`:可能扩 `MBModuleSpecific` / `MDModuleSpecific` 的 scenario-level 字段 | **中概率** | Step 2.5 migration scenario 生成相关 | 诊断驱动 |

### **Backend Task 9 owners**(Step 0 Prompt)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/shared/src/types/v5-prompt.ts` (如未建) | **中概率** | Admin 可调的 prompt 配置 interface | 现 PromptRegistry 在 server-local |
| `packages/server/src/prompts/`:MD LLM whitelist 3 个 prompt 的正式内容 | **必然** | 替换 Task 13d seed 的 v1 placeholder | 不扩 shared,纯 server 侧,但要注明 ownership |

### **Task 17 cleanup owners**(Golden Path follow-up)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/server/promptfooconfig.yaml`:创建 | **必然** | 修 CI prompt-regression 持续红 | Task 17 PR #51 merged 后独立 hotfix PR |
| `packages/client/e2e/*.spec.ts`:Playwright specs | **中概率** | 修 CI e2e 持续红(或 V5.1 scope) | V5.0 可接受 e2e 红 |

### **V5.1 候选**(不 block V5.0 发布)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/shared/src/types/v5-scoring.ts`:扩 `CursorBehaviorLabel.score` | **低概率** | V5.0 只有 label + summary,V5.1 可加 confidence | V5.1 backlog |
| `packages/shared/src/types/v5-session.ts`:`SessionMetadata.signalResults` migration 策略 | **中概率** | Backward compatibility(V5.0 session 如何重放) | V5.1 |
| `packages/shared/`:`V5ScoringResult` vs legacy `ScoringResult` rename 归并 | **低概率** | 当前 additive 共存,V5.2 时可能 rename legacy | V5.2 |

### **V5.0 Signal Production Gap — Must-fix cluster**(新增 2026-04-18)

> **Source**:`docs/v5-planning/v5-signal-production-coverage.md` audit。
> 47 signal 中 35 failing(16 broken + 19 unimplemented,74.5%)。V5.0 ship judgment
> 需选路径 1/2/3,参见 audit 第 4 部分。**本 section 假设走路径 1(严格修复)**,
> 列出为新 Task 18.1 / 18.2 所需的全部扩展。

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| **Task 18.1 A:server `behavior:batch` socket handler** | **必然** | 消费 `ws.ts:27-29` 已定义的 `behavior:batch` event,按 type 分发到 `editorBehavior.{aiCompletionEvents, chatEvents, diffEvents, editSessions, fileNavigationHistory, testRuns}`;11 个 MB Cursor / Stage2 signal 全部 unblock | 需同时定义 shown/responded 配对规则(lineNumber + shownAt) |
| **Task 18.1 B:`fileSnapshotService.persistToMetadata` call site** | **必然** | ~~在 MB "提交本模块"生命周期末执行(如 `v5:mb:audit:submit` 后 OR 新增 `v5:mb:submit` 事件),写入 `session.metadata.mb.finalFiles`;sPrecisionFix unblock~~ **Task 23 已交付**:新建 `v5:mb:submit` handler，调用 `fileSnapshotService.persistToMetadata` + `mb.service.persistMbSubmission`(strip editorBehavior，Pattern H v2.2 defense),写 `mb.{planning, standards, audit, finalFiles, finalTestPassRate}`. ModuleBPage handleAuditSubmit 后 emit | done — sPrecisionFix unblocked |
| **Task 18.1 C:`run_test` handler persist `finalTestPassRate`** | **必然** | ~~当前只 emit `MB_TEST_RUN` event,需增 `mb.service.persistTestRun(sessionId, passRate, duration)`~~ **Task 23 已交付**:新增 `mb.service.persistFinalTestRun(sessionId, { passRate, duration })`,写 `metadata.mb.finalTestPassRate` + append `editorBehavior.testRuns[]`(spread-merge 保留 sibling array);run_test handler 在 `socket.emit('v5:mb:test_result')` 之后、`MB_TEST_RUN` 之前调用 | done — sIterationEfficiency / sChallengeComplete unblocked |
| **Task 18.2 A:Phase 0 submission pipeline** | **必然** | Phase0Page 接 socket emit `v5:phase0:submit`(或 REST) → ws.ts 新增 event type → mb-handlers style 的 `p0-handlers.ts` → `p0.service.persistSubmission` 写 `metadata.phase0`;5 个 P0 signal unblock | 涉及 Frontend + Backend + shared |
| **Task 18.2 B:Module A submission pipeline** | **必然** | 同上,接 `v5:moduleA:round1:submit` / `v5:moduleA:round2:submit`;10 个 MA signal unblock | Round 分次 submit 或合并方案待决 |
| **Task 18.2 C:Module D submission pipeline** | **必然** | **DONE(Task 27)**:canonical event `moduleD:submit` + `registerModuleDHandlers` + `persistModuleDSubmission` 写 `metadata.moduleD.{subModules, interfaceDefinitions, dataFlowDescription, constraintsSelected, tradeoffText, aiOrchestrationPrompts}`;4 个 MD signals(sAiOrchestrationQuality AE + sConstraintIdentification / sDesignDecomposition / sTradeoffArticulation SD ×3)unblock。**Post-Task 27 milestone:41/47 = 87.2%,AE 0→1,SD 0→3,所有 6 V5 维度非空(radar production-ready)** | — |
| **Task 18.2 D:self-assess socket handler** | **必然** | SelfAssessPage 已发 `self-assess:submit`(1 signal UNimplemented 状态);需 (a) shared ws.ts 声明 event + payload type,(b) server 注册 handler 写 `metadata.selfAssess`;sMetaCognition unblock | ack callback 契约要兑现(client 等 ack 决定 advance) |
| **Task 18.2 E:Frontend banner — P0/MA/MD/SelfAssess 数据接入前的过渡 UI** | **高概率** | 走路径 1 时避免中途 candidate 误以为提交生效;可选 | 走路径 2 时必做(scope downgrade 交付) |
| **Task 18.2 F:Fixture re-calibration for post-ingest data** | **高概率** | behavior:batch 接入后,Liam/Steve/Emma/Max 4 fixture 的 aiCompletionEvents 需按实际生产 payload 重构;A7 audit 记录 Max 500ms 边界 bug / Steve 1500ms uniform 过高 | 与 Task 17b fixture 维护同团队 |

## 历史防御成功案例

### Task 17 `V5ScoringResult` 扩展(Backend pre-verify catch)

Task 17 brief 引用 `scoreSession(session, suite): Promise<ScoringResult>`,Backend pre-verify 发现:
- 没有 `scoreSession` 函数(Task 4 defer)
- 没有 V5ScoringResult type(V3 legacy 仍在 shared,V5 version 未建)
- examData 不在 session.metadata(独立 Prisma 表)

**Backend 一次性 stop-for-clarification 报 5 个 gaps + α/β/γ 选项**,Claude 裁决后 Task 17 final scope 包含:
- 扩 shared:V5ScoringResult + ScoreSessionInput + CursorBehaviorLabel migration
- 扩 server:scoring-orchestrator.service.ts(orchestrator wiring)
- Scale fix in computeDimensions

**概率判断**:**必然** — orchestrator 是 scoring pipeline 的 linchpin。Task 4 时 defer 是错误决定,Task 17 时补课。

## 防御流程

### 每次发 Task brief 前 Claude 必做:

1. **Grep 本文件** — 目标 Task 有无 pending extension?
2. **按概率优先级处理**:
   - **必然**(inevitable):brief 里**强制 scope**,不能 defer 到更后
   - **高概率**:brief 里**明示 scope**,说"本 Task 扩 shared X 应该在内"
   - **中概率**:brief 里**提醒 check**,Backend/Frontend pre-verify 时自判
   - **低概率**:不提,让 pre-verify 自然触发
3. **Grep Observations** cross-task-gap 标注(#004, #014, #023)
4. **Grep 源码**:目标 Task brief 里**任何 function reference**在 src 里有无 declaration?
5. **Grep 文件头 TODO**:目标 Task 涉及 file 有无 `// TODO Task N` 类注释?

### 每次 Task 完成后 Claude 必做:

1. **审视 PR body "Observations"** 有无 cross-task-shared-extension-pending 类型
2. **立即追加** 本文件对应 Task owner 的 pending list + **标注概率**
3. **不要等下次 Task 启动才想起**

## 本文件的 Single Source of Truth

本文件是 **V5 开发期 cross-task shared 扩展的唯一真实列表**。其他地方(PR body / observations / brief)引用时都回溯到本文件。

更新频率:每个 Task 完成时 review + 追加。

V5.0 Cluster 修复扩展(2026-04-19 Day 3 加入)
Context:Production Coverage Audit(PR #57)+ audit errata(PR #59)
确认 4 cluster / 34 signal 在 production 不可用。V5.0 scope 决定 Option 1
严格修,Task 22-27 分拆如下。本章节 lock 所有 Cluster 修复涉及的
shared 扩展、socket event canonical 名、Prisma migration 时序。
Ordering 原则:Cluster 修复必须按 A → B → D → C 顺序启动,因为:

Cluster A+B 是 Backend-only,最简单,先验证修复模板
Cluster D(SelfAssess)Frontend PR #58 已加 8s timeout guard,server 侧
handler 加完就 close loop
Cluster C(P0/MA/MD)涉及 3 个页面 × Frontend/Backend 双侧,最复杂,
放最后让前两轮的 pattern 固化


Task 22 · Cluster A:behavior:batch handler(Backend,~1.5 天)
修复目标:11 MB AE signals 从 null → 有值(AE 维度从 ACTIVE=4 → ~15)
扩展项概率影响注意packages/server/src/sockets/behavior-batch.handler.ts 新建(或融入 mb-module.ts)必然Client tracker emit 的终点Link 3 修复session.metadata.editorBehavior field 持久化 schema必然Link 4 —— 11 AE signals 读源Prisma JSON field 结构 lockpackages/shared/ws.ts v5:mb:behavior:batch event declaration高概率Client tracker 当前用什么 event 名,verifyPattern C 防御 —— grep client useBehaviorTracker.ts:122 实际 emit 的 event 名,不按设计文档写(Frontend PR #58 observation #3 precedent:实际 event 可能是 V4 legacy 名)packages/shared/ws.ts v5:mb:behavior:batch:response ack shape中概率取决于 client 当前是否需要 ack自判单测覆盖:event in → metadata write → 1 AE signal non-null必然Pattern H 防御 —— 测试必须覆盖完整 pipeline,非 mock input规则 11 要求
Data Pipeline Verification(brief 会包含):
LinkExpected state post-Task 221. Client emit✓(已存在 useBehaviorTracker.ts)2. ws.ts declaration✓ / ✗(本 Task verify)3. Server handler✗ → ✓(本 Task 交付)4. Persist✗ → ✓(本 Task 交付)5. Signal read✓(11 signals 已存在 signals/mb/)

Task 23 · Cluster B:persistToMetadata call site(Backend,~0.5 天)
修复目标:3 MB CQ signals 从 null → 有值(CQ 维度从 ACTIVE=? → ~12)
扩展项概率影响注意run_test handler 添加 persistToMetadata(finalTestPassRate, ...) 调用必然fileSnapshotService 已有 persistToMetadata 实现 + 单测,但 0 call siteLink 3→4 修复session.metadata.finalTestPassRate field 保留必然sChallengeComplete 等读源已 declaredMB final state persistence(submit 时 snapshot 全 file 最终态)高概率某些 CQ signal 读 "最终 snapshot"audit report 具体列哪 3 signal单测:run_test → metadata 读 → sChallengeComplete non-null必然规则 11
Data Pipeline Verification:
LinkExpected state post-Task 233. Server handler(run_test)✓(已存在)4. Persist(persistToMetadata call)✗ → ✓(本 Task 交付)5. Signal read✓(3 signals 已存在)

Task 24 · Cluster D:self-assess:submit handler(Backend,~0.5 天)— **DONE**(PR #67 / Pattern C #7 + dual-shape bridge)
修复目标:Cluster D 1 signal(`sMetaCognition`,METACOGNITION 维度)从 null → 有值 + Frontend PR #58 timeout
guard 闭环(正常 flow <8s 返回,无 toast 触发);**Pattern C #7 dual-shape bridge tactical fix** — Frontend
emit V4 envelope + sessionId,server normalize V4→V5(`selfConfidence/100→confidence`,
`selfIdentifiedRisk→reasoning`,`responseTimeMs` drop,`reviewedDecisions` undefined);dual-shape
解除是 V5.0.5 backlog
扩展项概率影响注意packages/server/src/sockets/self-assess.handler.ts 新建 socket.on('self-assess:submit')必然Link 3 —— 当前 0 handlerevent 名 verbatim self-assess:submit(V4 legacy 保留,Frontend PR #58 catch 的 Pattern C precedent)不改为 v5:se:*,除非 Frontend 同步改 emitpackages/shared/ws.ts 声明 self-assess:submit + ack response shape中概率Verify ws.ts 已有无 declaration;若无则补Pattern B 防御V5SelfAssessSubmission persist 到 Prisma必然Link 4schema 已 readyAck response 格式:{ success: true }(或 server-computed score)必然Frontend onSubmit ack callback 消费Verify Frontend 期望形状单测:submit event → Prisma write → Frontend ack 触发必然规则 11
Data Pipeline Verification:
LinkExpected state post-Task 241. Client emit✓(SelfAssessPage 已 emit)2. ws.ts declaration✓ / ✗ verify3. Server handler✗ → ✓(本 Task 交付)4. Persist✗ → ✓(本 Task 交付)5. Signal read✓(1 signal 已存在)
副作用 expected:

Frontend PR #58 8s timeout guard 在 Task 24 merge 后 0 触发
(正常 flow server ack <1s 返回)
Frontend 侧不需改动


Task 25 · Cluster C-P0:Phase 0 submit handler(Backend + Frontend verify,~1 天)— **DONE**(PR pending self-merge / canonical event `phase0:submit` 经 Phase 1 verify 决定;5 个 P0 signals 解锁 / Pattern H v2.2 4th gate 实装)
修复目标:P0 submit pipeline 打通,P0-bound signals 从 null → 有值
扩展项概率影响注意packages/shared/ws.ts p0:submit 或 v5:p0:submit event declaration必然Link 2Pattern C 关键:先 grep Phase0Page 当前有无 socket.emit,若无(local-only)则 canonical 名选 v5:p0:submit;若有 V4 legacy 名则保留packages/server/src/sockets/p0-submit.handler.ts 新建必然Link 3V5Phase0Submission persist(含 aiClaimVerification / aiOutputJudgment 等)必然Link 4schema 已 readyAck response shape必然Frontend 消费{ success, submissionId } 基线Frontend Phase0Page 从 silent-success 改为 socket.emit + ack必然若当前是 local-onlyFrontend 同 sprint 子任务(小)单测 + e2e:P0 submit → signal read必然规则 11
Data Pipeline Verification:
LinkCurrent stateExpected post-Task 251. Client emit✗(Phase0Page local-only)✓2. ws.ts declaration✗✓3. Server handler✗✓4. Persist✗✓5. Signal read✓(P0 signals 已存在)✓
Cross-task dependency:

Task 25 必须在 Task 22-24 全 merge 后启动,验证修复模板再扩到 P0
Task 25 本身 decoupled from Task 26/27(可并行)


Task 26 · Cluster C-MA:MA submit handler(Backend + Frontend verify,~0.5 天)— **DONE**(PR pending self-merge / canonical event `moduleA:submit`(单一最终 submit,非 R1/R2 拆分)经 Phase 1 verify 决定;10 个 MA signals 解锁(TJ × 7 + CQ × 3),累计 27/47 → 37/47 = 78.7% / Pattern H v2.2 5th gate 实装,cross-Task preservation + last-write-wins 三 case 全绿 / 命名空间 `metadata.moduleA.*` top-level(继承 Task 23-25 lineage,非 D-2 `metadata.submissions.moduleA`)/ Round 2 commentType enum lock 4 值 `'bug' | 'suggestion' | 'question' | 'nit'`,'style' V5.2+ A6 scope / hydrator contract lock for Task 15 Admin API owner)
修复目标:MA 单次 final submit pipeline 打通(round1 + round2 + round3 + round4 一次性提交,Mode C local-only → emit/ack 上线)
扩展项概率影响注意packages/shared/ws.ts moduleA:submit event(单一 final submit,非 R1/R2 拆)必然Link 2Phase 1 grep ModuleAPage 确认仅 handleFinalSubmit 一处 emit 点;命名 `moduleA:submit` lowercase-hyphen 与 `phase0:submit` / `self-assess:submit` 同风格,不冠 `v5:` 前缀packages/server/src/socket/moduleA-handlers.ts 新建必然Link 3Zod 4-round nested schema(round4 Pattern D-2 drift Phase 1 captured),strict field pick 继承 Task 23-25 lineageV5ModuleASubmission persist 到 `metadata.moduleA.*`(top-level,非 `metadata.submissions.moduleA` V4 ghost)必然Link 4schema 已 ready(参 glossary Scheme/Challenge/Defect/Diagnosis 系列);last-write-wins 由 service 层完整 persistable spread 保障Round 2 commentType enum 锁 4 值,'style' V5.2+ A6 scope必然规则 13 决议Phase 1 verify 决定不扩 'style';integration test 含 'style' 拒绝 caseFrontend ModuleAPage handleFinalSubmit 嵌入 emit + ack(fire-and-forget,timeout guard V5.0.5 backlog)必然Frontend 同 sprint 子任务,sessionId 兜底 `moduleA-pending`Pattern H v2.2 5th gate integration test必然规则 11i. emit → persist → all 10 MA signals non-null with Liam-tier scores;ii. cross-Task regression defense:4 sibling namespaces(mb/selfAssess/phase0/moduleC)intact after MA write;iii. last-write-wins
Data Pipeline Verification:
LinkCurrent stateExpected post-Task 261. Client emit✗(MAPage local-only)→ ✓✓2. ws.ts declaration✗ → ✓✓3. Server handler✗ → ✓✓4. Persist✗ → ✓ at `metadata.moduleA.*`✓5. Signal read✓(10 MA signals 已存在,Phase 1 verify 全部读 `metadata.moduleA.*`)✓
Hydrator contract lock for Task 15 Admin API:
Task 15 owner MUST hydrate session detail by reading `metadata.moduleA.{round1, round2, round3, round4}`(top-level,非 `metadata.submissions.moduleA`)。Task 26 已 freeze 此 namespace,Task 15 改 namespace 必须 PR-block Task 26 owner re-verify。

Task 27 · Cluster C-MD:MD submit handler(Backend + Frontend verify,~1 天)— **DONE**(canonical event `moduleD:submit`(lowercase-hyphen,Phase 1 D1,推翻 observation #023 占位 `v5:md:submit`)/ 4 个 MD signals 解锁(AE ×1 + SD ×3),累计 37/47 → 41/47 = 87.2% / **AE 0→1, SD 0→3,所有 6 V5 维度非空(radar production-ready)** / Pattern H v2.2 6th gate 实装 — **首个 LLM whitelist Pattern H dual-block 模板**(fallback path tier + LLM mock structural,V5.0 后续 LLM 信号 reference)/ cross-Task 5-namespace preservation(mb / selfAssess / phase0 / moduleA / moduleC)+ last-write-wins 三 case 全绿 / 命名空间 `metadata.moduleD.*` top-level(继承 Task 22-26 lineage,非 D-2 `metadata.submissions.moduleD`)/ Live shape 6 fields(Phase 1 D3,推翻 design doc 8 fields 的 `challengeResponse` / `designRevision` drift,Pattern D-2 lineage:Task 26 round4 precedent)/ hydrator contract lock for Task 15 Admin API owner)
修复目标:MD submit pipeline 打通(Mode C local-only → emit/ack 上线)+ closing Cluster C-MD final cluster
扩展项概率影响注意~~packages/shared/ws.ts v5:md:submit event declaration~~必然~~Link 2~~**DONE**:canonical 重命名 `moduleD:submit`,observation #023 闭环~~packages/shared/ws.ts v5:md:submit:response ack shape~~必然~~Link 2~~**未实装**:沿用 ack callback `(ok: boolean) => void`,不引入独立 response event~~packages/server/src/sockets/md-submit.handler.ts 新建~~必然~~Link 3~~**DONE**:`packages/server/src/socket/moduleD-handlers.ts` + `services/modules/md.service.ts`,Zod 6-field schema,strict field pick~~V5ModuleDSubmission persist(含 aiOrchestrationPrompts[] 等)~~必然~~Link 4~~**DONE**:6 fields(subModules / interfaceDefinitions / dataFlowDescription / constraintsSelected / tradeoffText / aiOrchestrationPrompts)~~Frontend MDPage 从 local state only 改为 socket.emit(Task 8 deferred 部分)~~必然~~**DONE**:`ModuleDPage.tsx:182-187` `getSocket().emit('moduleD:submit', ...)` fire-and-forget,sessionId 兜底 `moduleD-pending`Max fixture documentVisibleMs 从 500 改为 400(触发 C_reflex_accept tier)中概率Max fixture 500 边界 bug(#066)可独立小 PR 或合入 Task 27**未做**:延迟到独立 hotfix(Task 27 scope 已 dual-block 6th gate,fixture re-cal 解耦更安全)~~单测 + e2e~~必然规则 11**DONE**:24 ModuleDPage tests(2 emit 新增) / 10 handler tests / 6 service tests / 4 integration dual-block tests
Data Pipeline Verification:
LinkCurrent stateExpected post-Task 27Actual1. Client emit✗(MDPage local-only,Task 8 deferred)✓✓2. ws.ts declaration✗(Task 14 deferred)✓✓3. Server handler✗✓✓4. Persist✗✓✓ at `metadata.moduleD.*`5. Signal read✓(MD signals 已存在)✓✓ — 4 signals all non-null(fallback + LLM dual-block verified)
Hydrator contract lock for Task 15 Admin API:
Task 15 owner MUST hydrate session detail by reading `metadata.moduleD.{subModules, interfaceDefinitions, dataFlowDescription, constraintsSelected, tradeoffText, aiOrchestrationPrompts}`(top-level,非 `metadata.submissions.moduleD`)。Task 27 已 freeze 此 namespace,Task 15 改 namespace 必须 PR-block Task 27 owner re-verify。

V5.0 Cold Start Validation Task(Backend + Steve,0.5 天)
Task 22-27 全 merge 后,V5.0 发布 gate 新增必做:
项谁做验证内容End-to-end real session runBackend agent(自动化)真实 socket 连接,candidate 跑完 P0 + MA + MD + SE,assert all 48 signals non-null in session.metadata / DB / scoring pipeline outputReport view null scanFrontend agent(自动化)真实 session 生成 report,assert 0 "待评估 / N/A" 文案出现(规则 11 要求)Steve manual smokeSteve本地 full session 跑通 + 随机 check 3 signal evidence trace 合理
未通过 = V5.0 hold release(checklist 规则 11 最后一段新纪律)。

Pre-Task 22-27 启动前 dependency check
在 dispatch Task 22 brief 前,Claude 必须 verify:

PR #58 merged(Frontend SelfAssess timeout guard + CapabilityProfiles null guard)→ ✓(0e3a604)
PR #59 merged(Backend audit errata self-corrections)→ ✓
PR #60 merged(checklist v2.1,规则 10/11 生效)→ ✓(54222a7)
glossary Event Naming 小节 merged(本 turn 第 2 个 artifact)→ pending

Task 22 brief dispatch 前 dependency 4 必须 resolve。

Summary:V5.0 Cluster 修复时序 + 工期 band
TaskClusterOwnerDay band并行?Task 22A(behavior)BackendDay 1-2—Task 23B(persist)BackendDay 2-3(Task 22 后)—Task 24D(self-assess)BackendDay 3可与 Task 25 并行Task 25C-P0Backend + FrontendDay 4-5Task 24 后启动Task 26C-MABackend + FrontendDay 4-5与 Task 25 并行Task 27C-MDBackend + FrontendDay 5-6Task 26 后启动(MA 模板复用)Cold Start ValidationAll + SteveDay 7sequential
总 band:7 工作日(含 1.5x buffer on Backend 估 "4-5 days parallel")。
playbook Option 1 的 "~28-31 工作日" 总 V5.0 timeline 继续成立。

Pattern 防御 tick:

 规则 7(Pattern B):本章节 lock 所有 Cluster 修复涉及的 shared 扩展
 规则 10(Pattern H):每 Task 有 Data Pipeline Verification 表
 规则 11(Pattern H):Task 22-27 brief 模板已约束
 规则 2(Pattern C):Event 名 canonical 由 grep 确认,不按设计文档
 规则 3(Pattern F):Task 工期 band 加 1.5x buffer,不精确
# cross-task-shared-extension-backlog.md · V5.0 Progress Update(post-Cluster-C)

> **指令给 Steve**:将本文件**全部内容** append 到 repo 的
> `docs/v5-planning/cross-task-shared-extension-backlog.md` 末尾
> (已有的 Cluster Fix sprint 章节之后)。
> 不替换现有内容,只追加。

---

## V5.0 Progress Snapshot · Post-Cluster-C (2026-04-19 Day 3 end)

### Cluster fix sprint 完成(Task 22-27,6 PRs merged)

| Task | Cluster | PR | Commit | Merged | Signals activated | Pattern H gate |
|------|---------|-----|--------|--------|-------------------|----------------|
| 22 | A · behavior:batch ingest | #63 | db8dfe5 | ✅ | 6 MB AE(fraction of Cluster A 11)| 1st |
| 23 | B · persist v5:mb:submit | #66 | 77a5555 | ✅ | 3(2 AE + 1 CQ)| 2nd |
| 24 | D · self-assess:submit | #67 | d16b738 | ✅ | 1 SE(sMetaCognition)| 3rd |
| 25 | C-P0 · phase0:submit | #68 | 71acf50 | ✅ | 5(2 TJ + 3 METACOG)| 4th(first Rule 13 validation)|
| 26 | C-MA · moduleA:submit | #69 | 6cd3b33 | ✅ | 10(7 TJ + 3 CQ)| 5th |
| 27 | C-MD · moduleD:submit | #70 | 64dc7cd | ✅ | 4(1 AE + 3 SD)| **6th · LLM whitelist dual-block** |

**Totals**:6 PRs · 29 signals activated · Pattern H 6-gate ladder closed · Rule 13 3 validations。

### Signal coverage milestone

- **Pre-sprint**: 12/47 = 25.5% production-active(Day 2 baseline per PR #57 audit)
- **Post-Task-22-26**: 37/47 = 78.7%(Task 26 merge)
- **Post-Task-27**: **41/47 = 87.2%** ← current state
- **Post-Task-30 projected**: 46/47 = 97.9%(pending Task 30 Cluster A remaining 5)
- **Dimension population**: AE 0→1 · SD 0→3 · **all 6 V5 dimensions production-ready** · radar chart unblocked

### Cluster fix patterns established

**Pattern library 6 entries**(第 7 pending Task 30):
1. External-origin ingest(server-side sessionId injection)
2. Regression defense via spread-merge + strict field pick
3. V4→V5 normalize dual-shape bridge
4. V5-native greenfield submit + cross-Task preservation gate
5. Multi-round zod + last-write-wins
6. LLM whitelist dual-block(Block 1 fallback tier + Block 2 LLM mock structural)

Task 30 将验证 pattern 是否可 extend 到 **multi-event-type ingest pipeline**(chatEvents / diffEvents / fileEvents 三种 event,不止 aiCompletionEvents 一种)。

---

## V5.0 Remaining Scope(post-Cluster-C)

### 1. Task 30 · Cluster A remaining 5 signals(Phase 1/2 split,30a + 30b · 1.0-1.5 day total)

**Phase 1 outcome**(observation #095 + #096 + #097):
- Phase 1 verify-only deliverable catch 3 处 Pattern F(brief 推测字段名 ≠ 实际 signal `.ts` 字段)+ 1 处 Pattern C #6(glossary phantom event `v5:mb:chat:event` / `v5:mb:diff:event`)
- Architecture discovery:5 signals 共用 shared `behavior:batch` envelope(Task 22 wiring),scope 从 "4 handler + 4 persist" 压缩到 "1 dispatch + 4 persist"(-40%)
- **Real input field map**(Phase 1 grep verified):
  - sPromptQuality → `editorBehavior.chatEvents[]`
  - sFileNavigationEfficiency → `editorBehavior.fileNavigationHistory[]` + `examData.MB.scaffold.dependencyOrder`
  - sTestFirstBehavior → `editorBehavior.fileNavigationHistory[]`(读 file 导航 + tests/ path 命名,**完全不读 testEvents**)
  - sEditPatternQuality → `editorBehavior.editSessions[]`(独立 namespace,brief 笼统的 "diffEvents" 是 Pattern F #13)
  - sAiOutputReview → `editorBehavior.chatEvents[]` + `editorBehavior.diffEvents[]`

**Task 30a · Backend solo · ~0.7-1.0 day**(本 PR scope):
- Wire shared `behavior:batch` server-side dispatch for chat / diff / file / edit-session
- 4 new persist methods on `mb.service`(`appendChatEvents` / `appendDiffEvents` / `appendFileNavigation` / `appendEditSessions`)
- Pattern H 7th gate single integration test(3 Blocks:dispatch coverage / 5-namespace preservation / 4-signal non-null compute)
- 4 / 5 signals production-active post 30a:sPromptQuality + sFileNavigationEfficiency + sTestFirstBehavior + sAiOutputReview。**Cluster A 4 / 5 production-active = 100% chat/file/diff pipeline 覆盖,sEditPatternQuality 留给 30b**

**Task 30b · Backend solo · ~0.3-0.5 day**(post-30a follow-up):
- Wire client-side `useBehaviorTracker` emit for `edit_session_completed`(目前 Phase 1 grep 0 client emit)
- Activates sEditPatternQuality(5 / 5 Cluster A 闭环)
- 不需要新 server 改动(30a 已建好 `appendEditSessions` + dispatch + Pattern H gate)

**Dependencies**: Task 22 ingest pattern(已 established)+ Phase 1 verify deliverable(已交付)
**Phase 1/2 split rationale**: Rule 13 第 4 次 validation(observation #098)— 0.5 day Phase 1 cost 换 -40% scope discovery + 4 处 brief 错误前置 catch + 0 implementation surprise

### 2. Task 15 · Admin API + production hydration wrapper(2-3 day)

**Owner**: Backend solo
**Release gate**: **V5.0 硬需求**。
**Hydrator contract locked**(Task 26/27 Phase 1 Q comments):
- Read `metadata.moduleA` top-level(NOT `metadata.submissions.moduleA`)
- Read `metadata.moduleD` top-level
- Read `metadata.phase0` top-level
- Read `metadata.mb.editorBehavior` + `metadata.mb.fileSnapshot`
- Read `metadata.selfAssess` top-level
- Read `metadata.moduleC`(如果有)top-level

**Legacy cleanup**:V4 ghost `metadata.submissions.*` namespace cleanup(V5.0.5 backlog,Task 15 不必做)。

**Unblocks**: Frontend Task 12 Layer 2 implementation + Frontend F-A12 candidate profile schema。

**Shared types to deliver**:
- `V5AdminSessionCreate`
- `V5AdminSession`
- `V5AdminExamInstance`
- `V5AdminStatsOverview`
- `V5ReportResponse`(Report wrapper)

Frontend adminApi.types.ts shim 与这 5 个 shared types **1:1 对齐**(Frontend Task 12 Layer 2 pre-verify audit confirmed)。

### 3. A-series(3.5-4.5 day,分 Backend/Frontend)

- **A1 sCalibration**(0.5 day, Backend)· depends on fixture `selfAssess.confidence` 调整(#057 observation)
- **A12 candidate profile 7 fields**(2 day, Backend + Frontend)· Prisma schema + pre-exam form + Admin view · ~~Backend B-A12 ✅ shipped~~ · Frontend F-A12 pending
- **A10-lite candidate self-view**(1-2 day, Frontend)· ethics floor
- **A14a reliability merged to Task 18+**(concurrent)

### 4. CI green-up(1 day,Backend)

**New scope**(#093 observation driven):V5.0 Cold Start Validation 前必须 resolve CI reds。
- e2e "No tests found" · infra 小修
- prompt-regression "no promptfooconfig.yaml" · infra 小修
- Task 17 owner · 独立 slot(不合并到其他 Task)

**Release gate**: CI reds 必须清 · 不能带红 CI 发 V5.0。

### 5. Cold Start Validation(0.5 day,Backend + Steve)

**Release gate**(#088 observation formalized):
- End-to-end real socket session run · 非 fixture
- Assert all 48 signals non-null in production scoring pipeline output
- Frontend report view · 0 "待评估 / N/A" 文案
- Steve manual smoke + 随机 check 3 signal evidence trace

**未通过 = V5.0 hold release**。

---

## V5.0 Timeline(updated to ~8-11 workdays)

| Day | Owner | Activity | Blocks |
|-----|-------|----------|--------|
| 1-2 | Backend | Task 30 · Cluster A remaining 5 signals | Task 15 |
| 2-3 | Frontend | Task 12 Layer 2 prep(adminApi real-API prep,no commit yet) | Task 15 |
| 3-5 | Backend | Task 15 · Admin API + hydrator | Task 12 Layer 2 impl + F-A12 |
| 5-6 | Frontend | Task 12 Layer 2 impl(hydrator ready)| — |
| 5-7 | Backend + Frontend | A-series(A1 + A12 parallel with Frontend A10-lite)| — |
| 7-8 | Backend | CI green-up | Cold Start |
| 8-9 | Backend + Steve | Cold Start Validation | V5.0 release |

**总 estimate: 8-11 workdays from 2026-04-20**。

---

## V5.0.5 Backlog accumulated(post-Cluster-C)

From observations #075-#093 + prior Task 17b backlog:

1. **shared dist/ prebuild hook**(Frontend hit twice · confirmed necessary)
2. **HeroSection.tsx:83 outer guard null-safety**(Frontend Task 28 follow-up)
3. **SessionService metadata V4-ghost submissions envelope cleanup**(hydrator contract lock driven · #087)
4. **SelfAssess + Phase0 + MA + MD timeout guard consistency pass**
5. **V5AdminPosition scope gap**(Frontend Task 12 audit Observation #2)
6. **sAestheticJudgment experimental commentType 'style'**(V5.2+ consideration)
7. **V5 socket middleware · sessionId injection统一化**(#078 lateral infra Pattern H)
8. **V4 legacy event names migration planning**(self-assess:submit / behavior:batch → v5:se:submit / v5:mb:behavior:batch · V5.1+)
9. **V4 legacy shape deprecation + V5.1 V5-native shape emit**(Pattern D-3 cleanup · #084)
10. **HireFlow generation_meta_prompt.md 第零步 diagnostic layer**(cross-product · MockPro/HireFlow backlog)

---

## Pattern defense docs status(post-batch 075-093)

| Doc | Status | Last update |
|-----|--------|-------------|
| `observations.md` | 98 observations tracked(#094 Pattern E 第 5 次 + #095-#098 Task 30a Phase 1 batch appended) | 2026-04-19 |
| `claude-self-check-checklist-v2.md` | v2.1(11 rules · Pattern H 规则 10/11 enforced)| PR #60 · 2026-04-19 |
| `field-naming-glossary.md` | Event Naming section · Task 30a PR cleanup applied · L220-221 phantom `v5:mb:chat:event` / `v5:mb:diff:event` 替换为真实 `behavior:batch`(`event.type=...`)dispatch rows · 新增 file / edit-session rows | Task 30a PR · 2026-04-19 |
| `cross-task-shared-extension-backlog.md` | Cluster fix sprint closed · Task 30 split into 30a(this PR)+ 30b(client edit_session emit follow-up) | 2026-04-19 |
| `CI_KNOWN_RED.md` | e2e + prompt-regression baselines · 5+ merges red · **V5.0 release gate requires green-up** | 2026-04-19 |
| `v5-signal-production-coverage.md` | 41/47 = 87.2%(post-Task-27)| 2026-04-19 |

**Pattern C #5 self-pollution**(#077):glossary 自身 Event Naming 小节有 Claude 写的 `v5:mb:behavior:batch` 错误前缀。Task 30 brief dispatch 前需先修 glossary(Backend 可 squash 进 Task 30 PR,或单独 5-min docs PR)。
