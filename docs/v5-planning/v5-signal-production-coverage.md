# V5 Signal Production Coverage Audit

> **Task**: 审计 V5 全 signal 目录的生产数据管线状态,产出 per-signal 状态矩阵 + V5.0 发布判断。
> **Branch**: `chore/v5-signal-production-coverage-audit`
> **Scope**: 只做 audit,不改 signal / handler / fixture / shared types。
> **Origin**: A7 sDecisionLatencyQuality calibration audit 触发发现"test ≠ production"
> 模式(Pattern H 候选);Steve 授权扩大 scope 到全信号目录,确保 V5.0 发布前
> 有完整的 signal-level production readiness map。

---

## Erratum (2026-04-18 · self-correction)

Pre-Decide Verification 阶段的 5 条 sSelfAuditQuality flag 全部 accept,以下更正
已 apply 到本文档(docs-only,signal / handler / fixture / shared type 未变)。
每条更正前均 grep `packages/server/src/signals/**/*.ts` 的
`dimension: V5Dimension.*` 字段 **按实际 count 而非 audit 原文记忆**(Pattern F):

1. **sWritingQuality**:原 BROKEN → **ACTIVE-partial**。compute() corpus =
   planning + standards + chatEvents,前两者已 persist,corpus 非空即返回非
   null;chatEvents 分量待 Cluster A 修复后补齐。
2. **Row 207(TJ 维度举例)**:原例子 `sInterfaceDesign / sRulesCoverage /
   sRuleEnforcement` 全部错配 —— 前者按 signal 源码为 **AE**,后两者为 **CQ**。
   TJ 实际 signal = 9(P0 sAiClaimDetection / sBaselineReading + MA · 7),
   **ACTIVE = 0**。
3. **Row 220(AE 全集)**:原 "11 个 AE signal 中 0 个 ACTIVE" 与 grep 不一致。
   AE signal = **14**(MB Stage1 · 3 + stage2-exec · 3 + cursor · 6 + stage3
   agent-guidance · 1 + MD · 1),**当前 ACTIVE = 4**(MB Stage1 三件套 +
   sAgentGuidance)。
4. **off-by-1 伪差**:第 2 部分 Cluster 合计 = A·11 direct + A 间接·2 + B·2 + C·19
   + D·1 = 35,与 broken·16 + unimpl·19 = 35 一致;若移除 sWritingQuality 间接
   分类后新合计:A·11 + A 间接·1 + B·2 + C·19 + D·1 = **34** = broken·15 +
   unimpl·19,重新自洽。这里的"1"即 sWritingQuality 自身(从 broken 迁出)。
5. **Table 汇总 + 各维度 count / coverage** 按 #1-#3 同步重算(见 L111 汇总
   表与 L205 维度表)。

**未动的结论**:V5.0 ship judgment 的"路径 1 推荐"仍然成立(35 failing →
34 failing 级别的调整不改变 broken > 3 规则触发情况;AE 卖点失效的
定性更正为"14 中仅 4 active,Cursor 行为 0 签到"仍构成 release-blocker 证据)。

**sSelfAuditQuality pattern**:本次第 6 次命中独立实例,达到 formalize 阈值
5,升级为 V5.2 signal(依 Steve 授权)。

---

## 第 0 部分 · 预验证 + 命中 pattern

### Pattern F:数字不精确

**Brief 原文**"48 signals";**codebase 实际** `EXPECTED_SIGNAL_COUNT = 47`
(参见 `packages/server/src/signals/index.ts` L69)。Round 3 Part 2 调整后的正式
计数为 47(40 pure-rule + 3 MD LLM + 4 新增 sAiClaim / sPrinciple / sBelief /
sDecisionLatency)。按 `feedback_count_lists_precisely.md` memory rule,本
audit 全程以 **47** 为准并在第 7 部分 Pattern 归档中记一次 F 命中。

### 预验证过的文档

- `field-naming-glossary.md` — 本 audit 涉及的所有 shared type 字段命名
  canonical(`V5MBEditorBehavior.aiCompletionEvents` / `editorBehavior.chatEvents`
  / `submissions.moduleA.round1.reasoning` / `submissions.selfAssess.reasoning`
  等)已对齐 shared 源码。
- `cross-task-shared-extension-backlog.md` — 本 audit 将追加 V5.1 Task "behavior:batch
  server handler + editorBehavior.* ingest"。
- `observations.md` — 本 audit 将追加 #068(Pattern H 命中实例)。
- `CI_KNOWN_RED.md` — 本 audit 将新增 "V5.0 Signal Production Gap" 专节。

---

## 第 1 部分 · 47 Signal Production 状态矩阵

### 分类字典

