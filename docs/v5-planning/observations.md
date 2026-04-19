# Multi-Agent V5 Observations (2026-04-17 → 04-18)

> 目的:把 2 个 agent(Backend 4.7 + Frontend 4.7)在 V5 开发中的重要 pattern / 失误 / 设计洞察 / 工程纪律 沉淀成独立文档。
> 这是**单次 backfill**,整合 Day 1-2 的 30+ PRs 产出。
> 未来 observations 应在 PR body 产生时**同时**追加到本文件,不再等累积。

## 编号约定

- `#NNN` 连续编号,不重置
- 每条 observation 有 `category`(见下方分类)+ `trace`(PR # / commit hash 或 session timestamp)
- 多次命中的 pattern 在最后引用"原始 observation 编号"避免重复描述

## 分类

- `meta-pattern`:命中多次的 Claude coordinator 失误类别(A-F)
- `agent-pattern`:Agent(Backend / Frontend)表现出的稳定工程行为 pattern
- `signal-candidate`:V5.2+ 潜在信号的行为模式
  - **2 次**:记录(single observation,不 formalize)
  - **3-4 次**:cluster candidate(观察更多案例)
  - **≥5 次**:formalize candidate(V5.2 正式纳入)
- `defense-mechanism`:pre-verify / stop-for-clarification / self-merge 判断等 agent 防御行为
- `design-insight`:项目级设计洞察
- `cross-task-gap`:Task 之间发现的 shared 扩散 / interface 不对齐
- `discipline`:scope discipline / cleanup / 纪律性行为

---

## Day 1 (2026-04-17, PRs #17-35)

### #001 — `defense-mechanism` Pre-verify 挡 V4-default-copied 假设(Pattern A)
**trace**: PR #17 (Task 3 Frontend)
Frontend Task 3 pre-verify 发现 V4 的某些前置 TypeScript config 并未复制到 V5,Claude brief 假设"A 类已复制"。Stop-for-clarification。
命中:**Pattern A — V4 前置已复制 default FALSE**(之后累计 6 次)。

### #002 — `agent-pattern` Backend Task 1 shared types 一次性交付 + 自 merge
**trace**: PR #17 (Backend Task 1)
Backend 把 V5Session / V5Submissions / V5Grade / V5Dimension 等 14 个 core types 在单 PR 交付,清晰 export。自 merge precedent 建立("packages/shared/** → self-merge OK")。

### #003 — `signal-candidate` sScopeAwareness 第 1 次命中
**trace**: PR #23 (Backend Task 5.5)
Backend 主动补 server 入口 `packages/server/src/index.ts` 不在 Task 5 brief,但解决 ERR_MODULE_NOT_FOUND 让 CI 可跑。scope 延伸但在 Task 5 问题域内。

### #004 — `cross-task-gap` ws.ts hotfix
**trace**: PR #36 (Backend hotfix)
Task 12 Backend 交付时发现 ClientToServerEvents 少 8 个 v5:mb:* 事件 + 4 个 response 事件,独立 hotfix PR #36 补齐。此时暴露 **Pattern B — Cross-task shared extension** 第 1 次命中(后续累计 3 次)。

### #005 — `signal-candidate` sContractRespect 第 1 次命中
**trace**: Backend Task 6-7 (PR #27 / #31)
Backend 发现 Prompt Registry seed key 命名和 Round 3 Phase 0 Task 4 预期不一致。Backend 主动保留**seed key 命名原样**,不凭"合理"改,在 PR body 注明差异等 Steve confirm。

### #006 — `agent-pattern` Frontend Task 2 超预期完成度
**trace**: Frontend Task 2 (session 早期)
Task 2 Section Registry 预期 `3-5 panel + 骨架`,实际交付 `13/13 panel 全实装 + ReportRenderer + ReportViewPage + 3 fixture + 14 tests`。Frontend 主动把"可预见的后续 Task"融入当前 scope。

### #007 — `defense-mechanism` Task 7.6 awaiting review(不 self-merge)
**trace**: PR #45 (Frontend Task 7.6)
Frontend 按"self-merge with judgment"授权,**主动选 awaiting review**。理由:"orchestration seam where MA/MD pages also live"。**sScopeAwareness + sStopLossPerception** 的成熟判断。

### #008 — `signal-candidate` sReusePatternRecognition 第 1 次命中
**trace**: PR #40 (Frontend Task 7.3)
Task 7.3 InlineCompletionProvider **零改动复用** Task 7.2 的 `chat-visibility-tracker.ts`。Task 7.2 时 util 的 docstring 已写 "Task 7.3 will reuse this verbatim"。

### #009 — `signal-candidate` sContractAlignment
**trace**: PR #40 (Frontend Task 7.3)
Monaco CancellationToken 实现 debounce + AbortController 负责 socket-response 取消。两个取消机制**分工清晰**,不混用。

### #010 — `agent-pattern` Task 7.3 Monaco 0.55 API upgrade serendipity
**trace**: PR #40 (Frontend Task 7.3, commit e8c4750)
Frontend 按 brief 写第一版发现 Monaco 0.55 的 `freeInlineCompletions` rename,**主动 refactor** 到新 `handleEndOfLifetime` API。**sInitiativeBeyondBrief**。

---

## Day 2 (2026-04-18, PRs #36-53)

### #011 — `meta-pattern` Pattern C 第 1 次命中:`aiClaimDetection` vs `aiClaimVerification`
**trace**: PR #39 (Backend Task 13a, commit 390242d)
Backend 启动前发现 Claude brief 里 signal 名 `aiClaimDetection` 和 shared 类型 `aiClaimVerification` 不一致。**Pattern C — 字段名相似导致 Claude 混淆**。

### #012 — `signal-candidate` sStopLossPerception 第 1 次命中
**trace**: PR #39 (Backend Task 13a)
Task 13a Backend pre-verify 发现 `V5Phase0Submission.aiClaimVerification` 字段在 shared 不存在,主动触发 **retroactive shared fix + awaiting review** pattern。

### #013 — `meta-pattern` Pattern D 第 1 次命中:Interface ≠ algorithm field
**trace**: PR #39 (Backend Task 13a)
Backend 发现 `aiClaimedFeatures` 在 interface 声明但算法不读,决定"**保留 interface 字段 + source comment 注明**"而非删除。

### #014 — `defense-mechanism` Option 2 local narrow cast
**trace**: PR #41 (Backend Task 13b, commit 74baf67)
`migrationScenario` 字段未在 `MAModuleSpecific` shared 扩展(Task 10 owner deferred)。Backend 选 "Option 2: local narrow cast + cross-task-shared-extension-pending observation",**在 Task scope 内解决,不越界**。

### #015 — `meta-pattern` Pattern E 第 1 次:memory ≠ filesystem truth
**trace**: PR #41 (Backend Task 13b pre-commit)
Claude 提示 observations.md 编号应从 #022 起,Backend grep filesystem 发现实际是 #010 起。**Pattern E**。

### #016 — `signal-candidate` sLocalFirstPersistence 第 1 次命中
**trace**: PR #45 (Frontend Task 7.6)
`setModuleSubmission('mb', ...)` 先本地写,再 socket emit。UX 立即响应,socket 异步。

### #017 — `signal-candidate` sTypeAsSecurityBoundary 第 1 次命中
**trace**: PR #43 (Frontend Task 7.5, commit e37f046)
Task 7.5 ViolationAuditPanel Props 窄化为 `{ code, aiClaimedReason? }`,避免 `isViolation / violatedRuleId` groundTruth 通过类型泄漏到 DOM。**类型系统作为安全契约的硬边界**。

### #018 — `meta-pattern` Pattern C 第 2 次:`aiClaimedReason` vs `explanation`
**trace**: PR #43 (Frontend Task 7.5)
Frontend pre-verify 发现 `MBViolationExample.aiClaimedReason` 在 brief 但 shared 实际是 `explanation`。

### #019 — `agent-pattern` `parseRulesFromContent` 10 行 regex 简洁实现
**trace**: PR #43 (Frontend Task 7.5)
用 10 行 regex 覆盖 bullet / numbered / heading 3 种 markdown 格式。**不加外部 library,不 over-engineer**。**sMinimalImpactImplementation**。

### #020 — `cross-task-gap` CI drift 暴露 main 上 infra 洞
**trace**: PR #43 (Frontend Task 7.5 observation)
Backend Task 13b 刷绿 server test 后,下游 e2e + prompt-regression 第一次"真正跑起来",暴露 main 上**一直存在但未被发现**的 infra 洞。**CI 副作用可见性 pattern**。

### #021 — `signal-candidate` sTypeAsSecurityBoundary 第 2 次:Task 8 expectedSubModules 剥离
**trace**: PR #46 (Frontend Task 8, commit c1d7b69)
MD Frontend 主动识别 `expectedSubModules`(参考答案)**绝对不能发给候选人**,在 mock 里剥离到 fixture 独立区。**2 次 = 记录**(需要第 3 次进 cluster candidate)。

### #022 — `signal-candidate` sContractRespect + sDeferredImplementation 组合
**trace**: PR #46 (Frontend Task 8)
MD Frontend 识别 `v5:md:submit` socket event **不在 ws.ts**(Backend Task 14 owner),**不扩 shared,不造 workaround**,只做 local state update,PR description 明确等 Backend Task 14。

### #023 — `meta-pattern` Pattern B 第 2 次:Task 14 ws.ts 扩展可预见
**trace**: session observation Day 2 evening
Task 8 merge 后 Claude 发现 Backend Task 14 需扩 ws.ts v5:md:submit event 是**可预见的 cross-task shared 扩展**。Pattern B 第 2 次,此时**可预防性发现**。

### #024 — `agent-pattern` Backend Task 13c 自拆 7 commits
**trace**: PR #44 (Backend Task 13c, commit 7bbebb8)
23 MB signals,Backend 自然分拆为 7 commits。**commit granularity clarity** — future bisect 容易找到特定 signal 的 regression。

### #025 — `meta-pattern` Pattern F 第 1 次:Task 13c "18 signals" 实际 23
**trace**: PR #44 (Backend Task 13c)
Claude brief 里写 "MB 18 signals"(凭记忆粗估),Backend 按实际 list 交付 23。**Pattern F**。

### #026 — `agent-pattern` LLM whitelist lazy-imports 修复
**trace**: PR #47 (Backend Task 13d, commit 2f039f7)
Backend 主动解决 llm-helper.ts env 验证导致的 test crash,不在 brief scope。**sScopeAwareness 延伸**。

### #027 — `signal-candidate` sScopeDiscipline + sStopLossPerception 组合
**trace**: PR #45 (Frontend Task 7.6)
Frontend 主动选 "awaiting review" 的判断 **符合 Task 7.6 是 orchestration seam**。识别"本 Task 的 review 额外成本低,未来 bug 影响面大"。

### #028 — `meta-pattern` Pattern F 第 2 次:Task 2 完成度估错
**trace**: Frontend Task 11 pre-verify (before PR #50)
Claude Task 11 brief 估 Task 2 "只做 registry + 3-5 panel",实际 13/13 panel。

### #029 — `design-insight` Frontend Task 11 revised
**trace**: PR #50 (Frontend Task 11, commit b81db5e)
Task 11 pre-verify 发现 Task 2 超预期后,Claude **重新估工** 从"3-4 天"缩到"4-6 小时"。**Frontend pre-verify catch 让 Task 11 避免了冗余工作**。

### #030 — `agent-pattern` Task 11 PDF export 实现选择
**trace**: PR #50 (Frontend Task 11)
Frontend 选 `html2canvas` + `jsPDF native clip`(负 y-offset 多页),**避免 canvas tiling 的复杂度**。

### #031 — `design-insight` Task 11 fixture 命名保留决策
**trace**: PR #50 (Frontend Task 11)
Frontend 保留 `sPlus-architect / a-fullstack-boundary / b-fullstack-danger` 现有命名而非改 Liam/Steve/Max:
- 现 fixture 对应 scoring.service.test.ts 测例,有溯源价值
- Liam/Steve/Max 属于 Task 17 Golden Path 语义,**两组 fixture 并存**

### #032 — `meta-pattern` Pattern A 第 6 次:scoreSession orchestrator 假设存在
**trace**: PR #51 (Backend Task 17 pre-verify Blocker #1)
Task 17 Claude brief 假设 `scoreSession(session, suite)` 已实现,Backend pre-verify D **grep zero 结果**。

### #033 — `meta-pattern` Pattern D 第 3 次:scoring.service.ts 文件头 TODO 未读
**trace**: PR #51 (Backend Task 17 pre-verify Blocker #2)
Signal 0-1 vs threshold 0-100 scale mismatch。`scoring.service.ts` 文件头 L10-11 **明确注释** "Task 13 实现的信号采用 0-1 scale,需要这里乘 100"。Claude brief 未 view 该文件头。

### #034 — `defense-mechanism` Task 17 Backend 5 gaps 一次 stop
**trace**: PR #51 (Backend Task 17 pre-verify revised)
Backend 发现 5 个独立 gap(2 个最大 blockers + 3 个 architectural gaps)。**一次性报 5 个,每个有 α/β/γ 建议**。

### #035 — `agent-pattern` Task 17 V5.0 gate 成熟判断
**trace**: PR #51 (Backend Task 17 deliverable) + Task 17b confirmation
Backend 对 Task 17b 执行方案理解 **6 条核心方法 + 主动加入 "diagnostic test merge 前删除"**。**sCleanupDiscipline**。

### #036 — `design-insight` Task 17 Golden Path 诊断数据展示了系统性问题
**trace**: Backend Task 17 diagnostic report (gp-diagnostic.md uploaded)
Diagnostic report 揭示非系统性偏低,是**3 个同值 signal + fixture 文本不 intentional**:
- 70% — Fixture marker-intentional 设计缺失
- 20% — 其他 signal 内容丰富度不足
- 10% — Emma null(fail) 字段缺失

**V5 scoring pipeline 技术架构 100% 正确**。

### #037 — `signal-candidate` sLocalFirstPersistence 第 3 次 → cluster candidate
**trace**: PR #48 (Frontend Task 9, commit 6cba7ae)
`setModuleSubmissionLocal('selfAssess', ...)` 再次 先本地写,socket emit 延后。**3 次命中**(Task 7.6 / 8 / 9),cluster candidate 阶段。

### #038 — `agent-pattern` Task 9 session.store.getState() inside useMemo
**trace**: PR #48 (Frontend Task 9)
React + Zustand 优化 pattern。**sReactStateMinimalism**。

### #039 — `defense-mechanism` Task 12a Module C route stale catch
**trace**: PR #53 (Frontend Task 12a, commit 024066f)
Frontend 手工走 candidate flow 发现 `/exam/:id currentModule='moduleC' 渲染 ModulePlaceholder 而非 ModuleCPage`。**发布前炸的 bug**。

### #040 — `defense-mechanism` Task 12a shareable link URL 错
**trace**: PR #53 (Frontend Task 12a)
Frontend 识别 adminApi.createSession 返回 `/share/report/:token` — 但 HR 会 paste 给候选人,**必须是 `/exam/:sessionId`**。

### #041 — `design-insight` Two-source truth smell
**trace**: PR #53 (Frontend Task 12a observation)
`session.store.moduleOrder` 和 `module.store.moduleOrder` 双源。**V5.1 architectural debt**。

### #042 — `design-insight` ExamRouter loadSession 所有权 clarity
**trace**: PR #53 (Frontend Task 12a observation)
`ExamRouter owns loadSession, children only subscribe`。**React 组件树的信任链**。

### #043 — `cross-task-gap` CI drift 累计 5+ merges
**trace**: PR #53 (Frontend Task 12a observation)
e2e + prompt-regression **在 main 红 5+ merges**。Task 17 owner 需修或 mark continue-on-error。

### #044 — `agent-pattern` Task 17b 方案理解质量
**trace**: Backend Task 17b confirmation (session Day 2 late)
Backend Task 17b confirm 6 条核心方法 100% 命中 + 主动加 "diagnostic test 删除"。

### #045 — `meta-pattern` Pattern C 第 4 次:`sDecisionPauseQuality` vs `sDecisionLatencyQuality`
**trace**: A7 audit PR #56 (commit 96def46) + v5-signal-production-coverage audit
**category**: Pattern C naming mismatch
V5.0 补齐清单 PDF 写 "A7 sDecisionPauseQuality" 提议新 signal;agent pre-verify grep 发现 Task 13c Round 3 已实装 `sDecisionLatencyQuality`(同语义)。Pattern C 命中 +1 次(累计 4 次)。Pre-verify 100% catch,未进入实装。决议:codebase 保留 `sDecisionLatencyQuality`,PDF 命名误记录为 historical noise(不回改)。

### #046 — `meta-pattern` Pattern F 第 3 次:Signal 总数 47 vs brief 48
**trace**: v5-signal-production-coverage audit(本文件)
**category**: Pattern F 数字不精确
Brief "48 signals",codebase `EXPECTED_SIGNAL_COUNT = 47`(`packages/server/src/signals/index.ts` L69)。累计 F 命中 5 次(原 4 次 + 本次)。Audit 全程按 47 计算,第 1 部分矩阵 header 显式注明。

### #047 — `meta-pattern` Pattern H 正式化:Production-ingest gap(test ≠ production)
**trace**: A7 audit PR #56 + v5-signal-production-coverage audit
**category**: 新 Pattern H 命名并登记
本 audit 单次发现 4 个独立 cluster(behavior:batch 缺失 / persistToMetadata 无 call site / P0+MA+MD 零 emit / self-assess handler 缺失),共 35 个 signal 生产失效。单元测试 + Golden Path fixture 均绿,但 production ingest 链路断,fixture 通过直构数据绕过。升级阈值(≥3 cluster 实例)达成。

**Pattern H 定义**:Signal / 功能的单元测试 + 集成 fixture 测试双绿,但
生产环境下的数据源头断链(client emit 未发出、server handler 缺失、persistence 未
接入),因此生产永远得到 null/空输出。fixture 直构数据绕过 ingest layer,造成
"测试绿 == production ready" 假象。

**防御 checklist 追加**:任何 signal / feature 交付前,pre-verify 除单元测试 +
fixture 测试之外,必须 grep client side `socket.emit` / `api.post` 对应 event /
endpoint,再 grep server side `socket.on` / `router.*` 对应 handler。双向断链
触发 Pattern H 的 stop-for-clarification。

### #048 — `agent-pattern` A7 audit 触发 broader production coverage audit
**trace**: A7 audit PR #56 → v5-signal-production-coverage audit(本文件)
**category**: Audit as investigation
A7 audit 原 scope 为 0.2 天单 signal calibration check,pre-verify 发现 server
handler 缺失后 Steve 授权扩大到全 47 signal production coverage audit。结果是
发现 74.5% signal failing,V5.0 ship judgment 需重新判断。"Audit 从 small scope
涨到 ship-blocking investigation" 展示了 pre-verify 机制对系统性 debt 的
拉出能力。

---

## Meta-pattern 累计统计(Day 1-2)

| Pattern | 描述 | 命中次数 | Observation IDs |
|---------|------|----------|-----------------|
| A | V4 前置已复制 default FALSE | 6 | #001, #032, + 4 次(未一一编号) |
| B | Cross-task shared extensions 发现过晚 | 3 | #004, #014, #023 |
| C | 字段名相似导致 Claude 混淆 | 4 | #011, #018, + 1 次, #045 |
| D | interface 字段 ≠ algorithm 消费字段 | 3 | #013, #033, + 1 次 |
| E | Claude memory ≠ filesystem truth | 1 | #015 |
| F | Claude 凭记忆粗估 list 数量 / 完成度 | 5 | #025, #028, + 2 次(估工类), #046 |
| **H** | **Production-ingest gap:test 绿 ≠ production ready** | **≥5** | **#047**(cluster 证据:4 个独立根因 × 35 signal 实例) |

**总 violations**:22+ 次 / ~100 指令 = ~22%
**防御率**:agent pre-verify 100% catch(零代码 landed with error)
**V5.0 发布前提**:Claude coordinator brief 质量提升是唯一 unblock 路径

---

## Signal candidates 累计(阈值:2 = 记录 / 3-4 = cluster candidate / ≥5 = formalize)

| Signal | 描述 | 命中次数 | Observation IDs | 状态 |
|--------|------|----------|-----------------|------|
| sLocalFirstPersistence | 本地写先于 socket emit | 3 | #016, #021(关联), #037 | Cluster candidate(需 4-5 次) |
| sTypeAsSecurityBoundary | Props 窄化防 groundTruth 泄漏 | 2 | #017, #021 | 记录(需第 3 次) |
| sContractRespect | 契约尊重 + 不 workaround | 3 | #005, #022, + Task 14 ws.ts 预见 | Cluster candidate |
| sStopLossPerception | stop 成本 < silent 成本判断 | 2 | #012, #027 | 记录 |
| sReusePatternRecognition | 预留复用点 + 后续兑现 | 2 | #008, #026 | 记录 |
| sScopeDiscipline | scope 守边界 + 不扩 | 3 | #014, #019, #027 | Cluster candidate |
| sCleanupDiscipline | Temporary artifacts 不留 main | 1 | #035 | 观察 |
| sReactStateMinimalism | React state 最简化 | 1 | #038 | 观察 |
| sInitiativeBeyondBrief | 主动升级 API 但不扩 scope | 1 | #010 | 观察 |
| sMinimalImpactImplementation | 简洁不 over-engineer | 1 | #019 | 观察 |
| sScopeAwareness | 识别 Task 内可解决但未在 brief 的子问题 | 2 | #003, #026 | 记录 |

## Future Observations 流程

Day 3 起,每个 PR body 的 "Observations" 章节内容**同时追加**到本文件对应分类。不再等 backfill。

**每个 observation 必须含**:
- `trace`: PR # / commit hash
- `category`: 分类
- 简述(1-3 句)
- 关联 observation IDs(如是 cluster 新命中)

# observations.md · batch append #075-#093

> **指令给 Steve**:将本文件**全部内容** append 到 repo 的
> `docs/v5-planning/observations.md` 末尾(现 #074 之后)。
> 不替换现有内容,只追加。
>
> **Batch context**:Day 3 Cluster fix sprint(Task 22-27 closed),
> 6 PRs merged(#63 / #66 / #67 / #68 / #69 / #70)。Pattern H 6-gate
> ladder closed,87.2% signal coverage。本批 19 条 observation 覆盖
> Day 3 全部工程 + meta 事件。

---

## Day 3 (2026-04-19, PRs #56-70)

### #075 — `agent-pattern` Backend stop-and-verify on PR #60 checklist adoption
**trace**: PR #60 (54222a7, checklist v2.1 Pattern H 规则 10+11 formalization)
Backend stop 回报 "checklist v2.1 synced",确认 Phase 2 前规则已在 context。不 silent 开工,先 acknowledge。**sChecklistCompliance** candidate(单次命中,观察)。

### #076 — `defense-mechanism` F-A15 β pattern seeding avoidance
**trace**: PR #62 (28805da, Frontend TransparencyStatement.tsx)
Frontend 主动 **拒绝** Claude brief 的 "CONTENT_ZH / CONTENT_EN 独立常量" α 路径,选 β inline zh+en 双语模式。理由:"避免 over-engineering for V5.1 migration"。**sMinimalImpactImplementation 第 2 次命中**(#019 / #076)→ 仍观察态,需第 3 次进 cluster candidate。

### #077 — `meta-pattern` Pattern C 第 5 次:Claude behavior:batch glossary prefix error
**trace**: Backend Task 22 pre-verify catch(PR #63 db8dfe5)
Claude glossary Event Naming 小节 **自写错**:`v5:mb:behavior:batch`,实际 codebase 是 `behavior:batch`(无 prefix,V4 legacy 保留)。Backend grep useBehaviorTracker.ts:122 catch。**Claude 自己污染 Pattern C 防御文档** — 这是 Pattern C 在 coordinator 自身的命中,比 agent 写错严重。**Pattern C 5 次命中累计**(#011 / #018 / #065 / self-assess:submit #Pattern C #4 / 本次)。

### #078 — `cross-task-gap` sessionId envelope gap · Pattern H lateral infrastructure grep
**trace**: Task 22 Phase 1 discovery
Backend Task 22 pre-verify 发现 client 实际 emit 的 envelope 是 `{ events }`(无 sessionId),server 需从 `socket.data.sessionId` 附加。这 **暴露一个横向基础设施 gap** — V5 所有 socket events 的 sessionId 注入方式未 formalize,Pattern H 防御需扩展到 "lateral infrastructure verification"(不只 vertical pipeline)。V5.0.5 backlog candidate:socket middleware 统一 sessionId injection。

### #079 — `agent-pattern` Frontend Task 12 Layer 2 audit (standby 时间有产出)
**trace**: Frontend standby during Backend Task 22
Backend Task 22 运行时(~1.5 天),Frontend 做 Task 12 Layer 2 pre-verify audit(read-only,3 Q deliverable)。结论:adminApi.types.ts shim 4 types 与 Task 15 预期 shared types 1:1 对齐,minimal gap。**standby 时间结构化利用的 precedent** — 未来 agent 多窗口协调时可复用此 pattern。**sStandbyProductivity** candidate(单次,观察)。

### #080 — `agent-pattern` Task 28+29 retrospective dispatch(Pattern H derivatives)
**trace**: Session Day 3 (post-Task 22 merge)
Task 22 merge 后 Backend 主动发现 2 个 Pattern H 衍生 bug:
- Task 28: `editorBehavior.chatEvents` path typo in mb.service(Task 13c 遗留)
- Task 29: `documentVisibilityEvents` timestamp 格式 V4→V5 未 migrate
两个都是 scope-independent,Backend 各自独立 PR self-merge(2-bug brief 我批了)。**agent 自发 Pattern H 二阶防御 working as intended**。

### #081 — `design-insight` Cluster-signal sparse matrix · audit report value
**trace**: PR #57 Production Coverage Audit + PR #59 errata
Audit report 按 signal × cluster × pipeline link 画 sparse matrix(47 signals × 4 clusters × 5 pipeline links),明确 34 signals production-null 的精确根因。**这类 sparse matrix 是 Pattern H 防御的 single-source-of-truth**,未来任何 new signal batch 都应先跑 audit 生成 matrix,再进开发。

### #082 — `defense-mechanism` Task 23 cross-Task regression defense(NEW finding)
**trace**: PR #66 77a5555 (Task 23)
Backend Task 23 在 pre-verify D 发现 **V5.0 release gate level regression**:原 run_test handler 会 whole-replace `session.metadata`,一旦 commit 会 wipe Task 22 刚 populate 的 editorBehavior。Backend 主动 scope-expand 修 spread-merge + strict field pick + editorBehavior skip(triple-layer defense)。**Pattern H 防御不只 "补缺失",还包括 "防破坏已存在"**。**sRegressionAwareness** candidate(单次,观察)。

### #083 — `meta-pattern` Pattern F 第 10 次:dual-shape bridge miss
**trace**: Task 24 brief draft (pre-Frontend-PR-#58-context integration)
Claude Task 24 brief 第一版假设 Frontend SelfAssessPage emit 的 shape 就是 V5 shape。Backend pre-verify 发现 Frontend 实际 emit V4 shape(`selfConfidence` / `selfIdentifiedRisk` / `responseTimeMs`),server handler 需做 normalize bridge。**Pattern F 第 10 次命中**(凭记忆/假设数据形状而非 grep)。Pattern F 累积从 6 → 10,位列**最频繁 pattern**(超 Pattern A 的 6 次)。

### #084 — `meta-pattern` Pattern D-3 candidate:dual-shape bridge intentional mismatch
**trace**: Task 24 implementation decision(PR #67 d16b738)
Task 24 有意保留 V4 shape emit + server 端 normalize(不改 Frontend)。这是 **intentional dual-shape bridge**,不是 D-1(interface ≠ algorithm)也不是 D-2(doc ≠ code),是 **D-3:"有意 cross-boundary shape mismatch · server 做 bridging"**。单次命中,观察。V5.0.5 candidate:考虑将 V4 legacy shape 标记为 deprecated,V5.1 统一 V5 shape emit。

### #085 — `defense-mechanism` Rule 13 Phase 1/2 pattern · Task 25 first validation
**trace**: Task 25 Phase 1 verify + Phase 2 implement (PR #68 71acf50)
Rule 13(Phase 1 read-only verify · Phase 2 implement after Claude confirm)在 Task 25 **first validation**。Phase 1 Backend 6 Q answers 零 STOP · Phase 2 零 re-ask。**Rule 13 工作机制:把 Claude brief 的 "precision assumption" 前移到 Phase 1 pre-verify,brief-to-code gap 零漂移**。防止 Pattern D-2 / Pattern F / Pattern A 在 implementation 时才暴露。

### #086 — `cross-task-gap` production hydration gap · Pattern H 3rd tier
**trace**: Task 25 Phase 1 finding #2 (scoring-orchestrator.service.ts:11-15)
Task 25 Phase 1 Backend 发现 `scoring-orchestrator.service.ts` 注释明确 "production hydration wrapper 待 Task 15 owner 实装"。当前 Cluster 22-27 signals 只在 Pattern H gate tests 跑,**production session-end scoring 不读 metadata.{moduleA,phase0,md,mb,selfAssess,moduleC}** top-level —— 读的是 V4 ghost `metadata.submissions.*`。Pattern H 3rd tier 风险:**test 绿 + pipeline 绿 ≠ production scoring 绿**。V5.0 release gate 硬需求:Task 15 hydrator 必须 read 新 top-level keys。Hydrator contract locked in Task 26/27 Phase 1 Q comments。

### #087 — `cross-task-gap` namespace ambiguity · metadata top-level vs submissions.*
**trace**: Task 25/26/27 Phase 1 shared concern
`session.metadata.submissions.*` 是 V4 envelope,V5 改为 `metadata.{moduleA,moduleD,phase0,mb,selfAssess,moduleC}` top-level。两套 namespace 并存期 Task 15 hydrator 必须做 **V4 ghost cleanup + V5 top-level read**,不能 silent 漏读。**SessionService metadata envelope cleanup** 加入 V5.0.5 backlog(观察 #075-backlog)。

### #088 — `design-insight` V5.0 release gate upgrade(post-Production-Coverage-Audit)
**trace**: Day 3 session-level decision
V5.0 release gate 从 "signals 技术实现完成" upgrade 为 "signals technical + production coverage audit + Cold Start Validation 三项全过"。**这个 upgrade 的驱动是 PR #57 audit 暴露的 74.5% signal production-broken**。未来 release gate 原则:**test 绿永远不等于 production 绿,必须 end-to-end 真实 socket session 验证**。

### #089 — `defense-mechanism` Rule 13 second+third validation · Task 26/27
**trace**: Task 26 PR #69 6cd3b33 + Task 27 PR #70 64dc7cd
Task 26 + Task 27 Phase 1 各自再次零 STOP、Phase 2 各自零 re-ask。Rule 13 **三次 validation**(Task 25/26/27)证明 Phase 1/2 pattern 在**不同复杂度 Cluster C 修复**下一致有效:Task 25(P0,greenfield V5-native)· Task 26(MA,4-round zod + last-write-wins)· Task 27(MD,LLM whitelist dual-block)。Rule 13 **formalized,non-candidate**。

### #090 — `design-insight` LLM whitelist Pattern H special handling template
**trace**: Task 27 PR #70 64dc7cd(D4 dual-block design)
Task 27 MD 是 V5 首个 LLM whitelist Pattern H gate(3/4 MD signals 是 LLM whitelist)。Backend 设计 **dual-block testing pattern**:
- **Block 1**:fallback tier assert(LLM call 失败时走 heuristic fallback,Pattern H gate 在 fallback path 也要跑)
- **Block 2**:LLM mock structural(mock LLM response shape,不真 call LLM,验证 structural contract)

**未来所有 LLM whitelist signal 的 Pattern H gate 应遵循此 dual-block 模板**。Pattern library 第 7 entry。

### #091 — `agent-pattern` Task 27 Phase 2 LLM dual-block 执行(Pattern H 6th gate 关闭)
**trace**: PR #70 64dc7cd
Task 27 Phase 2 执行中 Backend 正确落地 dual-block 设计:
- `md-se-signals.test.ts` 新增 Block 1(3 signals fallback tier coverage)
- `md-se-signals.test.ts` 新增 Block 2(LLM mock structural for sAiOrchestrationQuality / sConstraintIdentification / sTradeoffArticulation)
- Block 1 + Block 2 **独立 namespace**,互不 leakage
- Pattern H 6-gate ladder closed:MB ingest / MB persist / SE / P0 / MA / MD。

### #092 — `meta-pattern` Coordinator-agent cadence mismatch(new pattern candidate)
**trace**: Task 27 Phase 2 autonomous self-merge (2026-04-19T11:08:36Z)
Claude planning 为 Task 27 Phase 2 draft 3 个 safeguard(#186 tasklist sync / pre-Phase 2 self-check / PR preview checkpoint for LLM dual-block),**Backend 未执行 safeguard 2 和 3** 直接 self-merge。结果成功 · 但 coordinator-agent cadence 出现 mismatch:**Claude 预设 turn-by-turn 协调,Backend 48h+ 后进入 agentic 自主决策 cadence**。

Defense:未来需要 gate 的 checkpoint 必须 **在 dispatch brief 显式写 "Stop before merge, await Steve confirm"**,不能依赖 out-of-band 协调指令。**Pattern candidate I**(新):coordinator assumes synchronous cadence while agent is async。单次命中,观察。

### #093 — `discipline` CI reds as known-red convention · V5.0 release gate requirement
**trace**: Task 27 merge log + CI_KNOWN_RED.md
Task 27 merge 时 e2e + prompt-regression 红(per CI_KNOWN_RED.md baseline,do-not-block merge convention)。**Task 发布期是可接受的**,但 V5.0 Cold Start Validation 前必须 resolve。V5.0 release checklist 新增项:**CI green-up task**(Task 17 owner,Backend),不能带红 CI 发 V5.0。估计 1 工作日(e2e "No tests found" + prompt-regression "no promptfooconfig.yaml" 二者都是 infra 小修)。

---

## Meta-pattern 累计更新(post-batch 075-093)

| Pattern | 描述 | 命中次数 | 状态 | 严重度 |
|---------|------|----------|------|--------|
| A | V4 前置已复制 default FALSE | 6 | formalized | 中 |
| B | Cross-task shared extensions 发现过晚 | 3 | formalized | 中 |
| C | 字段名 / signal ID / **event 前缀**相似致 Claude 混淆 | 5 | **formalized**(Day 3 新增 event prefix 场景 #077)| 中 |
| D-1 | interface 字段 ≠ algorithm 消费字段 | 3 | formalized | 中 |
| D-2 | design doc ≠ actual implementation | 2 | cluster candidate | 中 |
| D-3 | **dual-shape bridge intentional mismatch**(新)| **1** | **观察**(#084)| 低 |
| E | Claude memory ≠ filesystem truth | 4 | formalized | 中-高 |
| F | 凭记忆粗估 list / 完成度 / 数据形状 | **10** | **formalized with strict enforcement** | **最高频** |
| G | Scope expansion by silent acceptance | 2 | cluster candidate | 中 |
| H | test 绿 ≠ production ingest intact | **6 clusters + 2 lateral**(#078, #086)| **formalized**(V5 开发期最严重)| **严重** |
| **I** | **Coordinator-agent cadence mismatch**(新)| **1** | **观察**(#092)| **中** |

**Pattern F 登顶**(10 次),超 A(6 次)+ H(8+ 次命中但 6 cluster main hits)。V5.1 Claude coordinator 自律性关注点应从 "Pattern A / D-2" 转向 "**Pattern F strict enforcement + Pattern I cadence awareness**"。

---

## Signal candidates 累计更新(post-batch 075-093)

| Signal | 描述 | 命中次数 | 状态 |
|--------|------|----------|------|
| sLocalFirstPersistence | 本地写先于 socket emit | 3 | cluster candidate(#016, #021, #037) |
| sContractRespect | 契约尊重 + 不 workaround | 3 | cluster candidate |
| sScopeDiscipline | scope 守边界 + 不扩 | 3 | cluster candidate |
| sSelfAuditQuality | agent 主动 audit 自己交付 | 3 | cluster candidate(#039, #049, #053)|
| sStopLossPerception | stop 成本 < silent 成本 | 2 | 观察 |
| sReusePatternRecognition | 预留复用点 + 后续兑现 | 2 | 观察 |
| sTypeAsSecurityBoundary | Props 窄化防 groundTruth 泄漏 | 2 | 观察 |
| sScopeAwareness | 识别 Task 内可解决但未在 brief 的子问题 | 2 | 观察 |
| sMinimalImpactImplementation | 简洁不 over-engineer | 2 | 观察(#019, #076)|
| **sChecklistCompliance** | Backend stop-and-verify checklist synced | 1 | 观察(#075)|
| **sStandbyProductivity** | standby 时间结构化利用 | 1 | 观察(#079)|
| **sRegressionAwareness** | 主动识别 cross-Task regression 风险 | 1 | 观察(#082)|

---

## Pattern library(7 entries post-batch)

1. behavior:batch ingest(Task 22)— external-origin event,β sessionId server-inject
2. v5:mb:submit + strict field pick + spread-merge regression defense(Task 23)
3. self-assess V4→V5 normalize + ack close loop(Task 24)— Pattern D-3 intentional bridge
4. phase0:submit V5-native + Pattern H 4th gate cross-Task preservation(Task 25)— Rule 13 first validation
5. moduleA:submit 4-round zod + 5th gate + last-write-wins(Task 26)— Rule 13 second validation
6. **moduleD:submit 6-field zod + LLM whitelist dual-block 6th gate(Task 27)— FIRST LLM whitelist Pattern H template for V5**
7. [pending Task 30: multi-event-type ingest pipeline — chatEvents/diffEvents/fileEvents]

### #094 — `meta-pattern` Pattern E 第 5 次:Day 2 late workspace→repo sync gap
**trace**: Day 3 housekeeping pre-commit catch (Backend Task 30 Phase 1 dispatch stop-for-clarification)
Backend 执行 Day 3 housekeeping 追加 #075-#093 时触发 count verify(预期 93,实际 67),grep diagnose 发现 #049-#074 整批从未 commit 到 repo filesystem。最可能根因:Day 2 late 前任 planning Claude 在 workspace 里 draft 了 #049-#074(Task 17b Phase 1-3 + V5.0 scope decisions + Pattern G formalization 等内容,transcript 可证),但 session 交接时未 git commit + push。当前 planning Claude 继承了 "observations.md 已到 #074" 的错误 mental model。

**影响评估**:
- Narrative text 丢失(26 条 observation 原文)
- Derivative value 保留:pattern statistics、rule updates、scope decisions 已消化到 checklist v2.1(PR #60)+ backlog(PR #61)+ glossary(PR #61),不依赖 original narrative
- Numbering gap(#049-#074)不影响 cross-reference(既有 defense docs 引用的 observation IDs 仍指向正确 pattern hits,fact base 未变)

**Pattern E 第 5 次累计**(#015 / #051 / #063 / #074 / #094),严重度升级 `中-高` → `高`。

**Day 3 防御加强**:
1. Claude 自律:每次交接必须 `git log --oneline -- docs/v5-planning/observations.md` verify commit 历史,**不信 workspace state,信 git log**(规则 6 扩展)
2. 每次 observation batch append 前跑 `tail -20 observations.md` 确认最后编号,与 append batch 起始编号是否连续(规则 4 扩展:numbering continuity check)
3. V5.0.5 backlog 候选:考虑写个 `lint-observations-numbering.sh` 脚本,CI 上跑,numbering gap = CI fail

**V5.0.5 backlog 新增项**:#049-#074 narrative text recovery(可 grep transcript archive 或前任 planning Claude workspace snapshot · 若还能找到的话 · 非紧急,不阻 V5.0)。

