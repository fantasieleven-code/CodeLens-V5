# Claude Self-Check Checklist v2.0

> **目的**:防止 Pattern D / E / F(interface ≠ algorithm / memory ≠ filesystem / 凭记忆粗估)在 Claude brief 里再次出现。
>
> **使用纪律**:每次发 Task brief 前,执行顶部 **3 极简动作**。若任何一条违反,stop,先解决。
> 细则 8 条作为 reference,on-demand 查询。

---

## 🔴 极简版:发 brief 前 3 件事(Scott 视角 — impossible to forget)

**如以下 3 件任一忘做 → Pattern C/D/F 再命中概率 >50%**

1. **Grep `field-naming-glossary.md`**(字段名)
2. **View `cross-task-shared-extension-backlog.md`**(pending 扩展)
3. **View brief 里引用的 function declaration + 文件头 TODO**(实际签名 + 预留 hook)

---

## 🟡 标准版:3 核心动作(Gemini 视角 — 简化认知负担)

每次发 brief 前执行 3 动作:

### 动作 1:**Grep-first**(规则 1 / 3 / 6)

任何"数字 / 引用 / 编号"先 grep,不凭记忆。

- 引用 `function_name()` → grep declaration
- 写"N 个 items"→ count list
- 引用 `observations #NNN` → grep filesystem

### 动作 2:**File-read before reference**(规则 2 / 4 / 5)

任何"字段 / 前置 / 文件"先 view,不凭 conversation summary。

- 引用 `submission.someField` → grep `field-naming-glossary.md` + shared 源码
- 引用"Task N 已完成" → grep filesystem verify
- 引用 scoring.service 等文件 → view 文件头 TODO 注释

### 动作 3:**Backlog-check**(规则 7)

发 brief 前 grep `cross-task-shared-extension-backlog.md`,看目标 Task 有无 pending 扩展。

---

## 🟢 详细版:8 条细则(Karpathy 视角 — reference docs)

### 规则 1:引用任何 function 前,grep 其实际 declaration

**Pattern A + D 防御**

写 brief 里引用 `scoreSession(session, suite)` / `computeDimensions(...)` / `someService.someMethod(...)` — 必须先 **grep 该 function 在 src 里的实际 declaration**。

- 发现 declaration 不存在 → brief 里明示"Task 必须新建此函数"
- 发现 declaration 和引用签名不一致 → brief 按 declaration 实际签名
- 发现 declaration 在 V4 archive 但 V5 未迁移 → brief 里明示需迁移

