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
- [Claude(协调者)工作规范](#claude协调者工作规范) — Claude 自身行为约束 + 违反记录

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

**聚类状态**(2026-04-17 更新):signal hint `sClarificationQuality` 累积 10 条观察
(5 条 agent 正例 #003 #007 #008 #016 #020 + 5 条 Claude 反例 #011 #012 #013 #017 #021),
**已达 5 条聚类阈值 → 原则 1 进入 V5.2 信号候选池**。

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

### Observation #011 — 2026-04-17 ~09:00 — Claude 协调者 Task 4 brief 偏离文档 5 点(反例)

**Agent**:Claude(协调者)— **反例**
**Phase**:Task 4 启动指令起草
**Context**:Steve 托 Claude 起草 Frontend Task 4 启动 brief。Claude 凭记忆
paraphrase Round 3 Part 3 调整 1,未 view 原文
**Event**:Claude 写的 brief 与文档在 5 点上冲突(题数 / 答题形式 / 60s 计时器
/ Phase0 scope / Mock shape)。其中"答题形式"和"60s 计时器"两点若按 brief 执行
会让 sAiClaimDetection 信号**完全算不出分**。Frontend 4.7 开工前 view 文档 diff
brief 时 catch,停下列 3 条路径(A 按文档 / B 按 brief 破 shared / C 混合)
让 Steve 选。Steve 选 A,Claude 承认错误。
**Commit**:Task 4 PR 开工前(Frontend 正面记录:Observation #007)
**Signal hint**:`sClarificationQuality` — **反例**(凭记忆 paraphrase 替代 view 文档)
**Meta**:Claude 错误 Violation #1 — 违反规则 1 + 规则 2。驱动本文件 "Claude
(协调者)工作规范" 章节的写入。Claude 反例 + Agent 正面观察(#007)成对,
signal hint 相同,反正两面的数据

### Observation #012 — 2026-04-17 ~11:00 — Claude 协调者 Task 6 约束 D 文件描述错误(反例)

**Agent**:Claude(协调者)— **反例**
**Phase**:Task 6 启动指令起草
**Context**:Steve 托 Claude 起草 Backend Task 6 启动指令。Claude 凭记忆描述
`config/job-models/index.ts` 为 "V4 role-provider mapping",未 view 文件
**Event**:实际该文件是**岗位 YAML loader**,和 AI 路由完全无关;
TYPECHECK_EXCLUDES 列它的原因也不是 Task 6 改造,而是 import 未实现的
`exam-generator.service`(Task 10 owner)。Backend 4.7 开工前 view 文件 catch,
停下列 3 种可能(Steve 记错文件 / scope creep / 约束废弃)让 Steve 选。
Steve 选废弃(约束 D 报废,Task 6 不处理该文件,owner 转 Task 10)。
**Commit**:Task 6 PR #27 开工前(Backend 正面记录:Observation #008)
**Signal hint**:`sClarificationQuality` — **反例**(凭记忆 paraphrase 替代 view 文件)
**Meta**:Claude 错误 Violation #2 — 违反规则 3。Claude 反例 + Agent 正面观察
(#008)成对,signal hint 相同,反正两面的数据

### Observation #013 — 2026-04-17 ~16:00 — Claude 协调者 Task 5 R3 描述错误(反例)

**Agent**:Claude(协调者)— **反例**
**Phase**:Task 5 R3 启动指令起草
**Context**:Steve 托 Claude 起草 Frontend Task 5 R3 相关 brief。Claude 凭记忆
写 "R3 是 Emma Challenge",未 view 文档
**Event**:实际 R3 是 **Compare Diagnosis**,Emma Challenge 是 R1 的 sub-flow。
Frontend 4.7 view 文档 diff brief 时 catch(对应 Task 5 R3 Frontend stop,
待 Task 5 PR #28 merge 后新增为 Observation #014)。
**Commit**:Task 5 R3 PR 开工前(Frontend 正面记录:待 Task 5 PR #28 merge 后
新增为 Observation #014)
**Signal hint**:`sClarificationQuality` — **反例**(凭记忆 paraphrase 替代 view 文档)
**Meta**:Claude 错误 Violation #3 — 违反规则 1 + 规则 2。Claude 反例 + Agent
正面观察(待 #014)成对,signal hint 相同,反正两面的数据

### Observation #014 — 2026-04-17 ~15:30 — Frontend 4.7 Task 5 R3/R4 kickoff stop

**Agent**:Frontend 4.7
**Phase**:Task 5 启动(feat/frontend-task5 初始阶段)
**Context**:Steve 给 Task 5 brief 里说 "R3 = Emma Challenge",但 Frontend
view tasks.md + clarifications Part 3 调整 2 后发现 R3 实际是 Compare
Diagnosis,Emma Challenge 是 R1 sub-flow。
**Event**:Frontend 列 3 选项(A 按文档 / B 按 brief 破 shared / C 混合)
让 Steve 选,并同时 flag 冲突 2(R4 落点)。Steve 选 A(canonical) + c
(按 Round 3 L358-372 落顶层 round4 字段)。Claude 协调者承认 Task 5
R3 描述错误是 Claude Error #3。
**Commit**:PR #28,commit ca06706
**Signal hint**:`sMultiLayerConsistency`
**Meta**:Claude 反例 + Agent 正面观察(#013)成对,signal hint 相同,
正反两面的数据。

### Observation #015 — 2026-04-17 ~15:45 — Frontend 4.7 shared-bridge decision stop

**Agent**:Frontend 4.7
**Phase**:Task 5 kickoff 同一轮(延续 #014)
**Context**:Frontend 面对"round4 数据落点"冲突:Round 3 Part 3 调整 2
L358-372 规定顶层 round4,但 Steve brief "不改 shared" 硬约束。
**Event**:Frontend 列 4 选项(a 错位桥接 / b shared 加顶层 inputBehavior /
c 按 clarifications 落定稿 round4 / d 推迟)让 Steve 选。Steve 选 c,
并细化规则为 "clarifications-defined 字段可以落地,PR 必须引用精确行号"。
**Commit**:PR #28,commit ca06706
**Signal hint**:`sContractAlignment`
**Meta**:催生了规则细化(`不改 shared` 硬约束 → 有文档依据可破)。
这是协议级改进而非单次处理。

### Observation #016 — 2026-04-17 ~14:00 — Backend (Claude-as-implementer) Task 7 catch count 偏差

**Agent**:Claude(Task 7 Backend implementer 角色)
**Phase**:Task 7 启动 kickoff,pre-implementation 阶段
**Context**:Steve 的 Task 7 启动 brief 声称"V5 prompt keys 清单(18 个)",
但实际 `backend-agent-tasks.md` L894-L910 列出 17 个(9 generator.step0-8 +
5 mc.probe_engine.* + 3 md.llm_whitelist.*)。
**Event**:Claude 在开工前 view `backend-agent-tasks.md` 对 brief 的 "18" 做
count check,发现与权威源差 1。**严格按规则 5 防御性条款 + 规则 4 自检第 5 问**
(数量是不是凭记忆编的),停下未写一行代码,列 3 种可能(A 笔误 / B 文档漏记
一个 key / C 另有口头扩展)让 Steve 选。Steve 选 A(笔误,按 17 seed)。
**Commit**:feat/backend-task7,Task 7 PR #31 开工前
**Signal hint**:`sClarificationQuality` — 正例(动手前 count check 发现
brief 数字与权威源差 1,停下报告不自作主张)
**Meta**:Claude 反例(#017,Violation #4)+ implementer 正面观察(本条)
成对,signal hint 相同。与 #007/#011、#008/#012、#013/#014 同构,
但本次 agent 和 Claude 同一实例(Claude 在 Task 7 兼任 Backend implementer),
证明规则 5 防御性条款对同一实例也生效——只要有 "view 权威源再动手" 的
硬约束,paraphrase 错误就能在 cost 最低的节点被拦住。

### Observation #017 — 2026-04-17 ~13:45 — Claude 协调者 Task 7 brief 数字偏差(反例)

**Agent**:Claude(协调者)— **反例**
**Phase**:Task 7 启动指令起草 + Steve 确认周期
**Context**:Steve 起草 Task 7 启动 brief 时写"V5 prompt keys 清单(18 个)",
Claude 在接收 brief → 规划 task 分解期间**未对 "18" 做 count verify**,
把同一数字复制进内部 TodoWrite("T7-1: Define 18 V5 prompt keys"、
"T7-3: Populate seed.ts with 18 v1 placeholders"),准备按 18 seed。
**Event**:到 pre-implementation 阶段才凭规则 5/4 catch 出来——若 Claude 在
收 brief 第一轮就按规则 4 第 5 问("数量是不是凭记忆的")主动 verify,
能在更早节点拦截,也能免掉 TodoWrite 错项。Steve 选 A(笔误)并明确要求
本次记为 Claude Error #4 / Violation #4。
**Commit**:Task 7 PR #31 开工前(Backend implementer 正面记录:
Observation #016)
**Signal hint**:`sClarificationQuality` — **反例**(接收含数字的 brief 时
未按规则 4 自检立刻 verify 数字,拖到 implementer 阶段才 catch)
**Meta**:Claude 错误 Violation #4 — 违反规则 4(30 秒自检第 5 问)。
注意本条和 #011/#012/#013 不同:这次错误不是 Claude 自己 paraphrase 文档,
而是**未对 Steve 提供的数字做二次验证**。规则 4 覆盖的是"我引用或传递的
数字是否凭记忆",应当扩展解读为"他人提供的数字传递前也要 verify"。
这条观察促成规则 4 的语义澄清(下次 v1.1 修订时补入)。

### Observation #018 — 2026-04-17 ~14:15 — Backend (Task 7) catch CI_KNOWN_RED.md ↔ tasks.md 契约不一致

**Agent**:Claude(Task 7 Backend implementer 角色)
**Phase**:Task 7 PR #31 pre-self-merge CI 审查
**Context**:PR #31 CI 显示 `prompt-regression` FAIL + `e2e` FAIL。
查 CI_KNOWN_RED.md 发现 `prompt-regression` row 把 Task owner 标为 **Task 7**,
但 `backend-agent-tasks.md` L888-928 Task 7 spec 完全不含 promptfoo /
CI / evaluation 字眼(只涉及 DB 层 registry + 17 key seed)。
**Event**:Backend **拒绝自行扩 scope**(不自己创建 `promptfooconfig.yaml`,
也不默认"CI 既然标了 Task 7 owner 我就补上"),按规则 5 防御性条款停下,
列 3 选项(A 以 CI-baseline 原样 self-merge / B 在本 PR 加 stub 配置 /
C retarget CI_KNOWN_RED.md ownership 到 Task 9)让 Steve 裁决。
Steve 选 C:真正需要 promptfoo 的时点是 **Task 9**(Step 0 Prompt 调优,
第一个真实 prompt 产出 + 调优 10 轮需要 evaluation 工具),Task 7 只做
DB 激活,此时 evaluation 没有有意义的对象。
**Commit**:PR #31 amend 后的 force-push commit(TBD)
**Signal hint**:`sContractAlignment` — 两份协议文档(CI_KNOWN_RED.md
Task ownership ↔ backend-agent-tasks.md Task scope)之间的契约不一致,
动手前 diff 发现并停下
**Meta**:这不是 agent/Claude 对 Steve 文档的 paraphrase 错误(#011-#013、
#017 那类),而是**两份规范文档之间的内部矛盾**。这类契约不一致在大型
多文档项目里是典型陷阱——"看到一份说我该做就做"会扩 scope,"看到另一份
说我不该做就不做"会错过责任,正解是停下 diff 两份 + 请示。规则 5 覆盖
"指令 vs 文档不符",本案证明它也能拦住"文档 A vs 文档 B 不符"。

### Observation #019 — 2026-04-17 ~17:00 — Frontend 4.7 Task 6 发现 brief 机械替换已完成

**Agent**:Frontend 4.7
**Phase**:Task 6 启动(feat/frontend-task6)
**Context**:`frontend-agent-tasks.md` L526-562 把 Task 6 描述为机械替换(`v4:modulec:*`→`v5:modulec:*` ~15 处、`V4ModuleCAnswerPayload`→`V5ModuleCAnswer`、`useV4ModuleStore`→`useModuleStore`)
**Event**:Frontend 开工前 view 工作树,发现文档描述的机械替换**零处存在** — 全部已在 Task 1 batch 2(`a76563c` / `57f242e`)落地。真实残余工作是基础设施新建(`voice.store` / `useVoiceRTC`)+ 一处 `ModuleCPage.tsx` import-path 清理,文档没提。Frontend 停下,在 PR description 详细列出"已完成 vs 待建"的 diff。
**Commit**:PR #32,base commit `c18db52`
**Signal hint**:`sMultiLayerConsistency` — 文档描述的状态 vs 工作树实际状态两层不一致
**Meta**:与 #002(Backend SUITES 位置)、#014(Frontend Task 5 R3 定义)同构,都是"文档 vs 仓库现实"层的 catch。提示大型项目的 Task brief 有 staleness 风险 — 自动 diff "任务描述 vs 仓库现状" 可能成为 V5.2 的 meta 信号。

### Observation #020 — 2026-04-17 ~17:15 — Frontend 4.7 Task 6 kickoff 3-option stop

**Agent**:Frontend 4.7
**Phase**:Task 6 启动,写代码前
**Context**:#019 暴露文档错配同时,又发现 3 处歧义 — 缺 `voice.store` / `useVoiceRTC` 钩子、`/api/voice/v4/start` 端点含义(CodeLens V4 vs Volcano RTC API 版本)、tsconfig `ModuleCPage.tsx` 排除
**Event**:Frontend 停下,把文档错配 + 3 处歧义合并为 3 scoped options(A 空操作 / B 完整激活 / C 仅 stub)给 Steve。Steve 选 B 并澄清 "V5 延续 V4 Bearer auth"。这次停下的价值在于:把多个独立歧义合并为**一个清晰的决策点**,避免分批来回打断。
**Commit**:PR #32 kickoff stop
**Signal hint**:`sClarificationQuality` — 正例(多重歧义合并为一轮 3-option 决策,决策者只需裁决一次)
**Meta**:与 Claude Error #5 / Violation #5(Observation #021)成对,signal hint 相同,正反两面数据。证明 agent 正例可以同时暴露 Claude 反例 — 当 Frontend 列出 option B "完整激活" 时,已经在事实上补齐了 Claude 漏列的选项。

### Observation #021 — 2026-04-17 ~17:15 — Claude 协调者 Task 6 brief 初始 stub 方向错 + 未嵌入 V4 源码(反例)

**Agent**:Claude(协调者)— **反例**
**Phase**:Task 6 启动指令起草
**Context**:Steve 托 Claude 起草 Frontend Task 6 启动 brief。Claude 凭记忆假设 V4 `voice.store` / `useVoiceRTC` 要"新建",未 view `legacy/v4` 分支或本地 V4 clone 确认源码是否已经存在
**Event**:Claude 初始 brief **双重漏**:
1. 方向是 stub 起步(相当于 option C 路径),**没有给出 option B(V4 verbatim 复用)作为可选路径**,因为 Claude 不知道 V4 分支里有完整 VERTC + 订阅 / 发布管线实现。
2. 即便在后续讨论里 V4 复用作为可能性出现,Claude 的指令里也**没有嵌入具体 V4 文件路径(voice.store.ts / useVoiceRTC.ts)或源码节选**,强制 Steve 手动翻 V4 branch 把文件内容直接 drop 给 Frontend。

Frontend 开工前 view 工作树 + 从 V4 clone 交叉验证后,在 #020 的 3-option 列表中把 B 列为"完整激活"。Steve 最终裁决 B 并手动提供 V4 `voice.store` + `useVoiceRTC` 源码给 Frontend verbatim 复用。这是本日首次 Steve 主动注入策略(不是回应 agent 提问),确认了 coordination protocol 需要对称的 Steve-to-agent 通道。
**Commit**:PR #32 开工前(Frontend 正面记录:Observation #020)
**Signal hint**:`sClarificationQuality` — **反例**(未 view V4 分支验证 + 未提供 V4 reuse 路径 + 未在指令里嵌入 V4 源码路径)
**Meta**:Claude 错误 Violation #5(stub 方向,违反规则 1 + 规则 3)+ Violation #6(指令 B 步未嵌入 V4 源码路径,违反规则 2 + 规则 3)。两个 violation 同一 phase,但机制不同:#5 是"根本没考虑 V4 reuse",#6 是"即使考虑了也没提供源码路径"。与 #011/#012/#013 同构但更严重 — 这次不止 paraphrase 错,还遗漏了可复用的既有实现整类。

### Observation #022 — 2026-04-17 ~17:30 — Frontend 4.7 Task 6 session.store auth 契约 stop

**Agent**:Frontend 4.7
**Phase**:Task 6 scope refinement,在 #020 的 3-option 被 Steve 裁决为 B 后
**Context**:Frontend 读 `useVoiceRTC.ts` V4 源码时发现它依赖 `session.store.token` 字段,但当前 V5 `session.store` 骨架(Task 1 batch 3)只有 `currentSessionId`,**没有 `token` 字段**
**Event**:Frontend **不默默加字段也不默默失败**,停下问 Steve "V5 是否延续 V4 Bearer auth 机制,还是引入新认证?" Steve 确认 Bearer 延续。Frontend 加 `token: string | null + setToken()`,并在 PR description 明确标注 "actual `setToken` wiring 留给 MC backend join / Admin login 实施",避免在 Task 6 scope 里悄悄扩了 auth 路径。
**Commit**:PR #32 scope refinement
**Signal hint**:`sContractAlignment` — 认证契约在消费端缺失时主动请示,而非 silently 扩字段
**Meta**:与 #004(SUITES capability-profiles)、#015(round4 落点)、#018(CI_KNOWN_RED↔tasks 不一致)同属 sContractAlignment,聚类进度 3→4(距 5 条阈值还剩 1)。这条和 #020 都是 Frontend 在同一 Task kickoff 的两轮 stop(先问 scope 方向,再问 auth 契约),说明单次 kickoff 多歧义合并不是总能做到 — 依赖是否在起步时就暴露,这里 auth 契约是在读 V4 源码后才暴露。

---

## Signal Hint 聚类

本区按 signal hint 把观察分组,便于未来聚类分析。**至少 5 条观察聚成
一个 cluster 才算进入 V5.2 信号候选池**。

当前(v0.1)状态:

| Signal Hint | 观察数 | Cluster 状态 |
|---|---|---|
| sClarificationQuality | 10(#003 #007 #008 #016 #020 正 + #011 #012 #013 #017 #021 反) | **已达阈值 ≥5,进入 V5.2 信号候选池** |
| sScopeDiscipline | 1(#009) | 单例,继续收集 |
| sStopLossPerception | 1(#005) | 单例,继续收集 |
| sContractAlignment | 4(#004 #015 #018 #022) | 继续收集,距 5 条阈值还需 1 条 |
| sContractRespect | 1(#010) | 单例,继续收集 |
| sMultiLayerConsistency | 3(#007 #014 #019) | 继续收集,距 5 条阈值还需 2 条 |
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

## Claude(协调者)工作规范

> **用途**:约束 Claude 在协调两个 agent 开发 CodeLens V5 时的行为,
> 降低 Claude 犯错导致 agent 返工的概率。
>
> **背景**:实战中观察到 Claude 作为协调者的错误密度不低于 agent
> (2026-04-17 单日 Claude 被 agent catch 3 次错误),主因是"凭记忆
> paraphrase 文档"而非"view 文档再给指令"。本规范把"先 view 再说"
> 从自觉变成硬约束。
>
> **触发者**:Steve。当 Claude 在回复中引用任何文档、文件路径、
> commit hash、行号、或 Round N 规范时,Steve 有权问 "你 view 过了吗",
> Claude 必须老实回答。
>
> **记录**:Claude 犯错被 agent catch 的事件,作为反例 observation
> 记录到观察日志(signal hint = sClarificationQuality 的反面案例),
> 和 agent 的正面 observation 成对,为 V5.2 信号设计提供正反两面数据。

---

### 6 条硬规则

#### 规则 1:引用 V5 文档时必须先 view

**触发**:Claude 的回复包含以下任一:
- 引用 `v5-design-clarifications.md`(Round 2)的 Part N 调整 M
- 引用 `v5-design-clarifications-round3.md` 的 Part N / 重构 N
- 引用 `backend-agent-tasks.md` / `frontend-agent-tasks.md` 的 Task N
- 引用 `backend-agent-kickoff.md` / `frontend-agent-kickoff.md` 的协议条款
- 说"按文档某段落做"

**动作**:生成那条回复**之前**,用 view 工具(或 project_knowledge_search)
读对应文档的**实际内容**。不能凭记忆。

**禁止**:
- 用 "我记得 Round 3 Part 3 说..." 这种句式不 view 就写
- 在没 view 过文档的情况下给 agent "按文档执行"的指令
- 总结 / paraphrase 文档内容作为权威引用

**违反代价**:agent 按错误的 paraphrase 执行,产出返工;被 agent
catch 后浪费 1-3 小时对齐时间。

---

#### 规则 2:给 agent 的 Task 启动指令必须引用文档行号,不 paraphrase

**错误做法**:
```
R3:Challenge(Emma 面试官挑战候选人的 R1 选择,候选人改不改)
```

**正确做法**:
```
R3:按 frontend-agent-tasks.md L483-509 实现。以文档为准,不要按
我这条消息的描述。
```

**理由**:Claude paraphrase 文档时,paraphrase 本身就是 bug 源头。
agent 直接 view 文档行号,文档和执行之间零信息衰减。

**禁止**:在指令里用自己的话重述文档中已明确规定的内容。

**允许**:
- 给文档没写的额外约束(比如 "不改 shared" / "不 self-merge")
- 引用文档 + 给出明确选项让 agent 选(A/B/C)
- 对文档中**已识别**的模糊点做显式裁决(并让 agent 记录到 observations)

---

#### 规则 3:涉及具体文件内容的指令,必须先 view 或让 agent 先 view

**触发**:Claude 的指令包含 "修改/读取/参考某个具体文件"。

**动作**:两种方式之一:
- Claude 自己用 view 工具 / project_knowledge_search 读那个文件,
  基于实际内容给指令
- 让 agent 先 view 文件,然后 Claude 根据 agent 的 view 结果再给
  具体指令

**禁止**:凭 "我记得那个文件大概是做什么的" 给指令。

**今日违反案例**:Task 6 约束 D 把 `config/job-models/index.ts`
描述为 "V4 role-provider mapping",实际是岗位 YAML loader,被
Backend 4.7 catch。

---

#### 规则 4:每次回复前 30 秒自检 5 问

Claude 在 submit 回复前,对以下 5 项自问:

1. 我引用的 PR/commit,hash 对吗?(必要时让 Steve 或 agent verify)
2. 我引用的 Task 编号,和 tasks.md 对得上吗?
3. 我说的"某文件在某路径",我 view 过或记忆准确吗?
4. 我说的"Round N 文档规定",我 view 过吗?
5. 我给 agent 的约束里,有没有我凭记忆编的?

**如果任一 "没 view / 不确定"**:
- 要么**立即 view** 对应文档/文件
- 要么在回复里**明确标注** "基于记忆推断,建议你 verify"
- **不能默默用 "听起来对" 的内容**

---

#### 规则 5:在 Task 启动指令里默认加"防御性条款"

**每条 Task 启动指令必须包含**:

```
如果发现我指令里的任何文件路径 / 行号 / 数量 / 描述和实际不符,
停下报告,不要自己推演修正。
```

**理由**:agent 主动 catch 的能力已被实战证明(2026-04-17 三次 catch
都是因为 agent view 文档 + diff 指令)。但显式写进指令比依赖 agent
的主动性更可靠。

---

#### 规则 6:Claude 犯错被 catch 时,主动请求记入 observations.md

**触发条件**:
- Agent 回复里出现 "Steve brief 和文档冲突" / "你记错了" / "前提不符"
  类似措辞
- Claude 在下一轮回复里确认 "我错了 / 我记混了 / 我 paraphrase 错了"

**动作**:Claude 在承认错误的回复末尾,**主动提醒 Steve**:
```
建议把这次 Claude 错误记入 observations.md 观察日志,作为
Observation #N(signal hint: sClarificationQuality 反例)。
```

**理由**:Claude 的错误和 agent 的"停下问"是同一个信号的两面。两面
成对记录,V5.2 信号设计时能看到"agent stops 19 次 vs Claude errors
12 次"——鉴别能力的量化证据。

---

### Steve 的反制权力

即使有这 6 条规则,Claude 仍可能偶尔违反。**Steve 是最后一道防线**:

**当 Steve 看到 Claude 回复引用具体文件/行号/内容时,可以任何时候问**:
- "这段你 view 过了吗?"
- "这个行号是记忆里的还是刚查的?"
- "这个文件内容你 view 过还是 paraphrase?"

**Claude 必须老实回答**:"view 过" 或 "凭记忆"。凭记忆的情况:
- 立即承认
- 立即 view 修正
- 建议记入 observations 反例

---

### 规则适用范围

**本规范约束**:Claude 作为 CodeLens V5 协调者的所有回复。

**不约束**:
- Claude 讨论非 V5 项目(MockPro / HireFlow)的回复
- Claude 做创意/设计类发散思考(明确标注 "基于记忆推演" 的部分)
- Claude 响应 Steve 问候或闲聊

**边界原则**:**"规范性内容必 view,发散性思考可 paraphrase"**。

---

### 本规范的生命周期

- **v1.0**(2026-04-17 初始化):6 条硬规则 + Steve 反制权力
- **v1.x**:Claude 每次犯错被 catch 时更新(统计违反率,调整规则)
- **V5.0 发布时**:基于实战数据评估规则有效性,决定 V5.1 保留 / 修订
- **V5.2 开发期**:多 agent 场景会引入新失误模式,可能新增 2-3 条规则

**违反记录**:追加在本文件末尾的 "Claude 违反记录" 段落。

---

### Claude 违反记录

#### 2026-04-17(初始化日)

在本规范写出之前,Claude 已经违反过(补记):

**Violation #1** — Task 4 brief 偏离文档 5 点
- 错误:凭记忆写 Frontend Task 4 启动 brief,与 Round 3 Part 3 调整 1
  有 5 点冲突(题数 / 答题形式 / 60s 计时器 / Phase0 scope / Mock shape)
- Catch by:Frontend 4.7
- Claude 反例编号:Observation #011(Claude Error #1)
- 对应 Agent 正面观察:Observation #007(Frontend Task 4 stop)
- 违反规则:规则 1 + 规则 2

**Violation #2** — Task 6 约束 D 文件描述错误
- 错误:描述 `config/job-models/index.ts` 为 "V4 role-provider mapping",
  实际是岗位 YAML loader
- Catch by:Backend 4.7
- Claude 反例编号:Observation #012(Claude Error #2)
- 对应 Agent 正面观察:Observation #008(Backend Task 6 stop)
- 违反规则:规则 3

**Violation #3** — Task 5 R3 描述错误
- 错误:brief 说 "R3 是 Emma Challenge",实际 R3 是 Compare Diagnosis,
  Emma Challenge 是 R1 的 sub-flow
- Catch by:Frontend 4.7
- Claude 反例编号:Observation #013(Claude Error #3)
- 对应 Agent 正面观察:Observation #014(Frontend Task 5 R3/R4 kickoff stop)
- 违反规则:规则 1 + 规则 2

**Violation #4** — Task 7 brief "18 keys" 数字未 verify
- 错误:Steve brief 写"V5 prompt keys 清单(18 个)",权威源
  `backend-agent-tasks.md` L894-L910 列出 17 个。Claude 收 brief 时未按
  规则 4 第 5 问做 count verify,把同一数字复制进 TodoWrite,拖到
  pre-implementation 阶段才 catch
- Catch by:Claude 自己(Task 7 Backend implementer 角色,按规则 5
  防御性条款 + 规则 4 自检)— 是本日唯一一次 Claude 自 catch
- Claude 反例编号:Observation #017(Claude Error #4)
- 对应 Agent 正面观察:Observation #016(Backend Task 7 implementer catch)
- 违反规则:规则 4(30 秒自检第 5 问,应扩展覆盖"他人提供的数字")

**Violation #5** — Task 6 brief stub 方向,未给 V4 复用选项
- 错误:Task 6 Frontend 启动 brief 初始方向是"stub 起步",没有把 option B
  (V4 verbatim 复用)作为可选路径列出,因为 Claude 未 view `legacy/v4`
  分支或本地 V4 clone 确认 `voice.store` / `useVoiceRTC` 源码是否已存在。
  漏列可复用实现整类 — 比 paraphrase 错误更严重的一级错误
- Catch by:Frontend 4.7(开工前 view 工作树 + 交叉验证后在 3-option
  列表主动把 B 列为"完整激活")+ Steve(裁决 B 并手动 drop V4 源码)
- Claude 反例编号:Observation #021(Claude Error #5)
- 对应 Agent 正面观察:Observation #020(Frontend Task 6 kickoff 3-option stop)
- 违反规则:规则 1(未 view V4 分支)+ 规则 3(涉及文件内容的指令未 view)

**Violation #6** — Task 6 brief option B 步骤未嵌入 V4 源码路径
- 错误:即便在讨论里 V4 复用作为可能性浮现,Claude 的指令也**没有嵌入
  具体 V4 文件路径(`voice.store.ts` / `useVoiceRTC.ts`)或源码节选**,
  强制 Steve 手动翻 V4 branch 把 54 行 voice.store + 175 行 useVoiceRTC
  源码直接 drop 给 Frontend。指令停留在"完整激活"字面,没有提供可执行路径
- Catch by:Steve(采纳 option B 后发现必须自己去翻 V4)
- Claude 反例编号:Observation #021(同 Violation #5 同一 phase,
  两个不同机制的漏)
- 对应 Agent 正面观察:Observation #020
- 违反规则:规则 2(给 agent 的指令应当引用具体路径/行号,不 paraphrase)
  + 规则 3(涉及文件内容的指令必须先 view 或让 agent 先 view)

**当日违反率**:6 次 / 约 42 次给 agent 的指令 ≈ 14%

**目标违反率**(V5.0 发布前):< 2%

**规则 4 语义澄清**(由 Violation #4 触发,待 v1.1 修订时补入):
规则 4 第 5 问("我给 agent 的约束里,有没有我凭记忆编的?")应扩展为
"我引用或**传递**的任何数字/文件路径/行号,是否已对权威源 verify?"——
覆盖 Claude paraphrase 的情况,也覆盖 Claude 转发他人数字的情况。

---

**文件结束**

> 最后更新:2026-04-17 v0.6(Task 6 Frontend PR #32 观察 #019 #020 #021 #022 +
> Claude Violations #5 #6;sClarificationQuality 10 条 / sContractAlignment 4 条 /
> sMultiLayerConsistency 3 条;sContractAlignment 距 5 条聚类阈值仅差 1)
> 下次更新预期:Claude 下次违反规则时或下次 agent PR observations 同步
