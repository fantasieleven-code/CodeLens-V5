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
| C | 字段名 / signal ID / **event 前缀**相似致 Claude 混淆 | **6** | **formalized**(#096 glossary 自污染 phantom events) | 中 |
| D-1 | interface 字段 ≠ algorithm 消费字段 | 3 | formalized | 中 |
| D-2 | design doc ≠ actual implementation | 2 | cluster candidate | 中 |
| D-3 | **dual-shape bridge intentional mismatch**(新)| **1** | **观察**(#084)| 低 |
| E | Claude memory ≠ filesystem truth | 5 | **formalized + 严重度上调**(#094) | 高 |
| F | 凭记忆粗估 list / 完成度 / 数据形状 | **13** | **formalized with strict enforcement**(#095 三连 catch) | **最高频** |
| G | Scope expansion by silent acceptance | 2 | cluster candidate | 中 |
| H | test 绿 ≠ production ingest intact | **7 clusters + 2 lateral**(#078, #086, #097 7th gate 最强) | **formalized**(V5 开发期最严重) | **严重** |
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

### #095 — `pattern-F` 第 11/12/13 次:Task 30 Phase 1 三连 catch · Claude brief 字段名误判
**trace**: Task 30a Phase 2 brief draft 前 Phase 1 grep verify
Task 30 Phase 1 brief 推测 5 个 Cluster A 剩余 signal 的 input 字段(`fileEvents` / `diffEvents+testEvents` / `editSession 数据 unclear`),Phase 1 grep 实际 signal `.ts` 推翻 3 处:
1. **sFileNavigationEfficiency** 读 `editorBehavior.fileNavigationHistory`(brief 推测 `fileEvents`,Pattern F #11)
2. **sTestFirstBehavior** 读 `editorBehavior.fileNavigationHistory`(brief 推测 `diffEvents+testEvents`,实际 signal 看 file 导航 + tests/ path 命名,完全不读 testEvents — Pattern F #12)
3. **sEditPatternQuality** 读 `editorBehavior.editSessions`(brief 笼统说 "diffEvents",未提 editSessions 这个独立 namespace — Pattern F #13)

Pattern F 第 11/12/13 次累计 = 13 hits,继续坐 V5 开发期最高频 pattern 座次。**Defense validation**:Phase 1 grep-before-code 在 brief draft 阶段就 catch 了 3 处错误,**0 处 leak 到 implementation**。Rule 13 Phase 1/2 split 的 verify-only 设计正是 Pattern F 防御的最强机制。

### #096 — `pattern-C` 第 6 次:`field-naming-glossary` 自污染 phantom events
**trace**: Task 30a Phase 1 dual-direction grep
Glossary L220-221 列出 `v5:mb:chat:event` / `v5:mb:diff:event` 两条 row,标注 "Task 7.3 PR #40 已建立"。Phase 1 dual-direction grep 发现:**client / shared/ws.ts / server handler 全部 0 hits**。两个 event 名是 phantom — 真实 chat / diff event 走的是 shared `behavior:batch` envelope(Task 22 wiring,以 `event.type=chat_prompt_sent` / `diff_accepted` 等区分,server 在 `behavior-handlers.ts` 内部 dispatch)。

Pattern C 第 6 次(前 5 次:Pattern C #1-5 见 #077 + glossary L218 / L222 / L224 自纠注脚)。**严重之处**:glossary 是 V5 防御文档的 Tier-1 真值源(`pre-verify` 必 grep),自污染会让下游 brief 全部继承错误。Task 30a PR 顺手将 L220-221 替换为单条 `behavior:batch` envelope row(canonical event 名指向 Task 22 wiring),消除 phantom。

**Defense**:future glossary update 必须配 dual-direction grep verify(规则 10 已写,本次是规则 10 第一次顺手帮 glossary 自检的实例)。

### #097 — `design-insight` shared envelope 让 Pattern H 7th gate 成为最强 cross-Task gate
**trace**: Task 30a Phase 1 architecture discovery + Phase 2 implementation
Task 22 build 时设计了 shared `behavior:batch` envelope 作为 client → server 的 telemetry 通道,server-side dispatch 按 `event.type` 分流。Task 30a 复用此通道 → **scope 从原计划"4 handlers + 4 persist methods"压缩到"1 dispatch 扩展 + 4 persist methods"(-40% 工作量)**,实装 0.7 day 命中 brief day band 下沿。

更重要的副作用:**Pattern H 7th gate 成为 Pattern H 6 个前任 gate 中最强的一个**,因为单条 `behavior:batch` envelope 同时 fan-out 到 5 个 `editorBehavior.*` namespace(aiCompletionEvents + chatEvents + diffEvents + fileNavigationHistory + editSessions),Block 2 cross-Task regression 一次性验证 5 个 sibling namespace 不被新 dispatch 误覆盖。等价于把 Pattern H 第 1-6 gate 的"namespace preservation"维度乘以 5。

**Pattern H 第 7 entry**(`behavior:batch` 多 pipeline fan-out)。Pattern library 第 8 entry。

### #098 — `defense-mechanism` Rule 13 第 4 次 validation · Task 30a Phase 1/2 split
**trace**: Task 30a Phase 1 (verify-only deliverable) + Phase 2 implementation 0 surprise
Task 25 / 26 / 27 / **30a** Rule 13 Phase 1/2 split 第 4 次连续 validation。Task 30a 特殊性:**Phase 1 catch 3 处 Pattern F + 1 处 Pattern C** 以及 architecture re-scope(-40%),如果直接进 Phase 2 implementation 会:
- 至少 3 个 signal 读错字段(返回 null in production,silent failure)
- 至少 1 个 brief 引用 phantom event(misguide 下游 ws.ts cleanup)
- 估计多 4 个 handler scaffold 后 throw away(scope discovery 来太晚)

**累计 Phase 1 cost / value**(Task 25/26/27/30a):4 × 0.5 day = 2 day 成本 → 换得 ~0 implementation surprise + ~3 处 brief 错误前置 catch + 1 次 architecture pivot。Rule 13 **strongly formalized,单次成本 << 单次收益**。

**Defense library status**:Pattern A-I formalized + Rule 13 formalized,V5.0 防御体系 stable enough 进入 release prep window。

### #099 — `meta-pattern` Pattern C candidate + Pattern E 第 6 次:adminApi.types.ts comment drift · 双重 flag
**trace**: Task 15b Phase 2 §7 single-line comment fix

Brief §7 指 `adminApi.types.ts:3` 注释 "Aligned with Steve's Admin API spec (8 endpoints)" · 实际 V5 canonical spec = 7 endpoints(见 `packages/shared/src/types/v5-admin-api.ts`)。Squash fix `8 endpoints` → `7 endpoints`,对齐 Frontend Task 10 mock basis 与 Backend Task 15b 实装。

**双重 flag**:
1. **Pattern C candidate** — 数字语义漂移 · 类似 Pattern C #6(glossary 自污染 phantom event)但 severity 低(comment-only · 无 runtime 引用)· 暂列 candidate 待 V5.2 audit 归档。
2. **Pattern E 第 6 次** — brief §7 写 `adminApi.types.ts:3` · 实际 filesystem 在 line 5(header 多一行 blank + 一行 `*`)· brief line number 与 repo state drift。行号单行唯一 · pre-verify 按 grep 直接定位 · 未 silent "correct" · 明示 drift 纳入 observation(`feedback_verify_before_acting.md` 记忆项 post-formalize 后第一次实战 publicize)。

**Pattern E 第 6 次累计**(#015 / #051 / #063 / #074 / #094 / #099)· 严重度保持 `高`。**Pattern C candidate 第 1 次**(Pattern C formal 6 hits + 1 candidate)。

### #100 — `design-insight` ScoringHydrator DB-free seam 是 Pattern H defense 最佳 extension 点
**trace**: Task 15b admin.ts endpoint 4 wire `scoringHydratorService.hydrateAndScore(sessionId)`

Task 15a 交付时将 `ScoringHydratorService.hydrateAndScore(sessionId, options?)` 设计为 **DB-free orchestration seam**:入口只接 `sessionId` · 内部所有 DB 访问 + signal compute + orchestrator scoring 编排都藏在 service。Admin route endpoint 4 wire 只写 2 行:
```ts
const result = await scoringHydratorService.hydrateAndScore(sessionId);
return res.json(toAdminSessionReport(result, signalDefs));
```
route 0 DB access · 0 signal knowledge · 0 scoring policy · 纯粹的 shape adapt。

**Pattern H defense seam 价值**:任何未来 scoring extension(Task A1 sCalibration / Task A14a reliability / V5.1 retry UX)都可复用 seam → **新 route / CLI / job handler 只需 call `hydrateAndScore` + 自定义 response shape**,不必重复 DB query + signal registration + orchestrator wiring。**orchestrator / hydrator / registry 三级抽象被 seam 隔离** · 修改 scoring algo 不外泄 route · 新增 route 不污染 scoring。

**V5 codebase 最强 Pattern H seam 之一**(与 Task 22 `behavior:batch` envelope 并列)· 未来 Pattern H gate 扩展 fan-out 分析时参照本 seam 为模板。

### #101 — `pattern-F` 第 16 次:Task 29 cleanup miss `routes/shared-report.ts`
**trace**: Task 15b Phase 2 §5 β-delete audit

Task 29(V5 scope cleanup PR)处理了 `services/archive/v4/`(9 files)+ `seed.v4-archived.ts` 的 fence · 但 **遗漏** `routes/shared-report.ts`(V4 legacy route · 功能被 `/admin/sessions/:id/report` 覆盖)。Task 15b β-delete 补齐 · 同步从 `tsconfig.json` exclude + `TYPECHECK_EXCLUDES.md` table 移除对应 row。

**Pattern F 第 16 次累计** — 上轮 Pattern F #15 是 Frontend Task 30b Round 1 audit 自 catch 的 `sModifyQuality` input 字段漂移(Frontend self-caught · 0 leak)。Task 15b 发现 Task 29 miss 是 **被动 grep discovery**(brief §5 列 11 files · pre-verify grep 与 TYPECHECK_EXCLUDES cross-ref 捕捉到 shared-report 仍在 exclude list)。

**Defense validation**:`TYPECHECK_EXCLUDES.md` 作为 "V4 residue 清单" 发挥了预期作用 — 清单 row 未随 β-delete 同步 = Task owner 没跑闭环。本次闭合 Task 29 逾期 cleanup item · 不新增清单行。

**Pattern F 第 16 次累计**(13 + Frontend #14/#15 + 本次 #16)· 继续持有 V5 开发期最高频 pattern 座次。

### #102 — `defense-mechanism` Frontend Round 1 audit 自 catch · sScopeDiscipline + sSelfAuditQuality 双命中
**trace**: Frontend Task 15a Round 1 audit self-correction(Backend Snapshot G 回顾)

Frontend Round 1 audit 发现自己 `adminApi.ts` 实装的 pages 计数 undercount(预期 6 · 实际 5)· 未等 Backend catch 就主动 Snapshot self-correct 更新 mock basis + pagination 配置。**两个 signal 同时命中**:
- **sScopeDiscipline** — audit scope 严格贴 brief 不扩 · 发现 undercount 后不扩展到 "顺手重构 pagination"
- **sSelfAuditQuality** — audit 质量过关 · catch 了 Backend 会在 Round 2 才发现的 shape mismatch

**Pattern H cross-Task 防御**:两 signal 配合让 Frontend → Backend handoff 零 rebase 摩擦(Task 15b 直接 consume frontend `adminApi.types.ts` 现成 shim · 仅需 line 5 comment squash fix · 无需 shape 协商)· 符合 Pattern H 第 7 gate(cross-Task preservation without regression)的隐性契约。

**Defense library 收益**:Round 1 self-catch 机制首次在 Frontend 端 validation(此前 4 次均 Backend)· **sSelfAuditQuality 跨端 transferable** · 不局限于 Backend pipeline Tasks。

### #103 — `pattern-C` 第 7 次:`submissions.*` 双层语义(SignalInput contract vs metadata storage)
**trace**: Task 15b Phase 2 §3 hydrator contract re-verify

`submissions.*` 字段在 V5 codebase 承载 **两层语义**:
1. **SignalInput contract 层**:`SignalInput.submissions.{moduleA,moduleD,phase0,...}` 是 signal compute 的 canonical 入参形状(runtime shape · 由 hydrator 组装)
2. **metadata storage 层**:`session.metadata.submissions.*` 是 V4 legacy envelope · V5 改为 `metadata.{moduleA,moduleD,phase0,mb,selfAssess,moduleC}` top-level · V4 ghost cleanup 已入 V5.0.5 backlog(#087)

同名 namespace 承载两层不同生命周期的语义 · 新 Task agent 读 glossary 时容易 conflate 两层 → 误以为 hydrator 应 read `metadata.submissions.*`(触发 V4 ghost read)。Task 26/27 Phase 1 Q 已 lock contract(read top-level · 非 submissions namespace)· 但 glossary 缺 explicit "双层语义" disambiguation。

**Pattern C 第 7 次累计**(#077 Pattern C #1 · glossary 自纠 #2/#3/#4 · #096 自污染 #5 · 之前累计 6 · 本次 #7)· **V5.0.5 docs task**:`field-naming-glossary.md` 新增 **"Naming Ambiguity Resolutions"** section · `submissions.*` 为首条 entry · 其他 double-meaning 字段集中归档。

### #104 — `signal-candidate` sSelfAuditQuality 第 4 次命中 · cluster candidate 正式
**trace**: Task 15a 自加 malformed-subcase test 超 brief scope(Task 15a 交付回顾 · Task 15b Snapshot G 消化)

Task 15a Backend agent 自加了 `hydrator.test.ts` 里 malformed `metadata.submissions.moduleA` 的 **subcase test**(brief 只要 happy path + missing metadata)· 以覆盖 V4 ghost silent-drop 的 edge case。超 brief scope 但严格绑住 hydrator contract lock 的意图 → **audit 自己交付的 contract 完备性**。

**sSelfAuditQuality 累计命中**(#039 + #049 + #053 + #104 = 4 次)· `cluster candidate` 状态正式升级到 **`cluster candidate(#039, #049, #053, #104)`**(#049 narrative text 丢失于 Pattern E #5 · 但 derivative pattern statistics 仍可追溯到 PR #60 checklist v2.1 · 不影响累计)。

**Formalization threshold**:**第 5 次命中后 V5.2 formalize 为独立 signal 候选**(与 `sScopeDiscipline` / `sIntentionalCoverage` 同级别 cluster signal)· 若 V5.0 Cold Start Validation 期间 sSelfAuditQuality 再命中一次 · 入 V5.2 signal extension 正式候选列表。

---

## Day 3 addendum — Task 12 Layer 2 Phase 2(2026-04-20)

### #105 — `defense-mechanism` Frontend 端 Round 1 + Round 2 split pattern · 首次 8/8 pre-verify 自 catch · 0 漏
**trace**: Task 12 Layer 2 Phase 2(commits `00ab85a` Day 1 AM · `37f30ea` Day 1 PM · `ebbe601` Day 2 AM)· PR 待开

Frontend 端首次在 Backend-first / Frontend-second 配对 Task 里把 **Round 1 audit(contract 对齐)+ Round 2 pre-verify(implementation drift)** 拆成 **两段独立**(非合并一次扫)· 执行顺序:
1. **Round 1** · Task 15a contract 自 catch:`adminApi.ts` 实装 pages 计数 undercount(预期 6 · 实际 5)· Backend 尚未 Round 2 之前主动 snapshot self-correct(#102 首次 sSelfAuditQuality cross-端命中)。
2. **Round 2** · Phase 2 派发前 Frontend agent 主动 derive **8 条 checklist** 覆盖 Round 1 未覆盖的 implementation drift:(1) `/api` prefix 补全 · (2) `expiresAt = Date.now() + expiresIn * 1000`(seconds→ms 单位换算 · Pattern F 防御关键点 · mock 永不 expire 永远不会暴露此 bug · 仅 real backend 才能 catch)· (3) UI 不 submit orgId query param(backend 从 token derive)· (4) 400 report incomplete-session UX branch · (5) 201 status(create)res.ok 覆盖 · (6) 429 无 code field · res.status check · (7) `V5AdminExamInstance` widening 保持 string(非 enum) · (8) `createdAt=0` sentinel 优雅 render。

**Phase 2 落地结果**:8/8 checklist 全部 ✅ code 固化 · **0 漏** · 无 Backend 端 rebase 摩擦。

**Defense library 收益**(vs Backend-only Round 2 历史):此前 Round 2 多为 Backend agent 发起 · Frontend 通常 consume Backend 产出 · Frontend 端 Round 2 首次 validated · **模板 reusable for 所有 Backend-first / Frontend-second Task pair**(V5.1+ Admin lifecycle / V5.0.5 refresh rotation 等)。核心 insight:**contract audit 与 implementation drift audit 不合并**(Pattern B 防御)· 两段各有独立 checklist · 互不污染 scope。

### #106 — `agent-pattern` Frontend 3-commit autonomous run · 持续 productive 无 status churn · brief §11 sequence discipline 典范
**trace**: Task 12 Layer 2 Phase 2 Day 1 AM + Day 1 PM + Day 2 AM(连续 3 commit · 0 stop-for-clarification · 0 无效 status report)

Phase 2 brief §11 prescribe 了 8-10 commit · 明确 sequence(Day 1 AM → Day 1 PM → Day 2 AM → Day 2 PM)· 以及 **self-merge 禁用 + 2500 LOC gate**。Frontend agent 在 **~3 小时连续 session** 内完成 3 commit(Day 1 AM 10 files 140/230 · Day 1 PM 9 files +999 · Day 2 AM 7 files +383/46 · 总 ~1246 net · 未触 2500 gate)· 全程 **0 silent stuck** / **0 中断 clarification** / **0 unnecessary progress ping**。

**Pattern**:当 brief §11 sequence clear + stop-gate explicit(LOC / self-merge / smoke)时 · Frontend agent 可 **fully autonomous** 跑完多 commit · 仅在 **真正 blocking ambiguity 才 stop**(本次 stop 点:Day 2 PM smoke 策略选项呈现 · 非技术 blocker 而是 user schedule 决策点)。对比 Backend agent Day 1-2 similar autonomous discipline · 两 agent 均 demonstrate **well-specified brief + explicit stop-gates** 下的 productive autonomous runs。

**Agent autonomy 必要条件**:§11 sequence 非 optional · 若 brief 只给 scope / deliverable 而不 prescribe sequence · agent 会 detour 到 ambiguity-resolution reasoning · 失去 compounding 效率。

### #107 — `meta-pattern` Pattern F 防御关键 case · `expiresIn` seconds vs ms 单位换算 · Round 2 checklist 2 code 固化
**trace**: Task 12 Layer 2 Phase 2 · `packages/client/src/stores/auth.store.ts:94` + `packages/client/src/stores/auth.store.test.ts` 专项 test

`POST /auth/login` 响应 `{expiresIn}` 单位 **seconds**(见 `packages/server/src/routes/auth.ts:41` `parseJwtExpiryToSeconds`)· Frontend `useAuthStore.login()` 必须 `Date.now() + expiresIn * 1000` 才能得到 `expiresAt` ms。**若漏 `* 1000` · token 会 "立刻过期"(`expiresAt = Date.now() + 28800 ms = 28.8 秒后`)· getToken() 返回 null · isAuthenticated 立刻 false · redirect /login · 循环**。

**为什么 mock 模式永不暴露**:mock 不走真 `POST /auth/login` · 也不经 `useAuthStore.login({expiresIn})` · 仅 manual seed `expiresAt = Date.now() + 60*60*1000`(ms)· 永远正确。**只有 real backend smoke(Step 3)才能暴露**此 drift · 如果漏 catch · 会在 HR onboarding 首次 login 时表现为 "登录按钮没反应"(实际是登录成功后立即 redirect /login · 肉眼观察以为登录失败)。

**Round 2 checklist 2 防御**:Phase 2 派发前 derive checklist 时显式列出 `expiresIn unit conversion` · 实装时 `auth.store.ts:94` 直接写对 · 专项 unit test(`auth.store.test.ts` "login writes token + computes expiresAt from expiresIn (seconds)" + "getToken returns null and wipes state once expiresAt is past")seal 不回归。

**Pattern F 累计**(在不读 filesystem 前提下凭记忆或 assumption 推实现)· 本次 **Frontend agent 在 Phase 2 派发前 pre-verify 了 Server 的 expiresIn 单位**(grep `packages/server/src/routes/auth.ts` + `parseJwtExpiryToSeconds`)· 属 Pattern F 防御成功 case。若未 pre-verify · Frontend agent 很容易按 React ecosystem 常见 `expiresIn ms` 默认假设写成 `+ expiresIn` · 触发上述无限循环 bug。

**结论**:mock vs real 单位换算类 bug 必须 Round 2 checklist 显式列项 + unit test 专项 cover · 不能 only rely on integration smoke(Step 3)· 因为 Frontend agent 在 Phase 2 派发前就要写对。

---

## V5.0.5 Backlog Addition(post-Task-15b · 同步 log)

本 Task 不改 `cross-task-shared-extension-backlog.md`(权威 V5.0.5 backlog)· 以下 2 条 observation-derived 条目同步 log 此处留痕 · 待 V5.0.5 sprint planning PR 统一迁入:

1. **Admin lifecycle actions investigation**(HR onboarding 反馈驱动)· 候选 endpoints:`DELETE /admin/sessions/:id` · `PATCH /admin/sessions/:id` status · `POST /admin/sessions/:id/revoke` · `POST /admin/candidates` list。Task 15b canonical 7 endpoint 未覆盖 admin-side lifecycle mutation · HR 需主动 revoke / close 未完成 session。
2. **`field-naming-glossary.md` 新增 "Naming Ambiguity Resolutions" section**(#103 衍生)· `submissions.*` 双层语义首条 entry · 其他 double-meaning 字段(如 `metadata.mb` vs `SignalInput.mb.*` · `createdAt` Session vs ExamInstance 两套 semantics)集中归档 · 目标 new agent 读 glossary 时 0 ambiguity。

---

## Day 4 (2026-04-20, Task A1 sCalibration — V5.0 Metacognition 7th signal · first meta-signal)

### #108 — `meta-pattern` Pattern F 第 19 次:Task A1 Phase 1 pre-verify grep under-scoped
**trace**: Task A1 Phase 1 · §E Stop #NEW (pre-Commit 1)

Phase 1 pre-verify 初次 grep "47" 仅覆盖 6 个 test sites(signals 目录 + 紧邻 service 测试)· Steve 明示后扩大 grep 到 server 全域发现 **14 个 test sites** · 差 8 个 test 会在 Commit 3 atomic 47→48 切换时被漏。Backend §E stop + Option (a) ratify 扩大 Commit 1 scope 到所有 14 sites。

**Pattern F 第 19 次累计**(13 + Frontend #14/#15 + Task 15b #16 + Task A1 #17 scale-normalization + #18 scale-normalization followthrough + 本次 #19)。

**Defense validation**:§E stop-for-clarification 在 Phase 1(brief 阶段)而非 Commit 时触发 · 避免 14 sites 里 8 处 silent RED 漏过 squash 阶段 · "grep 不止窗口口径 · 必须 repo-wide" 写入 Rule 13 Phase 1 checklist(Task A1 Commit 6 已提议 V5.0.5)。

### #109 — `meta-pattern` Pattern F 第 20 次:brief-side "intermediate green" 假设未 verify · Backend self-catch
**trace**: Task A1 Phase 2 · §E Stop (pre-Commit 1 re-verify)

Option (a) ratify 后 Backend 开始 implement:把 14 test sites 47→48 bump 放进 **Commit 1**(shared types + test bumps)· 但 Commit 1 HEAD 此刻 `registerAllSignals()` 仍返回 47(sCalibration 在 Commit 3 才 register)· **9 个 count assertion 在 Commit 1 HEAD 会 RED** · bisect 不 clean。Backend re-verify 自 catch · §E stop + Option (a1) ratify 把 Commit 1 shrink 到 "shared types ONLY" · 14 test sites 全部推到 Commit 3 atomic bump · 每 intermediate HEAD 可 pull-main 跑 CI 0 RED。

**Pattern F 第 20 次累计**。**Self-catch** · 非 Steve catch · 与 #095 Task 30 Phase 1 三连 self-catch 同类。

**Defense insight**:Option ratify 后 Backend implement 前**再跑一次 HEAD-level dry-run mental model**(每 commit HEAD 跑哪些 test · 哪些会 RED)。V5.0.5 Rule 13 Phase 2 checklist 候选:"Commit plan 含 atomic-split · 每 intermediate HEAD 必验证 green"。

### #110 — `design-insight` 两-pass orchestrator seam · computeMetaSignals · Gemini guardrail ≤3 meta-signal
**trace**: Task A1 Commit 2 · scoring-orchestrator.service.ts

V5.0 至 V5.0.x 的 signal compute 均为 **single-pass** — 所有 signal 同时接 `SignalInput` 计算后合并。Task A1 引入 **meta-signal**(sCalibration 需读其他 47 signal 的 partialComposite 作为 gap 基准)· 必须双-pass:

1. **Pass 1** — `registry.computeAll(input, { excludeIds: META_SIGNAL_IDS })` 跑 47 个 ordinary signal · 得 pass1Dimensions + partialComposite
2. **Pass 2** — `computeMetaSignals(registry, input, partialComposite)` 跑 meta-signal · merge 进 signals 后 recompute dimensions/composite

**Gemini guardrail**:`META_SIGNAL_IDS = ['sCalibration'] as const` hard cap ≤3 meta-signal · **防二阶 meta**(meta-signal 读 partialComposite 但 partialComposite 里不含 meta · 若新 meta 又读 meta 的 partialComposite 会需要 3-pass)。V5.1 A7/A8 (potentialJunior / potentialMid) 候选 meta-signal 也必须在此 cap 内 · 超则重新 re-design seam。

**seam 复用价值**:V5.1 A7/A8 只需:
- 新 signal 文件写 `compute(input, partialComposite?)` 签名
- signals/index.ts register
- `META_SIGNAL_IDS` 加 id
零改 orchestrator / registry / shared types。**pattern 稳**。

### #111 — `design-insight` #057 Max 0.40 retroactive override rejected by Dunning-Kruger psychometric · fixture narrative-first 原则
**trace**: Task A1 fixture integrity review · (原 #057 narrative drift · 本 observation 定稿)

早期 fixture draft 曾建议把 Max `selfAssess.confidence` 从 0.90 下调至 0.40("更贴合 D 级候选实际" · 直觉-first)。Task A1 psychometric 审计 reject 此 override:真实 D 级候选**不会**自评 0.40 · **Dunning-Kruger effect**(Kruger & Dunning 1999)恰恰是**不知道自己不知道** · 自评**偏高**(0.85-0.95 典型)。Max 0.90 保留给 sCalibration = 0 提供 "perfect DK psychometric anchor"。

若 Max 改 0.40:
- sCalibration upward-drift 到 ~0.5(gap 从 71.3 变 22)
- Max 的 narrative 从 "DK 典型 initial archetype" → "谦虚的 D"(违 archetype 设计意图)
- Golden Path psychometric coverage 出现空洞(无 fixture cover "overconfident + low-skill")

**design 原则入库**:**fixture narrative-first** · psychometric narrative 高于数值 calibration 精度 · tune confidence 前必须先对齐 archetype 画像。`field-naming-glossary.md` "Fixture Design Notes" section 是 single source(Task A1 Commit 6 加入)。

### #112 — `defense-mechanism` Stop-for-clarification 3.0 perfect · Task A1 Phase 1-3 共 4 stop · 0 silent push
**trace**: Task A1 全程 · Phase 1 #19 / Phase 2 #20 / Commit 4 §E #6 / (潜在 Commit 6 TBD)

Task A1 全程触发 4 次 §E stop:
1. Phase 1 grep under-scoped(#108 Pattern F #19)
2. Phase 2 intermediate green 假设未 verify(#109 Pattern F #20)
3. Commit 4 composite drift 0.62 > 0.5(#113 threshold revision)
4. [latent] 任何 Commit 5-6 再 escalate

**Pattern**:每 stop 都是 **"实际观测与 brief 假设 diverge"** 触发 · 没有一次 silent push forward。stop-for-clarification 已从 V5.0.0 formalize 迭代到 3.0 perfect state:
- 1.0 (V4 → V5.0.0):stop 后 Steve 必须 choose option A-C
- 2.0 (V5.0.0-V5.0.x):stop report 含 cost-decomposed options + 推荐 default
- 3.0 (V5.0.5-Task A1):**3-perspective ratify**(Karpathy / Gemini / Claude Code 负责人)· stop report 含 "ratify 理由每角度 2-3 句" · decision audit trail 完整

**Defense library status**:Task A1 是 3.0 pattern 第一次 4 连 stop · 全部 1 round 成功 ratify · 0 silent push · 0 re-stop。**pattern 稳**。

### #113 — `meta-pattern` §E #6 stop trigger "0.5 literal" miscalibrated · 语义 revise 为 "无法 decompose"
**trace**: Task A1 Commit 4 · Option (b) ratify

Commit 3 green-light 给出 §E #6 trigger = "composite drift > 0.5"。Commit 4 Golden Path 探针发现 Emma composite drift +0.62 > 0.5 · Backend §E stop。3-perspective ratify(Karpathy/Gemini/Claude Code 负责人)2.5/3 Option (b) 接受 drift:

- **Karpathy**:signal 正确工作 · Emma calibration=1.0 reward 正确 · +0.62 是 **feature not bug**
- **Gemini**:fixture 是 "已 calibrated baseline" · signal 变更必然 drift · 可 decompose 的 drift 应通过 expectations update 接受 · 历史 #052/#061/#066 同 pattern
- **Claude Code 负责人**:§E #6 原阈值 "0.5 literal" miscalibrated · trigger 本意是 "weight 配错 / 公式错" 未发生 · 阈值应 revise 为 **"无法 decompose"**

**Trigger 语义修订入库**:§E #6 future 应用 · drift 必须**先尝试 decompose**(哪 signal 带来多少 shift · 是否预期 · 是否 fit existing band) · decomposable + fit band + narrative preserved = accept update · 仅 non-decomposable / band-breaking / narrative-break 才是 hard stop。

**V5.0.5 checklist rule 10 extension 候选**:stop-trigger 语义不应 literal-threshold(易 under/over-sensitive)· 应 behavioral-semantic(drift 是否 decomposable / narrative 是否 preserved)。

### #114 — `cross-task-gap` V5.1 backlog · Golden Path fixture 未覆盖 "direction=undefined perfect calibration" case
**trace**: Task A1 Commit 4 · sCalibration direction annotation coverage audit

sCalibration 输出 `SignalEvidence.direction ∈ {'overconfident', 'underconfident', undefined}`(undefined = gap 0 · 完美校准)。Golden Path 4 archetype 探针结果:

| Archetype | gap | direction |
|-----------|-----|-----------|
| Liam      | 11.8 | underconfident |
| Steve     | 16.2 | underconfident |
| Emma      | 3.2  | underconfident(within tolerance 但非 0) |
| Max       | 71.3 | overconfident |

**覆盖空洞**:没有一个 archetype 触发 `direction=undefined`(gap=0 · 完美校准)· Emma 最近但仍 underconfident。当前 `direction=undefined` 分支仅由 sCalibration 单元测试 case "perfect calibration" 覆盖 · integration 层零覆盖。

**V5.1 backlog(不紧急)**:下一次 Golden Path fixture re-calibration 时 tune 一 fixture 的 `selfAssess.confidence` 使其 `gap ≤ 5` 且 `self*100 === partialComposite`(推荐 tune Emma · 她已是 direction=undefined 最近候选)。V5.1 A7/A8 meta-signal 若复用 direction 字段 · 须先补此 fixture coverage 否则 integration 层永远不过 undefined 分支。

**V5.0.5 不必行动**:Task A1 unit test 已锁定 undefined 分支 · production scoring 不受影响。

---

## Day 4 addendum — Task Consent Frontend (2026-04-20)

### #115 — `design-insight` Consent flow Option γ scope discipline · standalone first · F-A12 deferred
**trace**: Task Consent Frontend Phase 1-2 · ratify [B] Reading (b)

3-perspective ratify(Karpathy / Gemini / Claude Code 负责人)定下 Option γ:**ConsentPage 先单独发** · 7-field ProfileSetup form 推迟到 F-A12 下一轮。Pattern B 分阶段 merge:

- **Karpathy(UX coherence)**:GDPR transparency screen 是 candidate 进 phase0 前的硬要求 · 不能等 7 字段 form ready 再一起出 · 阻塞 V5.0 release gate A-series #3
- **Gemini(API contract)**:Backend `/api/candidate/profile/submit` Option A 单 endpoint · 同 endpoint 后续扩 7 字段不破坏 schema(consent 字段保留 + profile 字段 optional 渐进式)
- **Claude Code 负责人(agent workflow)**:0.5d Frontend scope · 单 PR 单 round trip · 比 1.5d "consent + form 一起做" 风险低 · Round 2 reconciliation 也只需 verify consent 字段一段

**Pattern B 验证**:scope discipline 让 PR ≤ 700 LOC(实际 ~500) · 远低于 §9 ≤900 fence · 给 F-A12 留下足够 surface 不重叠。

### #116 — `meta-pattern` Frontend split repo Pattern E 强化 · fetch+pull 必须先于 grep
**trace**: Task Consent Frontend Phase 1 · agent stale main HEAD 误报

Phase 1 pre-verify 报 main HEAD = `6c4ad21`(Task 15b) · brief §2 写 main HEAD = `866d85f`(PR #75 squash)· agent 误判为 brief 过期。实际:agent 在 `feat/task-12-layer-2-phase-2` branch 跑 `git log -5 main` · 看到的是 **local 未 pull 的 main** · `866d85f` 已在 origin/main 但 fetch 未 run。

**Lesson**:Frontend split repo brief 模板必须明示步骤序:
1. `git checkout main`
2. `git fetch origin`
3. `git pull origin main`
4. `git log -1 --format="%H %s"`(verify HEAD = brief 标 hash)
5. **然后**才能 grep verify

Phase 1 grep 跳过步骤 1-3 直接看 local main · 必然 stale。Pattern E 原 brief §2 三强调路径前缀 · 现需追加"fetch+pull 必先"作为 Pattern E 第二层。

**未来 Frontend brief 模板**:Phase 1 pre-verify checklist 第 0 条 = "fetch+pull main + verify HEAD"。

### #117 — `design-insight` sessionToken ≡ sessionId URL alias · V5.0 ratified · V5.1 mapper extraction option
**trace**: Task Consent Frontend Phase 1 · ratify [B] Reading (b)

Brief 用 `:sessionToken` (`/candidate/:sessionToken/consent`) · 现有 candidate flow 用 `:sessionId` (`/exam/:sessionId`)。两 term 同指 `Session.id`。3-perspective ratify 同一 URL param · 不引入 mapper:

- **Karpathy**:UX coherence · 单一 identifier 简化用户心智模型(分享链接里只有一个 token)
- **Gemini**:API contract `Session.id` 已是 candidate-facing primary key · 命名 alias 前向兼容(Backend zod 接 sessionToken field 即可)
- **Claude Code 负责人**:1 line `<CandidateGuard><ExamRouter /></CandidateGuard>` 包装 · 不是 refactor

**V5.0 decision**:`sessionToken === sessionId` · `CandidateGuard.useParams<{sessionId}>()` · ConsentPage submit 后 `navigate(`/exam/${sessionToken}`)` · 同一字符串两 namespace 通用。

**V5.1 escape hatch**:若未来 candidate URL tree 整体 split 到 `/candidate/:sessionToken/exam/*`(F-A12 续作可能) · extract `mapSessionTokenToSessionId(token)` 作为 seam · 当前不需要(KISS)。

### #118 — `design-insight` CandidateGuard Option b minimalism · localStorage flag · V5.0.5 server-side upgrade option
**trace**: Task Consent Frontend Commit 3 · Pattern D defense

CandidateGuard V5.0 用 Option b · 纯 client-side localStorage flag `codelens_candidate_consent:{sessionId}` · **无 TTL**。Pattern D 防御理由:

1. **Per-session namespace**:flag key 含 sessionId · stale flag 跨 session 不可能
2. **Server-side source of truth**:Backend `consentAcceptedAt` 是权威 · client flag 仅为 UX shortcut(避免每次 mount 打 API 探查)
3. **No expiry needed**:V5.0 session lifecycle 短(typically <2h) · TTL 工程化复杂度高于收益

**V5.0.5 upgrade path**:若 Backend 扩 `GET /api/candidate/session/:id/status` 返回 `{ consented: boolean }` · CandidateGuard 可改为 server-fetch on mount + cache · 当前 punt(observation `v5_05_ui_infra_candidates` memory 已追加候选)。

**Pattern D scope**:V5.0 client-side state 凡 server 有权威源的 · 优先 client cache + 可选 server reconcile · 不做客户端 expiry 逻辑(易 bug · TTL drift / clock skew)。

### #119 — `meta-pattern` Pattern F 第 21 次 candidate · context-compression brief Appendix loss · stop-for-clarification Option A/B/C recovery
**trace**: Task B-A12 Commit 1 pre-impl

Editorial note on numbering: this entry is #119 (not the natural next #115) because Frontend Consent PR #77 Commit 3 (3eadb46) 并行 push 了 observations #115-#118。Backend B-A12 Commit 6 原拟 #115-#119 与 Frontend 冲突 · rebase 编号为 #119-#123。Merge 先后顺序决定 main 上的 transient gap:若 Backend 先 merge 则 main tail 出现 #114 → #119-#123 (跳 #115-#118),待 Frontend PR #77 merge 时 fill。类似 PR #75/#76 precedent · 非 bug · V5.0.5 若需要可一次性 compact 到 strict ascending。

Task B-A12 Phase 2 开工前 context compaction 发生 · summary 保留了 commit 结构与 §E trigger 语义 · 但丢失了 brief Appendix A 的 7 字段枚举(currentRole / companySize / primaryAiTool enum values 等)。agent 在 Commit 1 起步时发现 spec gap,没有走 Pattern F silent 模式(编造 field name),而是 stop-for-clarification 提出 3 option:

- **Option A**:planning Claude 直接 restate 完整 spec(preferred · 0 drift)
- **Option B**:agent 提 draft 请 ratify(cross-repo churn 风险)
- **Option C**:读 transcript jsonl 恢复(零风险 recovery)

Steve 选 Option A · 完整 spec 一次性给出 · 0 implementation drift。验证了 **stop-for-clarification 3.0** 从原始 "3 pre-verify stop" 场景扩到 **第 4 场景:context-loss recovery**。Rule 13 关键补充:context-compression 不是 silent 填空的借口 · 遇丢失 spec 必 stop not-guess。V5.0.5 checklist rule 14 候选。

### #120 — `defense-mechanism` Phase 1 pre-verify 的 scope-reducing authority · Commit 3 SKIP validated
**trace**: Task B-A12 Phase 1 Q2 finding · requireCandidate middleware/auth.ts:37 已存在

Task B-A12 原 brief 6 commit 结构 · Commit 3 = candidate auth middleware + 3 unit test。Phase 1 pre-verify Q2 grep 发现 `requireCandidate` 已在 Task 15a `middleware/auth.ts:37` 实装 · 含 horizontal-privilege-escalation 防御(sessionIdParam vs payload.sessionId)。Phase 1 report 直接提议 **Commit 3 SKIP** · test floor ≥18 → ≥15 · 工期 -0.25d · LOC band 900-1300 保持 · Steve Phase 1 ratify 一次性接受。

**Pattern 总结**:Phase 1 pre-verify 不只 "add guardrails"(补 §E trigger / 补 defense)· 也 **legitimately reduce scope** when pre-verify uncovers existing infra。过去 Rule 13 validation 都在 "scope-expand" 侧(Task 23 Backend spread-merge triple-layer · Task 26/27 Cluster C 扩 Pattern H gate) · 本 Task 是 **首次 "scope-reduce" validation** — pre-verify 不一定让 Task 变重 · 也可以让它变轻。

**V5.0.5 checklist v2.4 rule 候选**(formalize):"Phase 1 pre-verify 发现 brief 假设的 missing infra 实际已存在时 · agent 应 propose SKIP 对应 commit · 而非 re-implement · 标记 Pattern F #x-reduce sibling"。Rule 13 因此扩为 "Phase 1 既能 expand scope 也能 contract scope · 权威等价"。

### #121 — `design-insight` zod `.refine()` enables single-endpoint partial-body semantics
**trace**: Task B-A12 Commit 1 · `CandidateProfileSubmitRequestSchema`

Commit 4 endpoint `POST /api/candidate/profile/submit` 须同时服务三种 Frontend dispatch:

- Frontend Consent(PR #77 · 本 Task sibling):只 POST `{ consentAccepted: true }`
- Frontend F-A12 profile form(未来):POST `{ profile: {...} }` 或 `{ profile, consentAccepted }`
- Edge case:两者分开多次 POST(consent 先 · 后 profile · 或反)

原 naïve 方案:两 endpoint `/consent` + `/profile` · 各自 required field · 清晰但 API fragment + Frontend 两种 dispatch 路径。

**采用方案**:`z.object({ profile: CandidateProfileSchema.optional(), consentAccepted: z.boolean().optional() }).refine((d) => d.profile !== undefined || d.consentAccepted !== undefined, ...)`。

**效果**:单 endpoint · 一个 zod schema · partial-body 三种模式全支持 · `.refine` 锁 "至少一字段" 语义防 empty-submit silent accept。Route handler 对应 `data: Prisma.SessionUpdateInput = {}` · 仅显式写入 body 里出现的字段 · consent-only 不清 profile · profile-only 不清 consent · semantics 自然清晰。

**Pattern 可扩展**:V5.0.5 任何 "多 field partial-update with at-least-one-required" 场景 应复用此 `.refine()` + per-field `.optional()` 模板(e.g. 用户个人设置 partial save · multi-flag consent panel 二次确认)。比 REST PATCH semantics 更 zod-ergonomic · 比手写 field-check 更 type-safe。

### #122 — `defense-mechanism` add-nullable-only migration 是 safe-by-construction · Pattern H migration sub-gate
**trace**: Task B-A12 Commit 2 · `20260420084500_add_candidate_profile/migration.sql`

Migration SQL 单句:

```sql
ALTER TABLE "Session" ADD COLUMN "candidateProfile" JSONB,
ADD COLUMN "consentAcceptedAt" TIMESTAMP(3);
```

两列全 nullable · no DEFAULT · 无 NOT NULL。影响面:

- 既有 Session row(Golden Path fixture Liam/Steve/Emma/Max · Cold Start Validation row)两列默认 NULL · 完全不碰数据
- 代码读端 `row.candidateProfile ?? null` + `row.consentAcceptedAt ? .toISOString() : null` 天然处理 null
- Rollback:单句 `ALTER TABLE "Session" DROP COLUMN "candidateProfile", DROP COLUMN "consentAcceptedAt"` · <100ms PG
- V5.0 Golden Path 探针 · Cold Start Validation scoring pipeline · 零影响(两列不参与 scoring)

**Pattern H migration sub-gate 候选**(formalize):V5 release-gate check 之一 = "本 release 引入的 migration 全满足 add-nullable-only" · 违反时 · 引入 field 必须走 backfill + 两 release cycle(release N-1 backfill · release N 提 NOT NULL)。**safe-by-construction** 避免 migration-level rollback-hard scenarios。历史 V4 有过 `NOT NULL DEFAULT '{}'` 对 50M-row table 锁 15min 的 precedent(legacy V4 repo branch `legacy/v4` incident log)· V5 不应 regress。

**与 observation #118 原草稿关系**:本条 renumber 自 #118 · 内容未变 · only 编号 +1 for Frontend collision。

### #123 — `pattern-C` 第 8 次 candidate · `Candidate` (Prisma) vs `CandidateProfile` (Session.candidateProfile Json) naming ambiguity
**trace**: Task B-A12 Commits 1-5 · field-naming-glossary.md 新增 "Candidate vs CandidateProfile" section

Pattern C (命名冲突 / 语义歧义) 第 8 次命中。两实体 close-naming 但不同 storage / lifecycle / ownership:

| 实体              | 存储                                      | 字段                                         | Lifecycle                                 |
|-------------------|-------------------------------------------|----------------------------------------------|-------------------------------------------|
| `Candidate`       | Prisma `Candidate` 表                     | id / name / email / orgId / token            | Admin session-create upsert(Task 15b)     |
| `CandidateProfile`| Prisma `Session.candidateProfile` Json    | 7 self-reported fields                       | Candidate 自己 POST · pre-exam(Task B-A12)|

**load-bearing 的 two-entity design**:candidate 一生可多次考试(re-interview · 不同 suite) · 其 self-reported context(current role · tech stack · AI tool experience)随时间变。profile 放 Session 保留 **per-session temporal snapshot** · 若合到 `Candidate.profile` 则多次考试会相互覆盖 · 丢失时序。

**减歧义手段**:Commit 6 glossary 新增 "Naming Ambiguity · Candidate vs CandidateProfile" section · 含决策表 + rule of thumb("HR-facing identity 放 Candidate · self-reported assessment context 放 Session.candidateProfile") + two-entity rationale。Admin API 读路径两者对称:`GET /admin/sessions/:id` (Candidate via include) vs `GET /admin/sessions/:id/profile` (CandidateProfile flat)。

**Pattern C cumulative**:从 `submissions.*` dual-shape(#103)→ `editorBehavior` vs `fileSnapshot`(#082 trace)→ `selfAssess.confidence` vs `sCalibration` 等 · 至本次 8 次。V5.0.5 若做 docs sweep · Pattern C entry 应 consolidate 到 glossary 分级索引 · 不再散在 observations。


---

### #124 — `meta-pattern` Pattern H 第 4 次 · Backend/Frontend brief auth-model incompatibility caught by Frontend Round 2
**trace**: Task B-A12 auth-fallback patch · Frontend PR #77 Round 2 drift check · Commit 1 middleware + 4 tests

Pattern H (cross-task drift defense) 第 4 次命中 · 性质与前三次不同:前三次是**单向 Backend-first → Frontend grep 落差**,本次是**双向 brief assumption 不兼容**。Backend B-A12 brief Phase 1 Q2 明示 `requireCandidate` 需 JWT · Frontend PR #77 brief Round 1 假设 body-token dispatch 模型 · 两 brief 各自 self-consistent 但 joined 时 Frontend 每次调用 401。

Catch 来自 Frontend Round 2 Pattern H grep · 8 项 drift 报告 · 其中 critical #7 即此。Frontend 正确 **stop-for-clarification** · 未 silent amend 以匹配当时的 Backend contract(若 silent amend,可能退化为 body 无 JWT 的不安全模型)。

**Defense 升级**:Backend Commit 1 `requireCandidate` 扩 body-token fallback path · Commit 0 加 `Session.candidateToken String? @unique` · Commit 2 admin session-create mint · 链路闭合。Frontend 下轮 Round 3 将 re-grep 本 PR 的 middleware + zod 契约。

**Cumulative gate 7 → 8**:Pattern H 的 "cross-brief assumption verify" 成为 planning Claude 侧的新子-gate · 见 #126 规则候选。

---

### #125 — `design-insight` V5.0 `Session.candidateToken` Option (a) ratified · 三视角一致 Session-scoped clean
**trace**: Phase 1 pre-verify Q1 · Session schema 无 `candidateSelfViewToken` · 5 option matrix Steve 裁决 (a)

Phase 1 Q1 report 发现 Session schema 无任何候选人 token 字段 · `Candidate.token` 是 HR-mint 长期凭证(Person-scoped · 跨 session 复用)· 若复用做 auth-fallback → **cross-session replay risk**(一个 token 可访问该 candidate 全部 session)。

5 option 评估:
| # | Path                               | Scope       | Security                                    | Effort |
|---|-------------------------------------|-------------|---------------------------------------------|--------|
| a | 加 `Session.candidateToken String? @unique` | +2 schema + 1 migration | Session-scoped · add-nullable-only          | +0.1d  |
| b | Reuse `Candidate.token`            | 0           | Cross-session replay                        | 0d     |
| c | 用 `Session.id` 作 opaque token     | 0           | cuid predictable · 日志泄露风险              | 0d     |
| d | `Candidate.token` + body.sessionId 双校验 | 0       | de-facto Session-scoped · 防御堆叠          | 0d     |
| e | HMAC(Session.id, secret) 衍生 token | 0           | Revocable via secret rotation · 复杂度增加   | 0d     |

**三视角一致 (a)**:
- Karpathy · 唯一 Session-scoped clean · (b) 安全降级不接受 · (c) predictable · (d) 防御堆叠无效 · (e) 复杂度 > 收益
- Gemini · add-nullable-only 继承 Pattern H sub-gate (#122) · 0 break risk
- Claude Code lead · +0.1d 在 0.5d budget · architectural 清爽 · F-A12 / A10-lite 复用此字段

**A10-lite 决策 defer V5.0.5**:是否 `candidateSelfViewToken` 独立字段(ethics floor)或复用 `candidateToken` · 暂不 decide 今晚。

**Pattern H sub-gate 继承**:Commit 0 migration 与 B-A12 Commit 2 migration 结构同构(ALTER TABLE ADD COLUMN NULL · 无 backfill · 无 NOT NULL) · safe-by-construction 模板可重用。

---

### #126 — `meta-pattern` planning-Claude-side · brief 间 cross-reference verify 成新子-gate
**trace**: Root cause #124 · Backend B-A12 brief Q2 明示 JWT · Frontend Consent brief Round 1 假设 body-token · planning Claude 未 cross-reference

Pattern H root cause 归因于 **planning Claude 在下发 Backend brief 与 Frontend brief 时未做 cross-reference verify** · 导致两 brief 各自 self-consistent 但 joined incompatible。单 brief 级 pre-verify(Phase 1 Q1-Q4)只能在自己的 surface 上找 gap · 无法发现跨 task 假设冲突。

**规则候选(checklist v2.5 提案)**:
1. planning Claude 下发 brief 前 grep 所有 open-branch / in-flight PR 的 brief · 对比 I/O contract(endpoint shape · auth model · error envelope · field names)
2. 冲突 → 先对齐主 brief · 不分头下发
3. 若已分头下发 · planning Claude 主动 kick cross-brief diff 作为 Round 2 task · 不等 executor Pattern H grep catch

**Cost-benefit**:+5-10min planning lead time 换 1-2h Round 2 catch + patch PR 工期。今晚 Pattern H catch 到位 ·但 patch PR(本 PR)是 0.5d fresh commitment · 本可避免。

**Scope**:此规则候选适用所有 Backend/Frontend parallel-track · 非仅 auth;也适用 multi-Backend cluster(cluster A 曾经单向 drift · 若 cluster A/B parallel 则需双向 cross-reference)。

---

### #127 — `cross-task-gap` V5.0.5 backlog · middleware envelope consistency + admin error shape Frontend dependency
**trace**: Q2 Phase 1 finding · `requireCandidate` / `requireAdmin` / `requireOrg` / `requireOrgOwner` 四 helper 全部用 flat `{ error: string }` · 本 PR 仅改 `requireCandidate`

B-A12 auth-fallback Phase 1 Q2 发现 middleware 与 errorHandler **不一致**:errorHandler 经 AppError 转 nested `{ error: { code, message, details? } }`(符合 drift #6 Frontend 期望) · 但 middleware 四 helper 自己 `res.status().json({ error: string })` flat shape · 不经 errorHandler。

**本 PR scope fence**:只改 `requireCandidate`(Frontend F-A12 + Consent 调用路径)· 不 touch 其他 3。理由:
- `requireAdmin` 改会 break Frontend `AdminGuard`(PR #75 已 merge · production pattern · flat error shape dependency)
- Task 15b admin API 已稳定 · unified envelope 变更属 breaking change · 应 Frontend 准备好 remap 层再做

**V5.0.5 housekeeping 项候选**:
1. `middleware envelope consistency` · 4 helper 统一改 `next(AppError)` 走 errorHandler · Frontend 同步 remap 层
2. `A10-lite candidateSelfViewToken` · 决定独立字段 or 复用本 PR 的 `candidateToken`(ethics floor vs 字段简化 tradeoff)
3. `admin error shape Frontend remap` · 独立 Task · 与 (1) 配对

**Backlog 记录**:`cross-task-shared-extension-backlog.md` 新增 `## V5.0.5 Housekeeping` section · 上述 3 项 enumerated。

---

### #128 — `design-insight` B-A10-lite ethics-floor `.strict()` zod schema as permanent gate
**trace**: B-A10-lite brief §3 · `V5CandidateSelfViewSchema` 顶层 + 嵌套对象全部 `.strict()` · 显式拒绝 unknown keys

`V5ScoringResult` 是 admin-only payload(含 grade / composite / signals /
dangerFlag / reasoning / capabilityProfiles.score / evidenceSignals)·
candidate 的自查视图必须 strip 所有 judgement-grade / evidence 字段 ·
只保留相对强弱排序 + 能力画像候选人安全字段。

**Why `.strict()` over `.passthrough()`**: 若未来新增 admin-only 字段到
`V5ScoringResult`(如 `internalNotes`) · 且 transform 层忘记 strip ·
`.strict()` 会在 test 时 throw · 而 `.passthrough()` 静默通过 · 泄露到
candidate 客户端。schema 即 gate · 把 "何时何地 strip" 的责任从 code-review
reviewer 转移到 schema 结构本身。

**Test contract**:6 个 schema-level 测试 · 3 个正向用例 + 3 个 unknown-field
rejection 用例 · 每个 stripped field(grade / composite / dimensionBreakdown)
都有专属 "schema rejects this" 测试 · 退化不会 silent。

**Rule candidate**:所有 candidate-facing reduced-projection payload(未来的
candidate-facing module progress / hint 等)默认走 `.strict()` schema + explicit
strip transform;admin-facing 才用 `.passthrough()` / 无 runtime schema。

---

### #129 — `pattern-H` 第 5 次 · B-A12 `Session.candidateToken` nullable + B-A10-lite `Session.candidateSelfViewToken` nullable 共 2 次 reuse
**trace**: B-A10-lite C0 `20260421000000_add_session_candidate_self_view_token`
migration · `ALTER TABLE "Session" ADD COLUMN "candidateSelfViewToken" TEXT` +
unique index · 和 B-A12 `candidateToken` migration 完全同构

Pattern H(add-nullable-only migration sub-gate · #080 首次发布 · #124 Round 2 Patch
强化)在 2 个月内第 5 次复用:

- 第 1 次: Task B-A12 `Session.candidateToken` nullable opaque token(auth-fallback)
- 第 5 次: Task B-A10-lite `Session.candidateSelfViewToken` nullable opaque token(self-view)

两次都是 "Session 生命周期中 admin/candidate 在特定 phase 才 mint 的 opaque token" · shape 完全一致(String? + @unique)· migration DDL 结构一致
(ALTER TABLE ADD COLUMN + CREATE UNIQUE INDEX) · 都不破坏历史 session 读取。

**Pattern 成熟度信号**:模式化到可以作 boilerplate 生成器 —— "给我 mint 一个
Session 级 nullable opaque token 字段" 输入 field name 直接产出 schema diff +
migration SQL + 不破历史数据的契约 trio。V5.0.5 考虑加 CLI 脚本。

---

### #130 — `cross-repo-drift-risk` split-repo frontend mock sync rule 精化
**trace**: B-A10-lite C4 扩展 `V5AdminSessionCreateResponse` · monorepo
`packages/client/src/services/adminApi.ts` mockCreateSession 同 commit 已更新;
但 split repo `CodeLens-v5-frontend/` 的独立 mock 需要通过 GH Issue 手动同步

V5 monorepo (`packages/client`) 和 split repo (`CodeLens-v5-frontend`) 目前**并存**
(split repo 是 Frontend agent 的隔离工作区 · monorepo 是联合 typecheck/test
保护层)。**API 契约变更触发的 mock 更新**必须两边同步 · 否则 split repo
agent 下次 pull shared types 时会 compile pass 但 mock fixture 数据结构不匹配。

**规则候选**:
1. shared type 扩展 PR 必须 create GH Issue to split repo · label = `monorepo-sync`
2. Issue body 列 type diff + 建议 mock edit diff + 本 PR link
3. Split repo PR merge 前必须 close 这个 Issue · Frontend agent owner 负责

**Scope**:适用所有 `V5Admin*` / `V5Candidate*` contract-type 扩展;不适用纯
server-only 字段(如 Prisma schema 字段不出现在 shared type)· 也不适用 server
internal service 层接口。

---

### #131 — `design-insight` F-A12 · shared workspace zod transitive consumption (no client-side dep add)
**trace**: F-A12 Phase 1 Q3/D9 drift · Consent used manual boolean check (no zod) · client package.json has no direct zod dep · T4 α ratify

F-A12 needed form-level validation for 7 fields (yearsOfExperience 0-50 range · techStack 2-5 items · 5 enum memberships). Phase 1 Q3 surfaced that the Consent predecessor used manual boolean check, and the client workspace has no direct `zod` dependency.

Three-view consensus on α lever: import `CandidateProfileSchema` from `@codelens-v5/shared` and call `.safeParse()` inside the submit handler. Works because `@codelens-v5/shared` declares `zod: ^3.22.0` as a dep, and npm hoists it so the client sees `zod` as a transitive node_modules resolution. No client package.json change needed.

**Pattern**: when a shared schema already exists server-side, prefer `shared.Schema.safeParse(formState)` over a second client-side zod dep. Single source of truth for validation rules; no version drift risk between shared and client. If a client later needs client-only schemas, upgrade path is to add the explicit zod dep at that time.

---

### #132 — `design-insight` F-A12 · bilingual (zh+en) inline as GDPR transparency narrative · δ5 NOT apply rationale
**trace**: F-A12 §E E3 LOC breach · δ5 lever (techStackPlaceholder / techStackHint → zh-only) proposed · three-view REJECT

The §E E3 LOC resolve round considered δ5 — trimming the bilingual zh+en pair on `techStackPlaceholder` and `techStackHint` to zh-only (saving ~6 LOC). Three-view consensus rejected: **bilingual inline is not a decorative duplicate, it is part of the GDPR transparency narrative**. The pattern is inherited from Consent (PR #77) where every rationale line appears in both languages; trimming even "minor" UX surfaces (placeholder, hint) creates a silent asymmetry that degrades the promise of "we explain everything in your language."

**Rule**: LOC fences may compact styles / structure / re-exports / comments (δ1-δ4 all applied in F-A12 C3). They may NOT compact UX copy that carries a transparency commitment. When a task's UX is bilingual-by-narrative (Consent, Profile, V5.0.5 future candidate-facing flows), α/β/δ-copy levers are off-limits; scope-reduce must route through pre-verify α (feature cut), not post-hoc copy trim.

---

### #133 — `meta-pattern` Task-specific fence raise precedent · three-view ratify + self-merge authority
**trace**: F-A12 §E E3 resolve · prod 800 → 850 · total 1200 → 1450 · B-A10-lite PR #81 precedent · Steve 2026-04-21 ratify

F-A12 C3 production came in at 828 LOC post-implementation (591 LOC in ProfileSetup.tsx alone). δ compact saved 70 LOC (ProfileSetup 591 → 521), landing at 762. UI-heavy tasks (7 form fields × bilingual label + GDPR help + tag-input + 5 enum dropdowns + 33 styles-in-JS entries) have genuine production cost that does not compress below a floor.

Precedent: Backend B-A10-lite PR #81 total 1087 > 900 fence was ratified because production 368 was genuine test-coverage cost. F-A12 symmetry: production 762 > 800 fence ratified as genuine UX complexity, not scope creep.

**Rule candidate (V5.0.5 checklist v2.5)**: Task-specific fence raise permitted when ALL three hold:
1. Phase 2 surfaces breach that is NOT scope creep (code structure already compact, no feature additions beyond brief).
2. Three-view consensus on rationale, documented in PR body.
3. Future sibling tasks pre-calibrate fence to actual (e.g. F-A10-lite fences should be set from F-A12 observed ceiling, not the generic 800 default).

**Authority delegation (Steve 2026-04-21)**: three-view consensus executes; Steve post-reviews. §G Steve-merge bottleneck relaxed to self-merge authorized for three-view-consensus PRs. Steve continues to spot-check via PR list + observations scan.

---

### #134 — `defense-mechanism` Pure-rule signal reliability CI gate · 180 deep-equal tests
**trace**: A14a Phase 2 C2 · `packages/server/src/__tests__/reliability/pure-rule-signals.test.ts` · 4 Golden Path fixtures × 45 pure-rule signals

A14a ships a regression-proof deep-equal gate that computes each pure-rule signal twice against identical input and asserts value / evidence / algorithmVersion are byte-equal across runs. The 3 MD LLM-whitelist signals (`NON_DETERMINISTIC_SIGNAL_IDS`) are excluded — they rely on external model output and belong to V5.0.5 A14b (variance-band monitoring, not deep-equal). Gate runs inside the standard `vitest run` pipeline → 0 production overhead, automatic coverage of new signals added via `registerAllSignals`, and CI red the moment a future signal accidentally touches `Date.now()` / `Math.random()` / iteration-order-sensitive state.

**Rule**: any new pure-rule signal added to the registry is automatically covered by this gate. A new LLM-whitelist signal must (a) be added to `NON_DETERMINISTIC_SIGNAL_IDS` AND (b) update the hard-coded `size === 3` assertion in `v5-signals.test.ts`. The tripwire is intentional — drifting into non-determinism without an explicit whitelist opt-in is a contract violation.

---

### #135 — `design-insight` LLM variance deferred to V5.0.5 A14b · describe.skip-as-marker pattern
**trace**: A14a Phase 2 OQ3 ratify · brief §6 C3 draft · reliability test describe.skip placeholder

The LLM-whitelist signals (3 MD) are not included in A14a because variance monitoring needs a fundamentally different contract (tolerance band, distributional similarity) than pure-rule determinism (deep-equal). Bundling both would muddy the "scoring pipeline is 100% deterministic" V5.0 ship narrative and dilute the regression-proof guarantee — a deep-equal failure is unambiguous; a band breach is a judgment call.

**Rule (V5.0.5 candidate)**: when deferring a natural test-suite extension, prefer `describe.skip('reason · deferred to V5.0.X', ...)` with a nonce `it` over a comment-only TODO. The skip surfaces in every vitest run summary (visible 'skipped' count), cannot be grep-missed, and blocks silent re-enabling without a matching ratify.

---

### #136 — `meta-pattern` Brief §0 OQ-at-Phase-1 ratify pattern validated · V5.0.5 checklist v2.4 rule candidate
**trace**: A14a brief §0 3 OQ + agent Phase 1 catch of OQ4 · three-view unanimous 4 ratifies in one round

A14a brief pre-declared 3 OQs at §0; agent Phase 1 pre-verify surfaced a 4th (computedAt strip vs. fake timers) via direct grep of `Date.now()` stamping inside `makeSkippedResult` / signal compute bodies. Three-view ratify resolved all 4 in one exchange before any Phase 2 code was written. The pattern prevents mid-implementation pivot cost (C1 already commits against the wrong LLM count = rework; C2 already tests against the wrong strip strategy = rework).

**Rule candidate (V5.0.5 checklist v2.4)**: every task brief reserves a §0 OQ block at draft time, and Phase 1 pre-verify is required to append any newly-discovered OQs before Phase 2 starts. Silent adoption of a default where the brief left ambiguity is a Pattern F precursor.

---

### #137 — `pattern-F` 第 21 次 · brief Appendix A LLM signal count drift · agent self-catch at Phase 1
**trace**: A14a brief Appendix A listed 4 LLM signals · agent grep `isLLMWhitelist: true` + md-se-signals.test.ts cross-check · reality = 3 · sConstraintIdentification is pure-rule

Brief Appendix A enumerated sConstraintIdentification + sDesignDecomposition + sTradeoffArticulation + sAiOrchestrationQuality as "4 LLM whitelist signals". Direct grep confirmed only the last 3 are `isLLMWhitelist: true`; sConstraintIdentification is pure-rule. The drift propagated through the brief without being caught because Appendix A was written from the Round 3 Part 2 module-D planning prose, which predated the implementation decision to keep sConstraintIdentification pure.

Pattern-F 第 21 次 precondition holds: brief text ≠ code reality; Phase 1 grep caught it before Phase 2 wired a 4-element set. If the agent had trusted the brief, the C1 `NON_DETERMINISTIC_SIGNAL_IDS` set would have contained a phantom 4th id that fails the `listSignals().filter(isLLMWhitelist)` cross-check immediately — but the surface-area damage would have been larger had it slipped past pre-verify (hard-coded 4 in the tripwire test, misleading docs).

**Rule reinforcement**: brief-vs-code count mismatches go via observations `#126` (cross-reference verify) → resolved at the brief layer, not silently adjusted downstream.

---

### #138 — `cross-task-gap` MD fixture coverage null-semantic · V5.0.5 Task 17b moduleD expansion candidate
**trace**: A14a Phase 1 agent Q3 · GOLDEN_PATH_PARTICIPATING_MODULES = [phase0, moduleA, mb, selfAssess, moduleC] (no moduleD)

The 4 Golden Path fixtures deliberately exclude moduleD to match the `full_stack` suite shape. Consequence: MD signals (including pure-rule sConstraintIdentification) return `makeSkippedResult()` in the reliability gate — `value === null`, `algorithmVersion === 'registry@skipped'`. The deep-equal assertion still passes (`null === null`), but the invariant being tested is the skip-path, not the compute-path.

Semantic gap: a pure-rule MD signal that silently touches `Date.now()` inside its compute function would NOT be caught by the current gate, because the compute function is never invoked under Golden Path participating modules. The `algorithm-version-format` sweep does invoke `def.compute(input)` directly for skipped signals, which catches `algorithmVersion` stamping drift, but does NOT re-check deep-equal.

**V5.0.5 candidate**: Task 17b extends the Golden Path fixture set (or adds a `deep_dive`-shaped 5th fixture) with moduleD participation. Surfaces the MD compute-path under the reliability gate with full deep-equal coverage, closes the null-semantic gap.

---

### #139 — `design-insight` computedAt metadata stamp · V5.0.5 move-to-orchestrator candidate
**trace**: A14a Phase 2 OQ4-α ratify · stripTs helper is a necessary workaround, not a desired API

Every `SignalResult` carries `computedAt: number` (epoch ms), stamped by each signal at `return` time and by the registry's `makeSkippedResult` / `makeFailureResult` constructors. This stamp is non-deterministic by definition and forces the A14a gate to strip it before comparison. The stamp is also redundant at the signal layer — the orchestrator (or hydrator) already knows when computeAll was invoked and could stamp every result uniformly at a single site.

**V5.0.5 candidate**: hoist the `computedAt` stamp out of `signal.compute()` return shapes and `makeSkippedResult` / `makeFailureResult` bodies into a post-processing step inside `SignalRegistryImpl.computeAll`. After the move, `SignalResult.computedAt` can be marked read-only at the orchestrator boundary, signals return pure `{ value, evidence, algorithmVersion }`, and the reliability gate no longer needs a strip helper.

Benefit: strict mode — signals can be declared `: Promise<Omit<SignalResult, 'computedAt'>>` at their compute signatures, and the type system enforces purity. Cost: touches 48 signal files (mechanical: delete one line each) + registry constructors + any downstream consumers that compare results. Acceptable within V5.0.5 housekeeping budget.
