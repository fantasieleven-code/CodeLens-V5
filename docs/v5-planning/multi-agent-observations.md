# V5 Multi-Agent Co-working Observations

> 本文件记录两个 Claude Code agent(Backend + Frontend)协作开发 CodeLens V5
> 过程中的真实观察。
>
> **用途**:为 V5.2(multi-agent 候选人评估)的信号设计提供 **data-driven** 的
> 实战依据,避免在 V5.2 scope 设计时凭感觉推演。
>
> **记录规则**:
> 1. Agent 每个 Task PR 完成时,如果出现特定类型事件(见 kickoff 协议),
>    在 PR description 末尾加 "Observations" 章节
> 2. Steve review PR 时,把这些 observations 复制到本文件
> 3. 不做事后追加总结 — 事件发生当天就记,保留新鲜度
> 4. 每条观察必须含:时间戳 / agent / commit 或 phase / 具体事件 / signal hint
>
> **维护节奏**:
> - V5.0 开发期:每次 PR merge 时同步更新
> - V5.0 发布后 2-3 个月稳定期:暂停新增,启动聚类分析
> - V5.2 设计启动时:基于本文件 + 聚类结果产出 V5.2 信号候选清单
>
> **当前版本**:v0.1(2026-04-17 初始化,含今天 Task 2/3/4/5/5.5/6 的实战观察)

---

## 目录