| 状态 | 含义 | 判定 |
|------|------|------|
| **ACTIVE** | 生产数据完整流通:candidate 行为 → client emit → server handler → DB metadata → signal compute 产生非 null 值 | 全链路 green |
| **BROKEN** | Client emit 存在,但 server 无 handler OR server handler 存在但 persistence 断链 → signal 读到的 submission 字段始终空/undefined → 始终 null | 链路部分缺失 |
| **UNIMPLEMENTED** | Client 根本没有 emit 路径 OR 整个模块未接入 socket/REST → signal 无任何生产数据输入 | 完全未接入 |

### Matrix — 按维度分组(47 rows × 6 cols)

| Signal | Source field | Client emit | Server handler | Persistence path | Status |
|--------|--------------|-------------|----------------|------------------|--------|
| **MC · metacognition · 4 signals** |
| sBeliefUpdateMagnitude | `submissions.moduleC[round=2].answer` + (dead) selfAssess/moduleA | `POST /api/moduleC/voice-chat` | `mcVoiceChatRouter.post('/voice-chat')` | `mc-voice-chat.ts:424 prisma.session.update({ metadata.moduleC })` | **ACTIVE**(voice path;`preModuleCStance` 字段 extract 但 scoring 未消费,对 selfAssess/moduleA 缺失不敏感) |
| sBoundaryAwareness | `submissions.moduleC[].answer` | 同上 | 同上 | 同上 | **ACTIVE** |
| sCommunicationClarity | `submissions.moduleC[].answer` | 同上 | 同上 | 同上 | **ACTIVE** |
| sReflectionDepth | `submissions.moduleC[].answer` | 同上 | 同上 | 同上 | **ACTIVE** |
| **P0 · 5 signals** |
| sBaselineReading | `submissions.phase0.*` | **none**(Phase0Page.tsx 0 emits) | none | none | **UNIMPLEMENTED** |
| sAiCalibration | `submissions.phase0.*` | none | none | none | **UNIMPLEMENTED** |
| sDecisionStyle | `submissions.phase0.*` | none | none | none | **UNIMPLEMENTED** |
| sTechProfile | `submissions.phase0.*` | none | none | none | **UNIMPLEMENTED** |
| sAiClaimDetection | `submissions.phase0.*` | none | none | none | **UNIMPLEMENTED** |
| **MA · 10 signals** |
| sSchemeJudgment | `submissions.moduleA.*` | **none**(ModuleAPage.tsx 0 emits) | none | none | **UNIMPLEMENTED** |
| sReasoningDepth | `submissions.moduleA.round1.reasoning` / `structuredForm.tradeoff` | none | none | none | **UNIMPLEMENTED** |
| sContextQuality | `submissions.moduleA.round1.structuredForm.scenario` / `reasoning` | none | none | none | **UNIMPLEMENTED** |
| sCriticalThinking | `submissions.moduleA.*` | none | none | none | **UNIMPLEMENTED** |
| sArgumentResilience | `submissions.moduleA.round1.challengeResponse` | none | none | none | **UNIMPLEMENTED** |
| sCodeReviewQuality | `submissions.moduleA.round2.markedDefects[]` | none | none | none | **UNIMPLEMENTED** |
| sHiddenBugFound | `submissions.moduleA.round2.markedDefects[]` | none | none | none | **UNIMPLEMENTED** |
| sReviewPrioritization | `submissions.moduleA.round2.markedDefects[]` | none | none | none | **UNIMPLEMENTED** |
| sDiagnosisAccuracy | `submissions.moduleA.*` | none | none | none | **UNIMPLEMENTED** |
| sPrincipleAbstraction | `submissions.moduleA.*` | none | none | none | **UNIMPLEMENTED** |
| **MB Stage 1 planning · 3 signals** |
| sTaskDecomposition | `submissions.mb.planning.decomposition` | ModuleBPage:153 `v5:mb:planning:submit` | mb-handlers.ts:105 | `mb.service.ts persistPlanning` | **ACTIVE** |
| sInterfaceDesign | `submissions.mb.planning` | 同上 | 同上 | 同上 | **ACTIVE** |
| sFailureAnticipation | `submissions.mb.planning.fallbackStrategy` | 同上 | 同上 | 同上 | **ACTIVE** |
| **MB Stage 2 exec · 3 signals** |
| sPromptQuality | `submissions.mb.editorBehavior.chatEvents[].prompt` | `socket.emit('behavior:batch', ...)`(useBehaviorTracker.ts:122) | **none** | none(metadata.editorBehavior.chatEvents 始终空) | **BROKEN** |
| sIterationEfficiency | `submissions.mb.finalTestPassRate` + `editorBehavior.testRuns+chatEvents` | finalTestPassRate: 无 emit;testRuns: behavior:batch | **none** for both | `run_test` handler 发 test_result 但不 persist finalTestPassRate;`persistToMetadata` 未被任何 handler 调用 | **BROKEN** |
| sPrecisionFix | `submissions.mb.finalFiles` | `v5:mb:file_change` emit OK | `mb-handlers.ts:241` | fileSnapshotService 只写内存;`persistToMetadata` 被定义但**无 call site**(`file-snapshot.service.ts:73` vs grep 0 命中) | **BROKEN** |
| **MB Cursor behavior · 6 signals** |
| sAiCompletionAcceptRate | `editorBehavior.aiCompletionEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| sChatVsDirectRatio | `editorBehavior.chatEvents+editSessions+aiCompletionEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| sFileNavigationEfficiency | `editorBehavior.fileNavigationHistory` | `behavior:batch` | **none** | none | **BROKEN** |
| sTestFirstBehavior | `editorBehavior.fileNavigationHistory` | `behavior:batch` | **none** | none | **BROKEN** |
| sEditPatternQuality | `editorBehavior.editSessions` | `behavior:batch` | **none** | none | **BROKEN** |
| sDecisionLatencyQuality | `editorBehavior.aiCompletionEvents` | `behavior:batch` | **none** | none(已在 A7 audit 单独记录) | **BROKEN** |
| **MB Stage 2 quality · 5 signals** |
| sModifyQuality | `editorBehavior.editSessions+diffEvents+aiCompletionEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| sBlockSelectivity | `editorBehavior.aiCompletionEvents+diffEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| sChallengeComplete | `submissions.mb.finalTestPassRate+editorBehavior.testRuns` | 同 sIterationEfficiency | **none** | none | **BROKEN** |
| sVerifyDiscipline | `editorBehavior.testRuns+chatEvents+aiCompletionEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| sAiOutputReview | `editorBehavior.chatEvents+diffEvents` | `behavior:batch` | **none** | none | **BROKEN** |
| **MB Stage 3 standards · 4 signals** |
| sRulesQuality | `submissions.mb.standards.rulesContent` | ModuleBPage:167 `v5:mb:standards:submit` | mb-handlers.ts:116 | `mb.service.ts persistStandards` | **ACTIVE** |
| sRulesCoverage | 同上 | 同上 | 同上 | 同上 | **ACTIVE** |
| sRulesSpecificity | 同上 | 同上 | 同上 | 同上 | **ACTIVE** |
| sAgentGuidance | `submissions.mb.standards.agentContent` | 同上 | 同上 | 同上 | **ACTIVE** |
| **MB horizontal · 1 signal** |
| sWritingQuality | `submissions.mb.planning+standards+chatEvents` | planning+standards OK;chatEvents via `behavior:batch`(无 handler) | partial | planning+standards persist OK;chatEvents 丢失 | **ACTIVE-partial**(源码 `signals/mb/horizontal/s-writing-quality.ts:47-105` compute() 的 corpus 在 planning + standards 非空时返回非 null;chatEvents 分量待 Cluster A 修复,score 可能偏低但非 null — 见 Erratum #1 + 第 4 部分) |
| **MB Stage 4 audit · 1 signal** |
| sRuleEnforcement | `submissions.mb.audit.violations` + `standards.rulesContent` | ModuleBPage:189 `v5:mb:audit:submit` | mb-handlers.ts:131 | `mb.service.ts persistAudit` | **ACTIVE** |
| **MD · 4 signals** |
| sConstraintIdentification | `submissions.moduleD.constraintsSelected` | **none**(ModuleDPage.tsx 0 emits) | none | none | **UNIMPLEMENTED** |
| sDesignDecomposition | `submissions.moduleD.subModules[]` | none | none | none | **UNIMPLEMENTED** |
| sTradeoffArticulation | `submissions.moduleD.tradeoffText` | none | none | none | **UNIMPLEMENTED** |
| sAiOrchestrationQuality | `submissions.moduleD.aiOrchestrationPrompts` | none | none | none | **UNIMPLEMENTED** |
| **SE · 1 signal** |
| sMetaCognition | `submissions.selfAssess.reasoning/confidence/reviewedDecisions` | SelfAssessPage:91 `socket.emit('self-assess:submit')` | **none** | none | **BROKEN**(client emit 自发调 ack 但 server 从不登记此 event) |

### 汇总

| 类别 | 总数 | ACTIVE | BROKEN | UNIMPLEMENTED |
|------|------|--------|--------|----------------|
| MC | 4 | 4 | 0 | 0 |
| P0 | 5 | 0 | 0 | 5 |
| MA | 10 | 0 | 0 | 10 |
| MB | 23 | 9 | 14 | 0 |
| MD | 4 | 0 | 0 | 4 |
| SE | 1 | 0 | 1 | 0 |
| **TOTAL** | **47** | **13**(27.7%) | **15**(31.9%) | **19**(40.4%) |

**Note**:MB ACTIVE 9 = Stage1 · 3 + Stage3 · 4 + Stage4 · 1 + horizontal
sWritingQuality · 1(partial,见 Erratum #1)。若按"严格 active 必须全分量
齐活"标准剔除 sWritingQuality partial,ACTIVE 回落到 12 / 47(25.5%),但
该信号在生产下确实返回有效 score,audit 采"ACTIVE-partial 也计入 ACTIVE"。

---

## 第 2 部分 · Broken cluster 归因

### Cluster A · `behavior:batch` ingest handler 缺失(11 signals)

**Scope**:所有读 `editorBehavior.{aiCompletionEvents, chatEvents, diffEvents,
editSessions, fileNavigationHistory, testRuns}` 的 signal。

**Root cause**:

1. shared 协议定义 `'behavior:batch'`(ws.ts:27-29),client 侧
   `useBehaviorTracker.ts:122` 正确 `socket.emit('behavior:batch', ...)`。
2. server 侧 grep `'behavior:batch'` / `socket\.on.*behavior` 命中 **0 次**(非
   archive 代码)。
3. `mb-handlers.ts` 只注册 8 个 `v5:mb:*` 事件,不含 behavior:batch。
4. `mb.service.ts` 只导出 `persistPlanning / persistStandards / persistAudit /
   appendVisibilityEvent / calculatePassRate`,无任何路径写入 editorBehavior
   下除 documentVisibilityEvents 外的其他数组。

**影响信号**(11):sPromptQuality、sAiCompletionAcceptRate、sChatVsDirectRatio、
sFileNavigationEfficiency、sTestFirstBehavior、sEditPatternQuality、
sDecisionLatencyQuality、sModifyQuality、sBlockSelectivity、sVerifyDiscipline、
sAiOutputReview。

**间接影响**(1,Erratum #1 修订):sIterationEfficiency(fallback 依赖
testRuns / chatEvents;同时落 Cluster B)。
sWritingQuality 原列此处,现按源码行为(planning + standards corpus 非空
即返回非 null)重分类为 ACTIVE-partial,见 Erratum #1。

### Cluster B · `fileSnapshotService.persistToMetadata` 从未被调用(2 signals)

**Scope**:读 `submissions.mb.finalFiles` 或 `finalTestPassRate` 的 signal。

**Root cause**:

1. `file-snapshot.service.ts:73` 定义 `async persistToMetadata(sessionId)`,
   作用是把内存中 fileSnapshotService 的 tracked files 写入
   `session.metadata.mb.finalFiles`。
2. 全仓 grep `persistToMetadata\(` 命中 4 行:定义本身 + 2 测试 + handler
   注释(`mb-handlers.ts:15` 只是说"submission 时会调")—— **0 个实际
   production call site**。
3. `run_test` handler 计算 passRate 并发 `v5:mb:test_result` 事件,但不调
   `mb.service` 写入 `session.metadata.mb.finalTestPassRate`。只 `eventBus.emit`
   内部 `MB_TEST_RUN` 事件(无 persistence 订阅者)。

**影响信号**:sPrecisionFix(finalFiles)、sChallengeComplete(finalTestPassRate)。
sIterationEfficiency 同时落 Cluster A 和 B。

### Cluster C · 整模块未接入 socket / REST(19 signals)

**Scope**:P0(5) + MA(10) + MD(4)。

**Root cause**:Phase0Page.tsx / ModuleAPage.tsx / ModuleDPage.tsx **完全没有
socket.emit 调用**(frontend grep 确认)。各模块页面目前是 UI shell,未接入
behavior tracker / submission API。

**Glossary 关联**:cross-task-shared-extension-backlog.md 此前已列 Task 14
`v5:md:submit` / Task 15 admin types 为 pending-必然,但 P0 + MA + MD 生产
接入 **尚未在 backlog 列为 V5.0 必做项**。本 audit 需补充。

### Cluster D · SelfAssess socket event 无 handler(1 signal)

**Scope**:sMetaCognition。

**Root cause**:

1. `SelfAssessPage.tsx:91` 发 `socket.emit('self-assess:submit', {...}, ack)`。
2. server 全仓 grep `self-assess:submit` / `'self-assess'` 命中 **0**(非
   archive)。
3. shared `ws.ts` 也未声明 `self-assess:submit` event type(按
   `field-naming-glossary.md` 的 ClientToServerEvents 条目 verify)。

**事实上**:client emit 的 ack callback 永远不会被调用 → 调用点的 Promise 会
永远 pending → 但因为是 fire-and-forget emit,client 继续 `advance()` 进入下
一个模块,signal 只是拿不到数据。

---

## 第 3 部分 · V5.0 Composite 影响评估

### 各维度 signal 可用率

按 `packages/shared/src/config/suites.ts`(SUITES 全 5 套件)与本 matrix 交叉:

| Dimension | 维度权重(full_stack) | 该维度 signals | ACTIVE count | 覆盖率 |
|-----------|----------------------|----------------|--------------|--------|
| technicalJudgment(TJ) | 0.30 | **9**(P0 · 2:sAiClaimDetection / sBaselineReading;MA · 7:sArgumentResilience / sReasoningDepth / sContextQuality / sSchemeJudgment / sPrincipleAbstraction / sCriticalThinking / sDiagnosisAccuracy) | **0**(P0 UNIMPL + MA UNIMPL;MB / SE 无 TJ signal) | **0%** |
| aiEngineering(AE) | 0.25 | **14**(MB Stage1 · 3 + stage2-exec · 3 + cursor · 6 + stage3 agent-guidance · 1 + MD sAiOrchestrationQuality · 1) | **4**(MB Stage1 · 3:sTaskDecomposition / sInterfaceDesign / sFailureAnticipation + sAgentGuidance) | ~29% |
| systemDesign(SD) | 0.15 | **3**(MD · 3:sConstraintIdentification / sTradeoffArticulation / sDesignDecomposition) | **0**(MD UNIMPL) | **0%** |
| codeQuality(CQ) | 0.10 | **12**(MB Stage3 rules · 3 + Stage4 rule-enforcement · 1 + Stage2-quality · 5 + MA markedDefects · 3) | **4**(MB Stage3 rules · 3 + sRuleEnforcement) | ~33% |
| communication(COM) | 0.10 | **3**(MC · 2:sBoundaryAwareness / sCommunicationClarity + MB horizontal sWritingQuality · 1) | **3**(含 sWritingQuality ACTIVE-partial,见 Erratum #1) | ~100% |
| metacognition(MetaCog) | 0.10 | **6**(MC · 2:sBeliefUpdateMagnitude / sReflectionDepth + P0 · 3:sTechProfile / sAiCalibration / sDecisionStyle + SE · 1:sMetaCognition) | **2**(MC · 2 ACTIVE;P0 UNIMPL + SE BROKEN) | ~33% |

**Pattern F 验证**:各 dimension count 通过
`rg "dimension: V5Dimension\.<X>" packages/server/src/signals/**/*.ts` 实际
grep 得出,合计 9 + 14 + 3 + 12 + 3 + 6 = **47**,与 `EXPECTED_SIGNAL_COUNT`
精确一致。原 audit 前表的 "10+ / 12+ / 主要 / MC 4+MA reasoning" 非精确描
述,Erratum #2-#3 按真实注册表重写。

### 关键发现

1. **AE 维度 4 / 14 ACTIVE**(Erratum #3 修订)。aiEngineering 全集 14 条
   (按 signal 源码 `dimension: V5Dimension.AI_ENGINEERING`):MB Stage1 · 3
   (sTaskDecomposition / sInterfaceDesign / sFailureAnticipation)+
   Stage2-exec · 3(sPromptQuality / sIterationEfficiency / sPrecisionFix)+
   Cursor · 6(sAiCompletionAcceptRate / sChatVsDirectRatio /
   sFileNavigationEfficiency / sTestFirstBehavior / sEditPatternQuality /
   sDecisionLatencyQuality)+ Stage3 agent-guidance · 1 + MD
   sAiOrchestrationQuality · 1。**当前 ACTIVE = 4**(MB Stage1 三件套 +
   sAgentGuidance);其余 10 条(Cursor 6 + Stage2-exec 3 + MD 1)**全部
   BROKEN / UNIMPLEMENTED**。这 10 条恰是 V5 "Cursor AI-assisted 行为实
   测"卖点的核心签到点,实测层面零签到。
   > 原表述"11 个 AE signal 中 0 个 ACTIVE"有 3 处错配(sAiClaimDetection
   > 实为 TJ / sAiCalibration 实为 MetaCog / sBlockSelectivity & sAiOutputReview
   > & sVerifyDiscipline 实为 CQ;sWritingQuality 实为 COM),按实际 grep 更正。
2. **CQ 维度 4 / 12 ACTIVE**(Erratum #3 修订)。codeQuality 全集 12 条:
   MB Stage3 rules · 3(sRulesQuality / sRulesCoverage / sRulesSpecificity)+
   Stage4 · 1(sRuleEnforcement)+ Stage2-quality · 5(sModifyQuality /
   sBlockSelectivity / sChallengeComplete / sVerifyDiscipline /
   sAiOutputReview)+ MA markedDefects · 3(sCodeReviewQuality /
   sHiddenBugFound / sReviewPrioritization)。**当前 ACTIVE = 4**(Stage3
   rules + sRuleEnforcement);Stage2-quality 5 + MA 3 共 8 条 BROKEN / UNIMPL。
   > 原表述"CQ 维度完全空"与 grep 不符;sDiagnosisAccuracy 原被错列 CQ
   > 实为 TJ。
3. **TJ 维度 0 / 9 ACTIVE**(Erratum #2 修订)。TJ 全集 9 条:P0 · 2
   (sAiClaimDetection / sBaselineReading)+ MA · 7(sArgumentResilience /
   sReasoningDepth / sContextQuality / sSchemeJudgment / sPrincipleAbstraction /
   sCriticalThinking / sDiagnosisAccuracy)。P0 UNIMPL + MA UNIMPL + MB/SE
   无 TJ signal → **覆盖率 0%**。这是 6 维度中唯一彻底空的维度(SD 同样 0,
   但 SD 总权重 0.15 远低于 TJ 0.30)。
   > 原表述"~3(sInterfaceDesign、sRulesCoverage、sRuleEnforcement 等 MB 部分)"
   > 三个举例全部错配维度(实为 AE / CQ / CQ)。MB 不存在任何 TJ signal。
4. **N/A rescaling 副作用**。已 active 的少数 signal 会被过度放大 —— 例如 MB
   planning 的 3 个 signal 会独自决定 TJ / SD 的大部分得分,candidate
   整体评估等同于只测 MB 的 Stage1/3/4 + MC 表达能力。

### V5.0 Composite 结论

**当前生产环境下,47 signal 矩阵中 13 个 ACTIVE(含 sWritingQuality ACTIVE-partial,
Erratum #1),覆盖约 27.7%。**
**Composite 分数会稳定产出(不崩溃),但内容失真严重:**
- 反映 "候选人 MB planning + standards + audit + MC 表达" 4 块能力。
- **无法反映 P0 思辨 / MA 多角色推理 / MD 系统设计 / MB 实际 Cursor 行为 / 自我评估**。
- AE 维度实际上是 "MB 文档 AI 治理的骨架" 的 proxy,**没有 AI 使用行为**的
  实测信号,这是 V5 最核心的差分卖点(vs V4)却完全失效。

---

## 第 4 部分 · V5.0 ship judgment

### Steve 的 decision rule(brief 原文)

> 如果 broken > 3,考虑延迟 V5.0 发布。

**实际 broken = 15,unimplemented = 19,合计 failing 34 个 signal(Erratum #4 修订 — 原计 16 broken 含 sWritingQuality,重分类 ACTIVE-partial 后降至 15)。**

**判断:强烈建议延迟 V5.0 发布,或重新定义 V5.0 scope。**

### 两种可行路径

#### 路径 1 · 严格 scope 修复(V5.0 推迟到 production-complete)

**执行**:把 Cluster A / B / C / D 的全部缺失作为 V5.0 must-fix。工作量估算:

| Cluster | 工作量 | Owner(建议) | 新 Task |
|---------|-------|--------------|---------|
| A(behavior:batch handler) | 1.5-2 天 | Backend | 独立 Task "Task 18.1 · behavior:batch ingest" |
| B(finalFiles / finalTestPassRate persist) | 1 天 | Backend | Task 18.1 同 PR(两者共享 submission snapshot 机制) |
| C(P0/MA/MD 接入) | 3-4 天 | Frontend + Backend 双方协作 | "Task 18.2 · 候选人流程数据管线" |
| D(self-assess handler) | 0.5 天 | Backend | Task 18.2 同 PR |
| Fixture re-calibration | 1 天 | Backend | A7 audit Option A 裹挟 |
| **合计** | **7-8 天 elapsed(multi-agent 并行约 4-5 天)** | 双 agent | 2 个新 Task |

当前 V5.0 剩余 runway **15-17 工作日**(Steve 之前的 estimate),其中已安排
Task 14 / 15 / 17 cleanup / A1 sSelfCalibration / Task 18/19/20/21。新增
Cluster A/B/C/D 会吃掉 runway 一半,**V5.0 延期至少 1 周**。

#### 路径 2 · 重新定义 V5.0 scope(MB-first pilot)

**执行**:承认 V5.0 只是 MB + MC 的 vertical pilot,P0/MA/MD/SE 作为 V5.1
full-candidate-flow 发布。

**scope 调整**:

- V5.0 发布仅承载 MB + MC 两个模块(13 ACTIVE signal,含 sWritingQuality
  ACTIVE-partial,作为 scoring 基础 — Erratum #1)
- suite 定义临时改为 "mb_cursor_only"(可选)或保留 full_stack 但明示 P0/MA/MD
  维度为 N/A rescaling
- Golden Path 测试 fixture 相应缩减 module 覆盖
- V5.1 restore P0 + MA + MD + SE 接入

**代价**:

- 市场定位 downgrade(V5 "Cursor 全流程评测" → V5.0 "MB Cursor 单模块")
- 已完成的 P0/MA/MD signal 开发成果在 V5.0 "冻结"
- AE 维度在 V5.0 仍然几乎空白(MB Cursor behavior 全 broken)→ AE 能否作为
  维度对外展示需 Product/Steve 再判断

#### 路径 3 · Ship-as-is + 明示文档警告(NOT 推荐)

**执行**:

- 不修 Cluster A/B/C/D
- 在 README / 对外 deploy note 中明示 "V5.0 scoring 仅覆盖 MB-doc + MC
  signal,其余维度为占位"
- 所有 P0 / MA / MD 页面隐藏 scoring 或显示 "未评估"

**风险**:

- 第一批候选人体验极差:P0 / MA / MD 页面本身可进入,但 UI 看似正常,实际
  submission 丢失。数据管线断链不可见,候选人无法察觉。
- 报告 page 会展示 12 signal 评估出的 composite,但报告的"维度覆盖"说法
  严重偏差真实能力。
- Calibration 团队解读 null 时会混淆 "candidate didn't try" vs "system
  didn't capture"。

### 推荐决定

**推荐:路径 1(严格 scope 修复)**。理由:

1. **V5 的产品 promise 就是 "Cursor 全流程 AI-assisted 候选人评测"**。
   AE 维度 14 中仅 4 ACTIVE(MB Stage1 + sAgentGuidance,均为"文档型 AI
   governance"),**Cursor 行为实测 6 + Stage2-exec 3 + MD 1 = 10 条全部
   BROKEN / UNIMPL**(Erratum #3)。"AI-assisted 候选人"核心卖点零签到,
   发布出去对品牌 / 客户信任损耗远高于延期 1 周的机会成本。
2. **34 个 signal failing 不是可接受的"debt"水平**(Erratum #4:原 35)。它不是几个 edge case,
   是整个模块(P0 / MA / MD / SE / MB Cursor behavior)的 end-to-end 断链。
3. **Cluster A (behavior:batch) 是可以一人一周内搞定的工作量**。不像 Cluster C 
   需要双 agent 协作,Cluster A 和 B 可由 Backend 在 1 个 3-day Task 内
   完成,工程上可执行。
4. **路径 2 的"定义切换"成本也不低**:suite 定义 / fixture / Golden Path /
   对外材料 / 客户沟通全要改,加起来 1-2 天。但这些成本是"为发布而发布"
   的损耗,不产生信号覆盖。
5. **路径 3 风险最高,观察值:V5 防御文档系统(observations + backlog)的
   精神就是"延期的事项要明示且负责到底",ship-as-is 直接违背。**

**次推荐:路径 2(如果 Steve 判断 V5.0 必须按期上线)**,配合 scope
downgrade + 客户沟通材料准备。

---

## 第 5 部分 · Pattern H 提议正式化

A7 audit 第 7 部分列过 "新 Pattern 候选:test ≠ production",暂计 1 次观察值。
本 audit 新增以下 cluster 级证据,命中 ≥3 次可升级为 Pattern:

**命中实例**(本 audit 发现):

1. **sDecisionLatencyQuality**(A7 audit 记录):signal 单元测试 + Golden Path
   fixture 双绿,但 server behavior:batch ingest 缺失 → 生产永远 null。
2. **Cluster A 批量实例**(本 audit)— 11 个 MB editorBehavior signal 都是
   单元测试绿 + fixture 绿 + 生产 null,同一断链来源。
3. **sMetaCognition**(本 audit)— SelfAssessPage unit test 绿(mock socket
   emit 成功),server handler 未登记,ack 永远不回。fixture 直构 selfAssess
   字段。
4. **sPrecisionFix / sChallengeComplete / sIterationEfficiency**(本 audit)
   — fileSnapshotService.persistToMetadata 的单元测试已经验证函数本身功能,
   但 production call site 从未接入。
5. **Phase 0 / MA / MD signal 全体**(本 audit)— 单元测试通过 + fixture
   直构模块 submission → 生产模块根本没接 socket/REST。

**Pattern H 定义草案**(命名建议 "production-ingest gap"):

> Signal / 功能的单元测试通过,Golden Path / fixture 测试通过,但生产环境
> 下的数据源头断链(client emit 未发出、server handler 缺失、persistence
> 未接入),因此生产永远得到 null 或空输出。fixture 通过"直构数据"绕过
> ingest layer,造成"测试绿 == production ready"的假象。

**升级阈值达成**:本 audit 单次发现 ≥5 独立 cluster 实例(不是同一个 bug
的重复),满足 ≥3 次阈值,**推荐正式纳入 Pattern 清单(作为 H)**。

**防御 checklist 追加建议**:

> 任何 signal / 功能交付前,除单元测试 + fixture 测试 + integration 测试之外,
> pre-verify 阶段必须 grep client side `socket.emit` / `fetch` / `api.post` 对应
> 事件名,再 grep server side `socket.on` / `app.post` 对应 handler。双向断链
> 直接触发 Pattern H 的 stop-for-clarification。

---

## 第 6 部分 · 配套文档更新计划

本 audit 落地后同 PR 追加:

### 6.1 `cross-task-shared-extension-backlog.md`

追加 "V5.0 Signal Production Gap — Must-fix cluster" 章节,列出 Cluster A/B/C/D
的 4 个必做 Task / PR。级别标 "必然"(V5.0 不修则无意义发布)。

### 6.2 `CI_KNOWN_RED.md`

新增 "V5.0 Signal Production Gap"(Critical-Release-Blocker)章节,按发布影响
等级整理 15 broken + 19 unimplemented signal(Erratum #4 修订,原计 16)。推动进入 CI "Signal Production
Readiness Gate" 概念(V5.1 落地)。

### 6.3 `observations.md`

追加 observation #068 —— Pattern H 升级为正式 pattern,引用本 audit 的
Cluster A-D + A7 audit 的 sDecisionLatencyQuality 作为证据。

### 6.4 `field-naming-glossary.md`

**不修改**(本 audit 的字段引用已 align canonical)。

### 6.5 Frontend UI 提示(可选,路径 1 + 2 同适用)

在 P0 / MA / MD / SelfAssess 页面添加"本次作答数据尚未接入,V5.0 发布前
会补齐"的 info banner,降低候选人体验混淆。此项可作为 Task 18.2 scope 内。

---

## 附录 A · 验证本 audit 的 reproducibility

### 47 signal 注册 count

```bash
rg "EXPECTED_SIGNAL_COUNT\s*=" packages/server/src/signals/index.ts
# 命中:L69 `export const EXPECTED_SIGNAL_COUNT = 47;`
```

### Cluster A:server behavior:batch handler 缺失

```bash
rg "'behavior:batch'|socket\.on.*behavior" packages/server/src
# 命中 0(非 archive 代码)
```

### Cluster B:persistToMetadata 从未被 production 调用

```bash
rg "persistToMetadata\(" packages/server/src
# 命中 4 行:定义 + 2 测试 + handler 文档注释,0 production call site
```

### Cluster C:Phase 0 / MA / MD 零 emit

```bash
rg "socket\.emit|getSocket\(\)\.emit|emit\s*\(" \
   ~/Codelens-v5-frontend/packages/client/src/pages/Phase0Page.tsx \
   ~/Codelens-v5-frontend/packages/client/src/pages/ModuleAPage.tsx \
   ~/Codelens-v5-frontend/packages/client/src/pages/ModuleDPage.tsx
# 命中 0
```

### Cluster D:self-assess handler 缺失

```bash
rg "self-assess" packages/server/src | grep -v archive | grep -v "\.test\."
# 命中 0 production handlers
```

### 各 signal source path

```bash
rg "input\.submissions\." packages/server/src/signals
# 命中 47 signal 各自的 source field 表达式
```

---

## 附录 B · Matrix 生成方法

- Signal 注册列表:`packages/server/src/signals/index.ts` 47 个
  `registry.register(...)` 调用 — 手工核对完毕。
- Source field:每个 signal `compute(input)` 函数体 grep `input.submissions.`
  提取的最底层路径。
- Client emit:frontend clone `/Users/stevezhu/Codelens-v5-frontend` 的 pages
  + hooks grep。
- Server handler:`packages/server/src/socket/*.ts` + `packages/server/src/routes/*.ts`
  +  `packages/server/src/services/**/*.ts` grep `socket.on` / `router.(post|get)`。
- Persistence path:对每个 handler 追踪到最后的 `prisma.session.update` / `mb.service`
  函数调用。

---

**文档状态**:完成。等 Steve 阅读后做 V5.0 ship judgment(路径 1 / 2 / 3)。
