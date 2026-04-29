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
- **A12 candidate profile 7 fields**(2 day, Backend + Frontend)· Prisma schema + pre-exam form + Admin view (Backend B-A12 ✅ shipped 2026-04-20 · Frontend F-A12 pending · 下轮)
- ~~**A10-lite candidate self-view**(1-2 day, Frontend)· ethics floor~~ **Backend B-A10-lite ✅ 2026-04-21 (PR #81) · Frontend F-A10-lite ✅ 2026-04-21** · SelfViewPage at `/candidate/self-view/:sessionId/:privateToken` (URL-as-auth · 4 capability profiles + 6 dim relative strength · bilingual zh+en · ethics-floor DOM assertion + client-side `.strict()` schema guard). See observations #134-#136.
- **A14a reliability merged to Task 18+**(concurrent)
- ~~**A15 Transparency Page**(0.5-1 day, Frontend)· public GDPR / ethics-floor policy doc~~ **Frontend A15 ✅ 2026-04-22** · `TransparencyPage` at `/transparency` (no auth · no Guard · anyone can read) · 7 sections bilingual zh+en (introduction / methodology / ethics / data-usage / candidate-rights / reviewer-guidance / contact) · narrative uses "48 signals · 45 pure-rule + 3 LLM whitelist" post-A14a framing · deliberately does NOT reuse `TransparencyStatement.tsx` (report trailer ≠ public policy doc · audience-context mismatch). See observations #143-#145.

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

---

## V5.0.5 Housekeeping(post-V5.0 release)

Accumulated follow-ups captured during Task B-A12 auth-fallback patch(observation #127):

- **middleware envelope consistency**:`requireAdmin` / `requireOrg` / `requireOrgOwner` still emit flat `{ error: string }`. B-A12 auth-fallback patch only migrated `requireCandidate` to `next(AppError)` nested envelope(Frontend F-A12 + Consent path). Full 4-helper unification deferred — blocked by Frontend `AdminGuard`(PR #75)current flat-shape dependency.
- ~~**A10-lite candidateSelfViewToken vs reuse**:Task B-A12 Commit 0 added `Session.candidateToken String? @unique`. A10-lite(candidate self-view · ethics floor)originally planned an independent token field. Decide whether A10-lite reuses `candidateToken` or mints its own(scope isolation vs schema bloat tradeoff).~~ **Resolved 2026-04-21**: B-A10-lite shipped with independent `Session.candidateSelfViewToken String? @unique` field(two-token separation · ethics-floor narrative). See observation #129 (Pattern H 第 5 次) + #128 (ethics floor `.strict()` schema).
- **admin error shape Frontend remap**:Pair with middleware envelope consistency above. Frontend admin surface needs a remap layer before backend can flip `requireAdmin` to nested envelope.
- **Candidate.token audit**:historical HR-mint long-lived token on `Candidate` model(not Session-scoped)has unclear current consumers. Audit and decide keep / deprecate post-V5.0.5 once auth-fallback path is stable.

---

## V5.0.5 Housekeeping(B-A10-lite self-view · 2026-04-21)

Added during Task B-A10-lite(backend candidate self-view · brief docs flag + observations #128-#130):

- **admin session-lifecycle mint-list API**(Pattern D cleanup flag):admin `POST /admin/sessions/create` now mints 2 opaque Session-scoped tokens(`candidateToken` + `candidateSelfViewToken`).Considered a future `GET /admin/sessions/:id/links` endpoint that returns `{ candidateExamLink, candidateSelfViewUrl }` so admin UI can re-fetch after session creation without re-hitting mint(idempotent read).V5.0.5 · blocked by admin UI need(not urgent — current response envelope sufficient).
- **cross-repo mock sync rule 精化**(observation #130):shared type扩展 PR 必须 create GH Issue to `CodeLens-v5-frontend` split repo with `monorepo-sync` label.Need to formalize as checklist-v2.6 item once split repo workflow stabilizes.
- **admin.ts Pattern D migration**(Pattern D cleanup flag):`admin.ts` 中 scoringResult handling 仍用 `as V5ScoringResult` cast(L374)、B-A10-lite self-view 路由已迁移到 `V5ScoringResultSchema.parse()` + cast-back pattern.Admin endpoint 4 `getAdminSessionReport` 可在 V5.0.5 内同步迁移到 zod parse · 修复 Pattern D 一致性(admin 侧 scoringResult 读取默认走 runtime parse · 而非 cast)。
- **shared.V5ScoringResultSchema `.strict()` tightening**(observation #128 follow-up):当前 `V5ScoringResultSchema` 是 non-strict(顶层 passthrough) · 原因是 scoring pipeline 偶发写入 transient forward-compat 字段。V5.0.5 考虑审计所有 writer · 转成 `.strict()` · 做 gate 而非 parse 轮廓。

---

## V5.0.5 Housekeeping(F-A12 ProfileSetup · 2026-04-21)

Accumulated follow-ups captured during Task F-A12 ProfileSetup(observations #131-#133):

- **CandidateApiError `details` field**:backend AppError envelope supports `{ error: { code, message, details? } }` per drift #6. Today's `CandidateApiError` only carries `{ code, status, message }` — F-A12 C2 test 4 explicitly skipped `details` assertion (T2 α ratify). When a downstream consumer needs field-level 422 breakdown (e.g. surface "which field failed"), widen `CandidateApiError` with `readonly details?: unknown` and thread it through `parseErrorBody`. Non-breaking add.
- **`CandidateGuard` → `ExamGuard` rename candidate**:the name `CandidateGuard` was fine when it was the only candidate-side guard, but F-A12 introduces `ProfileGuard`. The former gates `/exam/:sessionId`, so `ExamGuard` is more descriptive. Pure rename · ~3 file touch (component, App.tsx import, colocated test). No behavior change.

---

## V5.0.5 Housekeeping(A14a pure-rule reliability · 2026-04-21)

Added during Task A14a(backend pure-rule signal reliability gate · observations #137-#142):

- **A14b LLM signal variance monitoring**(observation #135 defer):the 3 `NON_DETERMINISTIC_SIGNAL_IDS` (`sAiOrchestrationQuality`, `sDesignDecomposition`, `sTradeoffArticulation`) are explicitly out of scope for A14a's deep-equal gate. V5.0.5 A14b layers distributional-similarity monitoring on top: repeated compute against the same input stays inside a tolerance band (e.g. `|Δvalue| ≤ 0.15` or evidence-set Jaccard ≥ 0.7). Placeholder `describe.skip('A14b · LLM signal variance monitoring (V5.0.5 deferred)', ...)` is already in `packages/server/src/__tests__/reliability/pure-rule-signals.test.ts` — removing the `.skip` and implementing the band assertion is the natural entry point.
- **`computedAt` stamp move to orchestrator/hydrator**(observation #139):every `SignalResult.computedAt` is stamped by the signal (or registry constructors) at return time, forcing the A14a reliability gate to strip the field before deep-equal. Hoist the stamp into `SignalRegistryImpl.computeAll` as a uniform post-processing step so signal compute bodies return pure `{ value, evidence, algorithmVersion }`. Enables stricter `SignalDefinition.compute: Promise<Omit<SignalResult, 'computedAt'>>` signatures and removes the strip helper at the gate. Touches ~48 signal files (mechanical 1-line delete each) + registry constructors + any downstream comparison consumers.
- **Golden Path moduleD fixture coverage**(observation #138):the 4 Golden Path fixtures all use `full_stack`-shape `GOLDEN_PATH_PARTICIPATING_MODULES` which excludes `moduleD`. MD signals therefore go through the `makeSkippedResult` path in the A14a reliability gate — deep-equal passes on null sentinels, not on actual compute paths. Extend the fixture set with `deep_dive`-shaped inputs (includes `moduleD`) so `sConstraintIdentification` + the 3 LLM signals exercise their real compute functions. Coordinate with Task 17b scope — the new fixture doubles as coverage for A14b.

---

## V5.0.5 Housekeeping(A15 Transparency Page · 2026-04-22)

Added during Task A15(frontend public GDPR / ethics-floor policy page · observations #143-#145):

- ~~**signal-count literal unify**(observation #144):three surfaces currently disagree on the signal count literal — `packages/client/src/report/sections/TransparencyStatement.tsx` hard-codes "43 个信号" / "43 signals" (pre-A1 era · PR #62), `CLAUDE.md` states "43 信号: 40 纯规则 + 3 LLM 白名单", while A14a (PR #84) ships the reliability gate with 48 total (45 pure-rule + 3 LLM). A15 Phase 2 ratify D2: the new `TransparencyPage` uses the post-A14a 48/45/3 framing. V5.0.5 single-surface content-only PR candidate: update TransparencyStatement.tsx zh + en literals + the accompanying "43 signals" test assertion, update CLAUDE.md `## 核心架构` bullet, and any other surface that surfaces the count. Scope: pure copy change, no logic, ~5 file touch, single PR. Owner: Frontend agent in dedicated content-only PR (or Steve-direct if pre-V5.0.5 urgency).~~ **DONE 2026-04-29**:report trailer `TransparencyStatement` zh/en now says 48, tests assert 48, public `transparencyContent.ts` comment reconciled, `packages/server/src/signals/index.ts` header now states canonical 48 = 45 pure-rule + 3 MD LLM-whitelist. `CLAUDE.md` was already fixed by observation #154.
  - ✅ **PARTIAL CLOSURE** (2026-04-24 · V5 Release Plan brief #6 C1 · commit `3abdb90` on branch `chore/c1-doc-unify-signal-count`):
    - `CLAUDE.md` surface closed · line 11 updated to "48 · 45 纯规则 + 3 LLM 白名单" + dimension breakdown sub-bullet (P0 5 · MA 10 · MB 23 · MD 4 · MC 4 · SE 2 = 48)
    - ~~`TransparencyStatement.tsx` "43 个信号" literal · **NOT TOUCHED** (fence #2 · component scoped to report trailer · V5.0.5 content-only PR slot)~~ **DONE 2026-04-29**.
    - Other drift surfaces (`v5-design-reference.md:711,713` + `design-reference-p0.md` historical brainstorm 50K+ LOC) · **NOT TOUCHED** (fence #3) · V5.0.1 comprehensive doc-drift sweep candidate
- **shared `BilingualText` interface consolidation**:four client surfaces (`consentContent.ts`, `profileContent.ts`, `selfViewContent.ts`, `transparencyContent.ts`) each locally re-declare the same `{ readonly zh: string; readonly en: string }` shape under the name `BilingualText`. `transparencyContent.ts` additionally introduces `BilingualParagraphs` (`{ readonly zh: readonly string[]; readonly en: readonly string[] }`). Hoist both types into a shared utility (e.g. `packages/client/src/lib/bilingual.ts`, or into `@codelens-v5/shared` if any server surface ever needs them) and re-export. Touches 4 import sites + 1 new module. Mechanical deduplication · no behavior change.
- **frontend-page-shape template**(observation #145):the four shipped A-series Frontend PRs (Consent F-77, ProfileSetup F-A12, SelfView F-A10-lite, Transparency A15) share a stable `{feature}Content.ts` + `{Feature}Page.tsx` + `{Feature}Page.test.tsx` shape that emerged organically without codification. Promote to `docs/v5-planning/frontend-page-shape.md` template so future candidate-facing (and public) pages inherit the pattern mechanically — co-locate bilingual copy, centralize `lib/tokens` styling, test via MemoryRouter + data-testid DOM assertions, keep handlers pure / `window.history`-safe. Doc-only task · 0 prod / 0 test.
- **`TransparencyStatement.tsx` audience-context rename candidate**(observation #143):with A15 shipping a public `TransparencyPage` at `/transparency`, the existing `report/sections/TransparencyStatement.tsx` (report trailer disclaimer) is easily confusable by name. Consider renaming to `ReportTrailerDisclaimer.tsx` or `ReportTransparencyFooter.tsx` to make the in-context-report-trailer scope explicit. Pure rename · ~3 file touch (component, `ReportViewPage.tsx` import, test). Non-urgent · ride with V5.0.5 signal-count unify PR.

---

## V5.0.5 Housekeeping(CI-Green-Up · 2026-04-22)

Added during Task CI-Green-Up(CI infra red-clearance for V5.0 ship · observations #146-#149):

- **A14b promptfoo expansion to 3 LLM signals + real LLM variance monitoring**(observation #147 · natural successor to C2 mock baseline):swap `packages/server/promptfoo/mock-provider.js` for a real provider (`openai:chat-4o-mini` or equivalent scoring-role model), widen `packages/server/promptfooconfig.yaml` `tests:` matrix to all 3 MD LLM whitelist signals (`sAiOrchestrationQuality` + `sDesignDecomposition` + `sTradeoffArticulation`), replace the shape-shallow assertions with variance-band checks (e.g. `|score - baseline| ≤ 0.15` across N runs). Matches A14a observation #137 describe.skip slot semantics — two tasks converge on the same V5.0.5 A14b entry point. Requires `OPENAI_API_KEY` (or chosen provider's key) wired into the CI secret store — not a V5.0 blocker, but a V5.0.5 prerequisite.
- **`playwright.smoke.config.ts` backend-only webServer**(observation F2 from CI-Green-Up Phase 1):root `playwright.config.ts` starts BOTH backend `npm run dev` (:4000) AND frontend `npm run dev:client` (:5173) as webServers — the CI-Green-Up smoke test only exercises the backend, so the frontend spin-up (~30s) is pure CI cost. V5.0.5 housekeeping adds a dedicated `e2e/playwright.smoke.config.ts` with backend-only webServer + updates ci.yml `e2e` step to `npx playwright test --config=e2e/playwright.smoke.config.ts`. Not done in CI-Green-Up itself because it would have required workflow touches (scope fence #6). Candidate to bundle with the first real Task 17 Playwright follow-up so the workflow edit pays for multiple tests.
- **Docker V5.2 handoff**(CI_KNOWN_RED.md sole remaining row):`packages/server/Dockerfile` + trivy-compatible multi-stage build + base image pin + optional registry push. V5.2 scope per Steve 2026-04-22 ratify. Not a V5.0 blocker because production uses E2B sandbox rather than docker for candidate code execution. When picked up, also remove the CI_KNOWN_RED.md docker row and confirm the `if: github.ref == 'refs/heads/main'` gate in ci.yml remains appropriate (currently docker only runs on main push, not PR).
- **Shared `BilingualText` interface** (surfaced by A15 Frontend Phase 1 Q2 · non-blocking · cross-ref from Frontend workstream · duplicate of A15 entry above — consolidate when picked up):consolidate ad-hoc `{ en, zh }` / `{ zh, en }` shapes scattered across content files into a single `packages/shared/src/types/bilingual.ts` export. Non-blocking cosmetic cleanup — tracking here so it does not get re-surfaced in each subsequent content-adjacent task Phase 1.

---

## V5.0.5 Housekeeping(A5 process.env → env.X batch migration · 2026-04-24)

Added during Task A5(backend Gap 11 Sentry env consumer-half closure · observation #151):

- **`process.env → env.X` batch migration audit(8 items · NODE_ENV × 7 + LOG_LEVEL × 1)**(observation #151 · Phase 1 Q5 surface):8 remaining `process.env.X` bypass sites in `packages/server/src` outside `env.ts` + dynamic-import guards. Inventory from A5 Phase 1 Q5 grep (2026-04-24):
  1. `config/db.ts:8` · `NODE_ENV` (in schema · consumer bypass)
  2. `lib/sentry.ts:28` · `NODE_ENV` (in schema · **Case B fence kept as-is during A5** · tracesSampleRate branch)
  3. `lib/logger.ts:10` · `LOG_LEVEL` (**NOT in schema · needs declaration first** · most urgent of the 8)
  4. `lib/logger.ts:11` · `NODE_ENV` (in schema · consumer bypass)
  5. `middleware/csrf.ts:39` · `NODE_ENV` (in schema · consumer bypass)
  6. `middleware/csrf.ts:56` · `NODE_ENV` (in schema · consumer bypass)
  7. `middleware/rateLimiter.ts:4` · `NODE_ENV` (in schema · consumer bypass)
  
  Tasks:
  - Add `LOG_LEVEL` to `env.ts` schema (`z.enum(['debug', 'info', 'warn', 'error']).default('info')` — consult `lib/logger.ts` for actual accepted levels)
  - Migrate 7 `NODE_ENV` consumers to `env.NODE_ENV`
  - Remove any redundant fallbacks (like A5 fallback `|| 'development'` drop)
  - 4-green smoke self-attest (same skeleton as A5 · `env.test.ts` absence is acceptable backward-compat signal)
  
  Reference · A5 brief Phase 1 Q5 · observations.md #151 pattern env-declare-discipline. Bundle into one PR (mechanical consumer migration · single narrative · ~10 file touch · ~10 line changes).

## V5.0.1 Housekeeping(A2 voice path drift reconcile · 2026-04-24)

Added during Task A2 (Brief #2 v3 · voice-mount · observation #155):

- ~~**`routes/voice.ts` endpoint path vs header-doc drift**(non-blocking · documented · V5.0.1 reconcile):`voice.ts` L17-21 header-doc advertises 4 endpoints all at `/api/voice/v5/*` but router-prefix `/v5/` is wired to only `/v5/start`. Actual paths mounted at `/api/voice`:~~ **DONE 2026-04-29**:header doc now lists actual `/api/voice/token`, `/api/voice/v5/start`, `/api/voice/stop`, `/api/voice/status`; client ModuleC now calls `/api/voice/v5/start` instead of stale `/api/voice/v4/start`.
  1. `POST /api/voice/token`(NOT `/v5/token`)
  2. `POST /api/voice/v5/start`(matches doc)
  3. `POST /api/voice/stop`(NOT `/v5/stop`)
  4. `GET  /api/voice/status`(NOT `/v5/status`)
  
  3 reconcile approaches (pick one in V5.0.1 follow-up brief):
  - **Approach α** · align router · rewrite 3 non-`/v5/` paths to `/v5/*` to match doc(client impact · frontend voice client calls current paths · would break if ported without coordination · check `packages/client/src` for call sites)
  - **Approach β** · align doc · edit header comment L17-21 to reflect actual mixed-prefix reality · zero client risk · zero test risk · pure doc correction
  - **Approach γ** · document-but-accept · annotate rationale(e.g. `/v5/start` is the V5-only capable endpoint · others reused as-is from V4 contract · prefix inconsistency acceptable) · converge narrative
  
  Recommended · Approach β(lowest risk · highest clarity · preserves V4→V5 reuse semantics that the header's own `Scope discipline` section already signals).
  
  Reference · A2 Brief #2 v3 Phase 1 Q1 finding · observations.md #155 · sibling `mc-voice-chat.ts` route prefix uses consistent `/api/v5/mc/*` pattern so voice is the outlier. Fence-preserved during A2 per D-3 revised wording("ZERO voice.ts logic/guard addition"). Pure doc / pure-path-rewrite scope · no CI workflow impact · no Steve review gate.

### 分支验证 pre-commit 纪律 + worktree 隔离(V5.0.5)

**来源**: Brief #7 B1 race condition 2026-04-24 · W2 commit 错落 W1 分支因共享 filesystem · post-commit 抓到 · cherry-pick 恢复 · 0 损失 · W1 A2 PR 独立 ship 干净(orphan local-only pre-W1-push)· observation #156 formalize。

**V5.0.5 修**:
- Rule #9 加入 `backend/frontend-agent-kickoff.md` · pre-commit `git branch --show-current` 验证 mandatory
- §E trigger E6 "wrong-branch at commit" 传播到所有 brief 模板(A3 · B2 · B3 立即 apply · 已随 B1 dispatch 生效)
- 可选 · `git worktree add ../CodeLens-v5-<window>` 基础设施 for parallel windows · 每 window 独立 working tree · 共享 `.git` objects · 0 filesystem 冲突 · 比完全独立 clone 更优(npm install 重复成本高)

**优先级**: 高 · 防止未来 parallel 工作 data corruption / cross-window contamination。

**Session evidence**: B1 session 内 2 race episodes · first 导致 commit 错落 a2 branch(post-commit `git branch --show-current` caught · cherry-pick 恢复)· second pre-write caught 由 Rule #9 apply(pre-commit verify 显 HEAD `main` · checkout B1 前 0 mutation)。Rule #9 validated as working safety net · 不 ceremonial。

### Mock config scaffold reconcile(V5.0.5)

**来源**: Brief #7 B1 W2 Brief #INV-2 discovery 2026-04-24 · `e2e/playwright.mock.config.ts` 73 LOC shipped V5 init `c6c2417` · broken refs surface during B1 Phase 1

**State**:
- `e2e/playwright.mock.config.ts` 73 LOC · V5 init era · V4 port scaffold · references missing:
  - `full-interview-flow.spec.ts`(spec 不存)
  - `e2e/fixtures/mock-ai-server.ts`(server 不存)
- Root `package.json` 仍 has `test:e2e:mock` script referencing 此 config
- Intent unclear · likely mock-AI interview flow for offline dev

**V5.0.5 reconcile approaches**(pick one):
- α · Fix · create missing spec + mock-ai-server · complete scaffold(scope explosion · ~500+ LOC · V5.0.5 full brief)
- β · Delete · remove config + script + refs · clean orphan(~5 LOC · safe · recommended)
- γ · Defer · document + leave · revisit V5.2 if mock-AI flow revived

**Decision deferred V5.0.5 housekeeping brief**。

## V5.0.1 Housekeeping(A3 mc-voice-chat URL doc sweep · 2026-04-24)

Added during Task A3 (Brief #3 · mc-voice-chat-mount · observation #157):

- ~~**`docs/v5-planning/v5-signal-production-coverage.md:84` stale URL reference**(non-blocking · documented · V5.0.1 doc-sweep): line references `/api/moduleC/voice-chat` from V4 naming · actual V5 route is `/api/v5/mc/voice-chat` (per A3 C1 mount + `voice.ts:132` VERTC contract). Pure doc correction, zero code impact.~~ **DONE 2026-04-29**:row now references `POST /api/v5/mc/voice-chat` and `saveRoundAnswer(...) → metadata.moduleC`.

  Reconcile approaches:
  - **Approach α** · one-line path edit in `v5-signal-production-coverage.md` · narrative sync only
  - **Approach β** · broader doc grep for `/api/moduleC/*` or `/api/mc-voice-chat/*` stale references across `docs/v5-planning/` · batch doc sweep
  
  Recommended · Approach β (bundle all stale V4-naming references in one doc-only PR · lowest reviewer overhead · highest hygiene delta). Grep pattern: `rg '/api/(moduleC|mc-voice-chat)' docs/` — expected zero hits post-sweep.
  
  Reference · A3 Brief #3 Phase 1 Q4 catch · observations.md #157 drift D-4 · scope-fenced during A3 per ratify §2 (C1/C2/C3 touch only index.ts + mc-voice-chat.ts + tests · no doc edits outside observation + this backlog entry). Pure doc scope · no CI workflow impact · no Steve review gate.

## V5.0.5 Housekeeping(B2 e2e/ CI scope gap + INV-pattern formalize · 2026-04-24)

Added during Brief #8 B2 · observation #158:

### e2e/ CI scope gap(high priority · Pattern F Layer 3 · V5.0.5 rule candidate #12)

**状态**: `e2e/helpers/**.ts` + `e2e/*.config.ts` 在所有 CI gate 之外:
- eslint scope `packages/*/src` (root package.json:15) · e2e/ 不在
- tsconfig includes (3 workspace tsconfigs + base) · 无 `e2e/`
- vitest includes (root `vitest.workspace.ts` · packages/*/vitest.config.ts) · 无 `e2e/`
- build (`npm run build --workspaces`) · 不 compile e2e/
- CI e2e job (`npx playwright test`) · Playwright 自 TS loader compile + run · 是 only validation path

**实际风险**: B2 driver 4 Layer 2 typecheck errors caught by ad-hoc `npx tsc --noEmit` · 若 silent push · Playwright runtime load 才 fail · CI e2e smoke 是 green(不 load helpers · 只 load smoke.spec.ts · helpers 只 in golden-path config path which has 0 specs pending B3)· 问题 deferred until B3 spec ships · 届时 CI e2e gate red · 阻 B3 merge。

**Reconcile approaches**(V5.0.5 pick):
- α · Add `e2e/tsconfig.json` extending `tsconfig.base.json` + include `e2e/**/*.ts` · CI 添加 step `npx tsc --noEmit -p e2e/tsconfig.json`(CI workflow touch · Steve review gate)
- β · Move helpers into `packages/e2e/` workspace package · inherit workspace lint/typecheck/build scope(scope explosion · ~200 LOC restructure)
- γ · Pre-commit hook ad-hoc tsc on `e2e/**/*.ts`(local-only · CI still gap)
- Recommend **α**(minimal surgery · CI real validation · Steve review 1 · workflow touch justified)

Reference · Brief #8 B2 observation #158 Phase 2 Layer 2 typecheck catch · 4 errors(V5MBPlanning shape / interfaceDefinitions array / clickRun ordering / unused import)silent push risk 若无 ad-hoc tsc discipline。

### INV-pattern formalize(V5.0.5 rule candidate #11)

**状态**: Pre-brief external-data discovery pattern(INV-1/INV-2/INV-3 all 15-25 min read-only structured report · ~80% unknowns resolved pre-brief)proven 3 times session · 未在 agent kickoff.md / brief template formalized。

**Action**:
- Add "INV-pattern" section to `backend-agent-kickoff.md` + `frontend-agent-kickoff.md`
- Brief template §0 optional "Pre-brief INV dispatch"(when scope audit-derived OR spans workspace boundary OR large-brief band)
- Agent INV output · structured report 11 section format(setup · Q1-Q9+ · summary)· planning consumes

Reference · Brief #8 B2 observation #158 Pattern F 10th validation · rule candidate #11 formalize · W-B large-scope standard workflow。

### Dead useSocket.ts deletion(frontend micro-PR · workspace lock) — DONE

**状态**: **DONE 2026-04-29** · `packages/client/src/hooks/useSocket.ts` deleted on main. Follow-up audit confirmed it had 0 live imports, was excluded from client typecheck, and imported stores that no longer exist in V5. V5 candidate pages use direct `/interview` `getSocket()` emits.

**Action** · closed by client dead root-socket hook deletion PR. Keep V5 module pages on direct `getSocket()` + HTTP fallback/retry where already implemented.

### Mock config scaffold reconcile(重复 reference · 见 B1 V5.0.5 section · 不重复 entry)

Already captured · `e2e/playwright.mock.config.ts` broken refs(full-interview-flow.spec.ts + mock-ai-server.ts 不存)· 3 approaches α/β/γ · 决策 V5.0.5 housekeeping brief。

## V5.0.1 Housekeeping brief(pre-ship consolidate · B3 post-merge draft)

**Origin**: Brief #9 B3 · W-B 3/3 ship · V5.0 automation closure · V5.0.1 micro-PRs consolidate pre-ship · observation #159。

**Scope**(single planning-drafted brief · doc-only + small frontend touches · merge pre-ship):
- **A2 voice.ts header doc vs actual path drift reconcile** · 3 approaches α/β/γ per backlog:495 A2 section · recommend β(header doc align actual mixed-prefix · lowest risk · zero client impact)
- **A3 mc-voice-chat `/api/v5/mc/*` doc sweep** · grep all `docs/**.md` for stale `/api/moduleC/*` or `/api/voice/v5/*` patterns · unified correct to `/api/v5/mc/*` + `/api/voice/*` actual · v5-signal-production-coverage.md:84 已 surfaced · 其他 unknown
- ~~**Frontend micro-PR · dead `packages/client/src/hooks/useSocket.ts` deletion** · 100+ LOC · 5 non-existent store imports per Frontend INV-3 · workspace lock · separate frontend brief dispatch to frontend window~~ · DONE 2026-04-29
- **Rule #11 INV-pattern formalize** · add to backend/frontend-agent-kickoff.md planning-side section · brief template §0 optional pre-brief INV dispatch · 3x validated INV-1/INV-2/INV-3

**Priority**: Medium-High · clean pre-ship housekeeping · not V5.0 blocker · consolidates 4 post-W-A/W-B surfaces。

## V5.0.5 Housekeeping brief(ship 后 2+ week · expansion · B3 post-merge draft)

**Origin**: Brief #9 B3 observation #159 · W-B complete · V5.0.5 rule candidates + expansion needs consolidated。

**Scope**:

### Rule #10 strengthened formalize (new · B3 session surface)

Pre-brief planning-side **3-thing scan** (15-30 sec per brief · saves 20-30 min ratify round-trip per occurrence):
1. `cross-task-shared-extension-backlog.md` (original rule #10)
2. **Shared types / interfaces** (`packages/shared/src/types/**.ts`) · grep brief-topic types before writing code expectations
3. **Data structure files** (fixtures · config · schema) · `head -50` / `cat` to verify shape before writing brief skeleton

**Failure mode cost 3 examples from session** (re-validated · rule maturing):
- A3 brief miss · backlog:508 + voice.ts:132 cross-ref (agent caught Phase 1 Q2)
- B3 brief miss · expectations.ts shape cat (agent caught Phase 1 Q2 · D1 + D3)
- B2 brief miss · V5Grade shared type grep (agent caught B3 Layer 2 · B2 narrow-literal unchallenged prior)

**Action**: add to planning-side checklist in `backend-agent-kickoff.md` + brief template 前置 discipline section。

### Rule #12 e2e/ CI scope systematic fix (high priority · B2+B3 precedent)

**Evidence · 5 typecheck drifts caught via ad-hoc Layer 2** (B2 4 + B3 1 · cumulative W-B runway):
- B2 · V5MBPlanning shape (decomposition/dependencies/fallbackStrategy not single text)
- B2 · V5ModuleDSubmission.interfaceDefinitions string[] not string
- B2 · TerminalHelper.clickRun ordering dependency
- B2 · unused P0ModuleSpecific import
- B3 · GoldenPathDriverFixture.grade narrow-literal vs V5Grade canonical

**Systematic fix** (V5.0.5 scope · single brief · CI workflow touch · Steve review gate):
- Add `e2e/tsconfig.json` extending `tsconfig.base.json` · include `e2e/**/*.ts`
- Add CI step `npx tsc --noEmit -p e2e/tsconfig.json` in `lint-and-typecheck` job
- Verify existing e2e/ files pass (smoke · driver · helpers · testids · spec · 2 configs)
- Lint scope extension · `eslint e2e --ext .ts` (optional · V5.0.5 scope decision)

### expectations.ts extension (B3 D3 scope gap)

**Origin**: B3 brief expected per-dim + per-signal bounds for assertions · `FixtureExpectation` interface (123 LOC) only provides grade + composite + capability labels + sCalibration。

**V5.0.5 scope** (separate brief · Task 17 extension):
- Expand `FixtureExpectation` interface · add `dimensionScores: Record<V5Dimension, [number, number]>` + `keySignals: Array<{ id, range }>`
- Recalibrate 4 archetype entries (liam/steve/emma/max) · source from current calibrated values · extend bands
- B3 spec extension (follow-up micro-PR) · add per-dim + per-signal assertions using expanded expectations

**Priority**: Medium · ship gate #2 passes with current narrow assertions · V5.0.5 adds fine-grained regression coverage。

### testids.ts admin report group migration (B3 D5 scope gap)

**Origin**: B3 inline `REPORT_TESTIDS` const in spec · fence #9 B3 narrow-reading · testids.ts scope frozen post-B2。

**V5.0.5 scope**:
- Move `REPORT_TESTIDS` from spec to `testids.ts` · `ADMIN_REPORT_TESTIDS` group
- Enumerate full INV-3 report catalog · `signalRow(id)` · `signalGroup(dim)` · `capabilityProfile(id)` · `hero-*` variants
- B3 spec follow-up · replace inline const with import

**Priority**: Low · shared source hygiene · current inline const works · V5.0.5 cleanup。

### max-c-grade.ts fixture rename ('D' grade alignment)

**Origin**: Task 17 · V4-era naming · fixture file `max-c-grade.ts` + export `maxCGradeFixture` · actual expectations bucket Max in 'D' grade per Task A1 recalibration。

**V5.0.5 scope** (micro-PR · all-touching rename):
- `max-c-grade.ts` → `max-d-grade.ts`
- `maxCGradeFixture` export → `maxDGradeFixture`
- B3 spec import + describe name update
- In-process `golden-path.test.ts` import update

**Priority**: Low · cosmetic alignment · current spec comment notes discrepancy · V5.0.5 hygiene。

### Rule #9 git worktree infra

Per B1+B2+A3 race condition incidents (observation #156/#157) · `git worktree add ../CodeLens-v5-<window>` for parallel windows · shared `.git` objects · 0 filesystem conflict · alternative to shared working tree。

### Helper test coverage + other items

Per B2 backlog entry · `monaco-helper.test.ts` + `terminal-helper.test.ts` direct unit tests · V5.0.5 nice-to-have。

### Brief LOC estimate granularity audit (Brief #20 sub-cycle ratify-error #8 prevention)

**Origin** · Brief #20 closure 实测显示估值 vs 实际 prod LOC 系统性 2-4× 低估(C1 估 10/15 实 40/49 · C2 估 40/25 实 129/170 · C6 估 25 实 71)· §E E1/E3/E5 silent absorbed 至 closure 才暴露 · 用户 ratify 时 catch (Pattern G silent absorb 同模式)。

**V5.0.5 rule candidate · Detection** (sprint discipline upgrade · brief #20 closure):

- 若 brief 首 commit 实测 LOC ≥ **2× 估值** · 触发 mid-brief recalibrate · 不等 closure
- 每 commit 后 `git --numstat` 实测 + 跟 dispatch 估值对账 · 写到 turn-summary
- 估值差异连续 2 commit 都 ≥ 2× · stop-report · 不 absorb 边界 · 升级回 Planning Claude
- §E status table 必须 mid-brief 更新 · 不只 closure 报 · 防 silent absorb
- §E 是**断路器** · 任何单触发 mid-brief 即停 · 不计算 fence 总值 · 防 brief #20 closure"all gates green silent absorb 三 §E"反向重犯

**V5.0.5 rule candidate · Generation Rule 1 · structural family-pattern** (brief #20 sub-cycle 新增 · obs#170):

- 当新代码加入 **known family**(append* / persist* / signal-{module} / 等已有 ≥ 3 sibling 模式)· estimate floor = `family case-count × family-avg lines/case` 实测 sibling 不想象 · 不是 "我估这个新东西需要几行"
- estimate 写法 · 显式标 "joins family X · floor from siblings = N lines" · 让 user 跟我都能 spot-verify 是否参考了 family
- generic estimate 模式 · 先 grep sibling pattern · 计 lines · 再加 delta · 不从零起估
- 真因证据 · brief #20 sub-cycle commit 2 appendTestRuns 估 +12 test (case-count 模型) · 实数 +85 test (5 case × 16 lines/case = 80 line floor)· multiplier 7.08× · 完美匹配 family floor 6.7× ratio

**V5.0.5 rule candidate · Generation Rule 2 · editorial verbosity carve-out** (brief #20 sub-cycle A1 新增):

- estimate 写法必含双桶 · `core +X / overhead +Y` 显式拆 · 不只总 LOC
  - core = 修法纯 functional code(无 comment / 无 forward-pay / 无 defensive)
  - overhead = comment / V5.0.5 housekeeping note / git blame 防 silent removal / family-conformance test scaffold
- estimate 时 user 单独 ratify overhead 是否需要(minimal vs forward-pay)· 防 mid-commit recalibrate
- 接力 Planning Claude / Brief Claude 见 estimate `core +5 / overhead +2` (minimal) vs `core +5 / overhead +20` (forward-pay) 区分清晰
- 真因证据 · brief #20 sub-cycle A1 spec disable 估 +3 注释 (minimal-marker 假设)· 实数 +20 (V5.0.5 housekeeping 3 option + toFixed(0) 真因诊断 + git blame 防 silent removal)· multiplier 6.67× · author 自选 forward-pay

**V5.0.5 rule candidate · Generation Rule 3 · 元 rule** (brief #20 sub-cycle A1 抽象):

- estimate 模型对 "修法 minimum-viable completion" vs "best-practice completion" 必须显式选定 · 默认假设 minimum-viable
- best-practice 是 sprint-discipline up-front choice · 不是 mid-commit silent escalate
- 同根本因(sprint-overhead implicit-zero)· 不同 manifestation(structural family-pattern vs editorial verbosity)· generation rule 双轴 carve-out 防同模式

**Priority** · High · sprint discipline core · 跟 Pattern G silent push streak guard 同级 · 防接力 Brief Claude 重复同模式。

**Tracking** · obs#170 (Brief #20 sub-cycle 闭环) · obs#170 sub-cycle commit 2 expansion (estimate 模型双轴漂分析) · this entry is the V5.0.5 rule formalization。
