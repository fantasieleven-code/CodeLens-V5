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

---

## Meta-pattern 累计统计(Day 1-2)

| Pattern | 描述 | 命中次数 | Observation IDs |
|---------|------|----------|-----------------|
| A | V4 前置已复制 default FALSE | 6 | #001, #032, + 4 次(未一一编号) |
| B | Cross-task shared extensions 发现过晚 | 3 | #004, #014, #023 |
| C | 字段名相似导致 Claude 混淆 | 3 | #011, #018, + 1 次 |
| D | interface 字段 ≠ algorithm 消费字段 | 3 | #013, #033, + 1 次 |
| E | Claude memory ≠ filesystem truth | 1 | #015 |
| F | Claude 凭记忆粗估 list 数量 / 完成度 | 4 | #025, #028, + 2 次(估工类) |

**总 violations**:20+ 次 / ~100 指令 = ~20%
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