**错误示范**(Task 17 Blocker #1, observation #032):Claude 引用 `scoreSession(session, suite)`,未 grep,Backend 发现函数不存在。

### 规则 2:引用任何字段前,按 field-naming-glossary.md 确认命名

**Pattern C 防御**

写 brief 里引用 `submission.someField` / `signalResult.someProp` — 必须先 grep `field-naming-glossary.md` **和** shared 源码,确认:
- 字段 canonical 名称
- 归属 interface(哪个 shared type)
- Import path(Frontend / Backend 都能 import)
- 消费方(read/write)

若 brief 和 glossary 冲突,**以 glossary 为准**;若 glossary 和 shared 冲突,**先更新 glossary,再发 brief**。

**错误示范**(Task 7.5, observation #018):brief 写 `aiClaimedReason`,shared 实际 `explanation`。

### 规则 3:引用任何数字前,实际 count list 或 grep filesystem

**Pattern F 防御**

写 brief 里任何"N 个 items"/"N 天"/"N%"类精确数字 — 必须先:
- List 类(比如 "18 signals"):view 目标文件,**实际数行**
- 估工类(比如 "3 天"):参照历史同类 Task 实际工期,不凭感觉
- 完成度类(比如 "Task 2 完成 3-5 panel"):view 对应 filesystem 目录,不凭 brief 原计划

若不确定精确值 → 写 "~N" 或 "estimated N" 并说明不确定度。

**错误示范**(observations #025 / #028):
- "MB 18 signals" 实际 23
- "Task 2 做了 3-5 panel" 实际 13/13 全装
- "Task 7 估 12 天" 实际 ~2 天

### 规则 4:引用任何"前置已完成"前,verify filesystem 实际状态

**Pattern A + E 防御**

写 brief 里引用 "Task N 已完成" / "V4 的 X 已复制" / "Task Z 的 Y 字段已就位" — 必须:
- grep 目标文件 / 源码目录,**verify 实际存在**
- 不依赖 PR 标题 / observations / brief 记忆
- filesystem 是 single source of truth

**错误示范**(Task 17, observation #032):Claude 假设 "Task 4 的 scoreSession orchestrator 已完成",实际 Task 4 只交付 primitives,orchestrator defer。

### 规则 5:引用任何文件头 TODO / 注释 前,实际 view 该文件

**Pattern D 防御**

写 brief 里引用某文件的接口 / 签名 / 预留 hook — 必须 view 文件头的 TODO 注释。V5 代码里有很多 "等 Task N 做 X" 类注释,**这些是设计时的预留点**,不 view 会漏。

**错误示范**(Task 17 Blocker #2, observation #033):`scoring.service.ts` 文件头 L10-11 明确注释 "Task 13 实现的信号采用 0-1 scale,需要这里乘 100",Claude 未 view,brief 假设 signal 0-100 scale。

### 规则 6:引用任何 observations 编号 / PR 号 / commit hash 前,grep 实际值

**Pattern E 防御**

不要凭 conversation summary / 记忆写 observations #NNN 或 PR #NN。**grep 实际 filesystem 或 GitHub**。

若不确定编号,写 "最近 observation" / "today's PRs" 不写具体数字。

**错误示范**(observation #015):Claude 说 "observations.md 应从 #022 起",filesystem 是 #010 起。

### 规则 7:写 brief 前 grep `cross-task-shared-extension-backlog.md`

**Pattern B 防御**

每次发 Task brief 前,grep `cross-task-shared-extension-backlog.md` 看目标 Task 有无 pending shared 扩展。若有,brief 里**明示**"本 Task 同时扩 shared X,按 backlog 记录"。

按概率优先级处理:
- **必然**(inevitable):brief 里**强制 scope**,不能 defer
- **高概率**:brief 里**明示 scope**
- **中概率**:brief 里**提醒 check**,agent pre-verify 时自判
- **低概率**:不提,让 pre-verify 自然触发

**错误示范**(observation #023):Task 14 brief 未预见需扩 ws.ts v5:md:submit event,Frontend Task 8 已 defer,Backend Task 14 brief 时 Claude 再次遗漏。

### 规则 8:Brief 发出前按 3 极简版最后 tick

**Scott 视角 — safety net**

发 brief 前,**最后一步是 tick 顶部 3 极简动作**:

- [ ] Grep `field-naming-glossary.md`
- [ ] View `cross-task-shared-extension-backlog.md`
- [ ] View brief 里引用的 function declaration + 文件头 TODO

**任一未 tick → stop 不发 brief,先解决**。

---

## 迭代频率

本 checklist 每周 review 一次,累加新 Pattern(G / H / I...)或 retire 已消除 Pattern。

V5.1 开发期新命中的 Pattern → 立即加入。

## 衡量指标

- **目标**:Claude brief violations 率 20% → 2% (V5.0 发布前)
- **衡量**:Task 总数 vs stop-for-clarification 次数
- **Day 1-2 baseline**:20+ violations / 100 指令 = ~20%
- **Day 3 目标**(housekeeping 生效后):≤ 5%
- **V5.0 发布目标**:≤ 2%

## 本文件和其他文档关系

- `observations.md`:Pattern 历史案例库(observation IDs)
- `cross-task-shared-extension-backlog.md`:Pattern B 防御依赖
- `field-naming-glossary.md`:Pattern C 防御依赖
- `CI_KNOWN_RED.md`:CI 已知红 job(Task owner 追踪)