- [原则沉淀区](#原则沉淀区) — 从多条观察归纳出的设计原则
- [观察日志](#观察日志) — 按时间顺序的具体事件
- [Signal Hint 聚类](#signal-hint-聚类) — 按 signal hint 对观察分组
- [协议说明](#协议说明) — Agent 如何记录、Steve 如何同步

---

## 原则沉淀区

这里放从多个观察归纳出的**设计原则**。每次添加新观察都检查是否更新本区。

### 原则 1:"停下问对问题" 是 S 级工程能力的核心指标

**来源观察**:#001 #003 #004 #007 #008

**观察要点**:两个 4.7 agent 在多个关键节点主动停下向 Steve 提问,每次停下都
为项目避免了 1-3 天的返工。**停下本身不是价值**——价值在"提问的精度":列出
2-3 个可能性 + 指出每种的后果,而不是"我不知道你说"。

**对 V5 评估的启示**:V5.2 可以设计信号 `sClarificationQuality`,放在 MA 模块
的挑战轮次。测量方式:给候选人刻意包含矛盾或模糊点的 requirements,看:
- **上分**:指出具体的矛盾点 + 列出可能意图 + 问澄清
- **下分**:假装没看到矛盾直接实现,或凭感觉选一种意图

### 原则 2:"对照文档 diff" 是可训练的工程习惯,远超"凭记忆判断"

**来源观察**:#004 #007 + Steve 自己的两次失误(Task 4 brief 偏离文档 / Task 6
文件描述错误)

**观察要点**:Agent 每次动作前主动 view 相关文档,而人(包括 Claude 作为
协调者)倾向凭记忆给指令。**文档驱动 vs 记忆驱动**是工程质量的分水岭——
在有 2000+ 行 clarifications + 3000+ 行 tasks 的大型项目里,没有任何人的
记忆能 cover 全部细节,**凭记忆就是错误来源**。

**对 V5 评估的启示**:V5.2 可以设计信号 `sDocAnchoring` — 给候选人 requirements
文档,后续挑战中故意制造"挑战说法和文档有细微差异"的场景,看候选人是否
主动翻回文档 verify。

### 原则 3:"守边界" 是顶级工程师判别点,"授权范围测试"可以诊断

**来源观察**:#005 #009

**观察要点**:Backend 4.7 在 CI 修复时明确区分"这次授权改 tsconfig"和
"要改 ci.yml 需要追加授权"。它知道每个改动归属哪个 scope,**超界前主动
停下**。普通工程师遇到问题倾向"能改就改",S 级工程师知道"不该改"。

**对 V5 评估的启示**:V5.2 可以设计信号 `sScopeDiscipline`,放在 MB Cursor
模块。设计场景:修 bug X,候选人的 AI 工具顺便建议"重构 Y 也不错",看
候选人是否坚持只改 X(TODO 标记 Y 不动)。

### 原则 4:"止损决策" 在项目关键节点出现,需要 sensing + courage

**来源观察**:#005 + Steve 自己在 CI 修复到第 4 层时设置的止损线

**观察要点**:Backend 4.7 在 CI 修复第 4 层时主动建议"止损 + 记录 known-red
+ merge PR",而不是继续挖第 5 层。这是对"PR 的核心价值 vs 附带 chore"的
正确 prioritization。

**对 V5 评估的启示**:V5.2 可以设计信号 `sStopLossPerception`,放在 MB 或 MC。
给候选人 30-45 分钟有限时间 + 一个核心任务 + 多个相关但次要的附近问题,看
候选人是否主动"放弃次要专注核心",而不是陷入 rabbit hole。

### 原则 5:"契约对齐" 在多 agent 协作中是核心,单 agent 下不显性

**来源观察**:#004 #010

**观察要点**:两个 agent 共享 @codelens-v5/shared 包。Backend 改 shared
(GradeDecision / CapabilityProfile 等),Frontend 消费。两个 agent 都**从不
越界改 shared**,即使技术上能改 — 遇到需要改时都停下请示。这让 shared 契约
稳定,避免了"多人同时改同个文件"的 conflict。

**对 V5 评估的启示**:V5.2 multi-agent 场景的核心测量应该围绕"契约识别与维护"
— 给候选人一份别人/其他 AI 产出的半成品,看他是否识别契约边界(哪些能改 /
哪些要问),而不是硬改。

---

## 观察日志

按时间顺序记录每条实战观察。每条 100-200 字。

### Observation #001 — 2026-04-17 ~02:00 — Backend 4.7 拒绝盲删 3.5MB 文件

**Agent**:Backend 4.7
**Phase**:Task 3 workspace cleanup(PR #16 之前)
**Context**:Steve 让 Backend 删除一个 3.5MB 根目录文件"回答Claud的问题",
授权指令里写"如果是 binary 直接删,如果是 text 停下"。
**Event**:Backend 虽然早先 `file` 命令已识别它为 binary,但在实际执行 `rm`
前主动**再次 re-verify**(`file` 命令 + `head -20`)—— 这次发现文件是
**UTF-8 text 76778 行**,是 V3/V4 时期的真实对话归档,有实质价值。它停下
报告给 Steve,最终文件被 archive 到仓库外而非删除。
**Signal hint**:`sVerifyBeforeDestroy` — 高破坏性操作前主动 re-verify
**Meta**:Agent 对破坏性操作的谨慎 > 对指令的执行

### Observation #002 — 2026-04-17 ~02:30 — Backend 4.7 发现 SUITES 位置不同于 tasks 规划

**Agent**:Backend 4.7
**Phase**:Task 3 启动(feat/backend-task3)
**Context**:tasks.md Task 3 描述"SUITES 定义在 `packages/shared/src/constants/suites.ts`"
**Event**:Backend 开工前先 find,发现 SUITES 已在 Task 1 merge 时落地在
`packages/shared/src/types/v5-suite.ts`(不同路径)且已被 4 个 frontend 文件
import。停下报告给 Steve,建议 "不移动,只改 reportSections"(避免破坏
frontend 契约)。
**Commit**:PR #17
**Signal hint**:`sLocationCheck` — 动手前核对"文档描述的位置 vs 仓库现实位置"
**Meta**:工程决策 > 规划文档;现实重于文档

### Observation #003 — 2026-04-17 ~02:45 — Backend 4.7 Task 3 V4 session.service 丢失

**Agent**:Backend 4.7
**Phase**:Task 3 启动阶段
**Context**:tasks.md Task 3 假设"基于 V4 已复制的 session.service.ts 改造"
**Event**:Backend 查 `legacy/v4` 分支 + 本地所有位置,发现 V4 session.service
从未被复制到 V5 仓库(tasks 假设是错的)。停下列出 3 个选项(b1 让 Steve 提供
V4 / b2 新写 / b3 推迟到 Task N+1)让 Steve 选。最终选 b2 新写,Steve 后来
补充了 V4 patch 吸收步骤。
**Commit**:PR #17
**Signal hint**:`sMissingContextHandling` — 发现关键前提不成立时,不硬推也
不放弃,列选项让决策者选
**Meta**:Agent 做选择题比主观题准

### Observation #004 — 2026-04-17 ~04:00 — Frontend 4.7 Task 2 发现 SUITES 缺 capability-profiles

**Agent**:Frontend 4.7
**Phase**:Task 2 启动(PR #22 之前)
**Context**:Frontend 读 Round 3 Part 4 要求"所有 suite 的 reportSections
新增 capability-profiles section"
**Event**:Frontend 读 shared 里 v5-suite.ts 的 SUITES 常量,发现 5 个 suite
的 reportSections **没有一个包含 capability-profiles**。这是 Task 3 和 Task 4
都漏掉的契约缺失。Frontend 停下报告,并给出 2 个处理选项(Frontend 自己改
shared / 让 Backend 开 hotfix PR)。Steve 选后者,产出 PR #20 hotfix。
**Commit**:PR #20 hotfix → PR #22
**Signal hint**:`sContractAlignment` — 开工前检查"我要消费的契约"是否
已到位
**Meta**:契约不全的情况下拒绝开工是正确行为,避免未来 rebuild

### Observation #005 — 2026-04-17 ~05:30 — Backend 4.7 CI 修复中主动建议止损

**Agent**:Backend 4.7
**Phase**:Task 4 PR #19 的 CI 修复
**Context**:PR #19 的 CI 修复已到第 4 层(tsconfig / build shared /
prisma generate / prisma.seed)
**Event**:Backend 发现还有 e2e webServer 启动失败(第 5 层),诊断出根因是
`src/index.ts` 不存在(Task 5.5 scope)。**主动停下建议**:"止损,把 e2e
记录到 CI_KNOWN_RED.md,PR #19 merge,不继续挖第 5 层"。Steve 采纳,
避免 Task 4 PR 被无底洞的 CI chore 吞掉。
**Commit**:PR #19 final state,CI_KNOWN_RED.md 第一次启用
**Signal hint**:`sStopLossPerception` — 识别"当前工作核心价值 vs 附带
chore",关键时刻主动放弃次要
**Meta**:这个信号对"产品 thinking" 是强信号,不只是工程信号

### Observation #006 — 2026-04-17 ~06:30 — Backend 4.7 Task 5 V4 sandbox 主动建议 archive 模式

**Agent**:Backend 4.7
**Phase**:Task 5 启动
**Context**:tasks.md Task 5 假设"基于 V4 已复制的 sandbox.service 抽取"
**Event**:Backend 发现 V4 sandbox 源码在外部 clone 里(2183 行),V5 仓库
没有副本。它**主动建议 archive 模式**(`src/services/archive/v4/` 目录),
不是裸 copy 或从零新写,而是"archive 作为参考 + 新写 V5 Provider 时有选择
吸收"。Steve 采纳。最终 PR #21 的 V4 archive + 新写 V5 混合交付质量极高。
**Commit**:PR #21
**Signal hint**:`sReusePatternRecognition` — 面对"不能全盘继承,不能全盘
抛弃"的场景,识别第三条路
**Meta**:这是工程 seniority 的典型表现 — 在两个极端之间找工程化方案

### Observation #007 — 2026-04-17 ~09:00 — Frontend 4.7 Task 4 发现 5 点文档冲突

**Agent**:Frontend 4.7
**Phase**:Task 4 启动(feat/frontend-task4)
**Context**:Steve 给了 Task 4 启动 brief,凭 Claude(协调者)的记忆写的
**Event**:Frontend view tasks.md Task 4 + clarifications Part 3 调整 1 +
现有 shared types,三份对照 diff,**发现 Steve brief 在 5 点上偏离文档**
(题数 / 答题形式 / 60s 计时器 / Phase0 scope / Mock shape)。其中两点
(答题形式 / 计时器)会让 sAiClaimDetection 信号**完全算不出分**。Frontend
停下列出 3 条路径(A 按文档 / B 按 brief 破 shared / C 混合)让 Steve 选。
Steve 选 A,Claude(协调者)承认错误。
**Commit**:在 Task 4 PR 开工前停下(避免 2-3 天返工)
**Signal hint**:`sMultiLayerConsistency` + `sClarificationQuality` 组合
**Meta**:这次停下是今天**最高价值的一次停下** — 避免了信号系统级失效

### Observation #008 — 2026-04-17 ~11:00 — Backend 4.7 Task 6 文件描述错误

**Agent**:Backend 4.7
**Phase**:Task 6 启动
**Context**:Steve 指令约束 D 说"重写 config/job-models/index.ts 使其 import
新 ModelFactory,旧 V4 role-provider mapping 保留做 comment"
**Event**:Backend view 该文件实际内容,发现它是岗位 YAML loader(和 AI 路由
完全无关),TYPECHECK_EXCLUDES 的原因也不是 Task 6,是 exam-generator 依赖
(Task 10 owner)。Backend 列 3 种可能(Steve 记错文件 / scope creep / 约束
废弃)让 Steve 选。Steve 选废弃。
**Commit**:Task 6 PR 开工前(待 PR #TBD)
**Signal hint**:`sClarificationQuality` — 不盲目执行错误指令,列出可能性
**Meta**:和 #007 相似,但规模小一层

### Observation #009 — 2026-04-17 贯穿多个 CI 修复 — Backend 4.7 严守授权边界

**Agent**:Backend 4.7
**Phase**:PR #19 多轮 CI 修复
**Context**:Steve 分多次授权(tsconfig / ci.yml / package.json / docs)
**Event**:Backend 每次收到新授权都明确在修改范围内。tsconfig 授权时 **不改**
ci.yml;ci.yml 授权时 **不改** package.json;每次发现新问题都停下问新授权,
不扩大 scope 自作主张。这在 4 轮连续 CI 修复中保持 100% 纪律。
**Commit**:PR #19 的多个 commits
**Signal hint**:`sScopeDiscipline` — 严守授权边界,即使技术上能超界
**Meta**:这和 "AI 能力越强越危险" 的直觉冲突 — 4.7 能做更多但守更严

### Observation #010 — 2026-04-17 贯穿全天 — 两个 agent 都不越界改 shared

**Agent**:Backend 4.7 + Frontend 4.7 共同
**Phase**:全天所有 Task
**Context**:`@codelens-v5/shared` 是跨 agent 契约,kickoff 规则是"改 shared
需 Steve review"
**Event**:两个 agent 在多个 Task 里**从不越界改 shared**——Backend 需要扩
GradeDecision 时正常改(自己的 domain),Frontend 需要 consume 但**从不改**
(即使技术上能改)。遇到 shared 不够用时都**停下请示**(Observation #004
是典型)。整个 V5 开发周期至今 shared 没有出现"两个 agent 争改"的 conflict。
**Commit**:全天多个 PR
**Signal hint**:`sContractRespect` — 识别共享契约,即使能改也不改
**Meta**:这是 multi-agent 协作的"安全阀",V5.2 场景下最关键的能力之一

---

## Signal Hint 聚类

本区按 signal hint 把观察分组,便于未来聚类分析。**至少 5 条观察聚成
一个 cluster 才算进入 V5.2 信号候选池**。

当前(v0.1)状态:

| Signal Hint | 观察数 | Cluster 状态 |
|---|---|---|
| sClarificationQuality | 3(#003 #007 #008) | 未达阈值,继续收集 |
| sScopeDiscipline | 1(#009) | 单例,继续收集 |
| sStopLossPerception | 1(#005) | 单例,继续收集 |
| sContractAlignment | 1(#004) | 单例,继续收集 |
| sContractRespect | 1(#010) | 单例,继续收集 |
| sMultiLayerConsistency | 1(#007) | 单例,继续收集 |
| sLocationCheck | 1(#002) | 单例,继续收集 |
| sMissingContextHandling | 1(#003) | 单例,继续收集 |
| sVerifyBeforeDestroy | 1(#001) | 单例,继续收集 |
| sReusePatternRecognition | 1(#006) | 单例,继续收集 |
| sDocAnchoring | 0(原则 2 纯理论) | 无实战观察,待验证 |

**目标**:V5.0 发布前达到至少 3 个 signal 聚成 cluster,V5.2 设计时至少 5 个。

---

## 协议说明

### Agent 如何记录

在每个 Task PR 的 description 末尾加 `### Observations` 章节,格式:

```markdown
### Observations

- **[type]** at [commit hash 或 phase]:
  - What: [1-2 句具体事件描述]
  - Signal hint: [sXxxYyy 或 TBD]

- **[type]** at [commit hash 或 phase]:
  - What: ...
  - Signal hint: ...
```

**type 枚举**:
- `stopped-for-clarification`(Agent 主动停下问 Steve)
- `spec-reality-mismatch`(发现文档和现实不一致)
- `initiative-beyond-brief`(做了 Steve 没要求的有益行为)
- `refused-based-on-ground-truth`(拒绝 Steve 指令,基于事实)
- `error-corrected-mid-task`(做错被纠正)

**什么时候不必加**:PR 过程完全顺利,没有任何上述事件。不强求每个 PR 都有
observations(没有就是没有)。

### Steve 如何同步到本文件

每次 PR merge 时,如果 PR description 有 `### Observations` 章节,执行:

1. 打开 `docs/v5-planning/multi-agent-observations.md`
2. 在"观察日志"区末尾追加新 entry,编号递增,含:
   - 时间戳(精确到小时即可)
   - Agent 是 Backend 还是 Frontend
   - Phase(Task N 启动 / 中途 / PR #N)
   - Context(发生背景 1-2 句)
   - Event(具体事件 3-5 句)
   - Commit(PR 号 + commit hash)
   - Signal hint(从 agent 的记录里抄,或 Steve 当场判断)
   - Meta(Steve 自己的 insight,可选)
3. 如果发现新观察让某个 cluster 达到 5 条阈值,在"原则沉淀区"加一条新原则
4. 更新"Signal Hint 聚类"表的计数
5. Commit 到 main(独立 docs commit,message 格式:
   `docs(observations): add entries from PR #N`)

**预计成本**:每次 5-10 分钟,和 PR review 合并做。

### 维护纪律

- **不要事后追溯**。事件发生当天记,保留语境。过了 48 小时就不记了
  (防止事后美化 / 丢失细节)
- **不要一次记太多**。一次 PR merge 产出 1-3 条 observation 是健康的,
  超过 5 条可能是 agent 在"表演" 或 Steve 过度解读
- **保留失败案例**。Agent 做错、Steve 纠正、Claude(协调者)犯错都要记
  (#008 就是 Claude 的错)。失败案例对 V5.2 signal 设计同样有用
- **commit hash 必须有**。没有 commit hash 的 observation 无法回溯上下文,
  价值打对折

### 本文件的生命周期

- **v0.1** (2026-04-17):初始化,8 条今天的观察,5 条原则
- **v0.x**(V5.0 开发期 14-16 周):持续累积,目标 50-100 条观察
- **v1.0**(V5.0 发布日 freeze):暂停新增,转入分析期
- **V5.2 启动日**:基于 v1.0 做聚类分析,产出 `v5.2-signal-candidates.md`,
  本文件转为历史档案不再修改

---

**文件结束**

> 最后更新:2026-04-17 v0.1
> 下次更新预期:Backend Task 6 PR 或 Frontend Task 4 PR merge 时
