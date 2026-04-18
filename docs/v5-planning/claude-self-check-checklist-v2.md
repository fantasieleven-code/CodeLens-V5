# Claude Self-Check Checklist v2.1

> **目的**:防止 Pattern C/D/E/F/**H** 在 Claude brief 里再次出现。
>
> **使用纪律**:每次发 Task brief 前,执行顶部 **4 极简动作**。若任何一条违反,stop,先解决。
> 细则 11 条作为 reference,on-demand 查询。
>
> **v2.1 变更**(2026-04-19,Day 3 start):
> - 极简版 3 → **4** 动作(加入 Pattern H dual-direction grep)
> - 规则 10(Signal-related brief dual-direction grep)+ 规则 11(Data pipeline 完整性)加入
> - Pattern 统计表更新:H 正式 formalized(5 cluster / V5.0 最严重)

---

## 🔴 极简版:发 brief 前 4 件事(Scott 视角 — impossible to forget)

**如以下 4 件任一忘做 → Pattern C/D/F/H 再命中概率 >50%**

1. **Grep `field-naming-glossary.md`**(字段名 / event 名)
2. **View `cross-task-shared-extension-backlog.md`**(pending 扩展)
3. **View brief 里引用的 function declaration + 文件头 TODO**(实际签名 + 预留 hook)
4. **🆕 Signal-related brief:dual-direction grep**(client emit ↔ server handler,规则 10 摘要)

---

## 🟡 标准版:4 核心动作(Gemini 视角 — 简化认知负担)

每次发 brief 前执行 4 动作:

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

### 动作 4(新):**Data-pipeline-verify**(规则 10 + 11)

任何 signal-related brief,grep 完整 data pipeline 5 个 link(client emit → ws.ts → server handler → persist → signal read)。任何 link 断 = Pattern H,brief 必须明示 scope 修或明示 defer。

---

## 🟢 详细版:11 条细则(Karpathy 视角 — reference docs)

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

**Day 3 扩展**(observation #065):signal ID 本身也适用本规则。Claude A7-audit brief 写 `sDecisionPauseQuality`,codebase 实际 `sDecisionLatencyQuality`。**规则 2 适用范围:所有 canonical identifier(字段 / signal ID / event 名 / type 名)**。

### 规则 3:引用任何数字前,实际 count list 或 grep filesystem

**Pattern F 防御(6 次命中,formalized with strict enforcement)**

写 brief 里任何"N 个 items"/"N 天"/"N%"类精确数字 — 必须先:
- List 类(比如 "18 signals"):view 目标文件,**实际数行**
- 估工类(比如 "3 天"):参照历史同类 Task 实际工期,不凭感觉。**加 30-50% buffer**(Day 1-2 每次估算低估 2-3x)
- 完成度类(比如 "Task 2 完成 3-5 panel"):view 对应 filesystem 目录,不凭 brief 原计划

若不确定精确值 → 写 "~N" 或 "estimated N" 并说明不确定度。

**错误示范**(observations #025 / #028 / #072 / #074):
- "MB 18 signals" 实际 23
- "Task 2 做了 3-5 panel" 实际 13/13 全装
- "Task 7 估 12 天" 实际 ~2 天
- "48 signals" 实际 47(#072)
- "observations.md 711 行" 实际 756(#074)

**Pattern F 6 次命中后新纪律**:任何数字写入 brief 前,**显式 tool call grep**,并在 brief 下方写 "数字来源:grep `[file]` 输出"。不 grep = 不写。

### 规则 4:引用任何"前置已完成"前,verify filesystem 实际状态

**Pattern A + E 防御**

写 brief 里引用 "Task N 已完成" / "V4 的 X 已复制" / "Task Z 的 Y 字段已就位" — 必须:
- grep 目标文件 / 源码目录,**verify 实际存在**
- 不依赖 PR 标题 / observations / brief 记忆
- filesystem 是 single source of truth

**错误示范**(Task 17, observation #032):Claude 假设 "Task 4 的 scoreSession orchestrator 已完成",实际 Task 4 只交付 primitives,orchestrator defer。

**Day 3 扩展**(observation #051):本规则扩到**文档产出场景**。Claude 写 housekeeping 文档(如 CI_KNOWN_RED v2)前,必须 grep main 上 existing 版本,不假设 "这是新文件"。

### 规则 5:引用任何文件头 TODO / 注释 前,实际 view 该文件

**Pattern D 防御**

写 brief 里引用某文件的接口 / 签名 / 预留 hook — 必须 view 文件头的 TODO 注释。V5 代码里有很多 "等 Task N 做 X" 类注释,**这些是设计时的预留点**,不 view 会漏。

**错误示范**(Task 17 Blocker #2, observation #033):`scoring.service.ts` 文件头 L10-11 明确注释 "Task 13 实现的信号采用 0-1 scale,需要这里乘 100",Claude 未 view,brief 假设 signal 0-100 scale。

### 规则 6:引用任何 observations 编号 / PR 号 / commit hash 前,grep 实际值

**Pattern E 防御(4 次命中,Day 3 新纪律)**

不要凭 conversation summary / 记忆写 observations #NNN 或 PR #NN。**grep 实际 filesystem 或 GitHub**。

若不确定编号,写 "最近 observation" / "today's PRs" 不写具体数字。

**错误示范**:
- observation #015:Claude 说 "observations.md 应从 #022 起",filesystem 是 #010 起
- observation #051:Claude 写 CI_KNOWN_RED v2 没 grep existing,差点覆盖有价值历史
- observation #063:Claude workspace docs 被 Steve 手动下载到 Backend local,Backend pull 时看到 unrelated uncommitted changes
- observation #074:Claude workspace 内 /home/claude/docs 和 /mnt/user-data/outputs 两地不同步,Steve 下载拿到旧版

**Day 3 新纪律**:**workspace-to-outputs sync**。任何 `/home/claude/docs/**` 修改必须立即 `cp` 到 outputs 副本。workspace 内两地不同步 = Pattern E 新变种。

### 规则 7:写 brief 前 grep `cross-task-shared-extension-backlog.md`

**Pattern B 防御**

每次发 Task brief 前,grep `cross-task-shared-extension-backlog.md` 看目标 Task 有无 pending shared 扩展。若有,brief 里**明示**"本 Task 同时扩 shared X,按 backlog 记录"。

按概率优先级处理:
- **必然**(inevitable):brief 里**强制 scope**,不能 defer
- **高概率**:brief 里**明示 scope**
- **中概率**:brief 里**提醒 check**,agent pre-verify 时自判
- **低概率**:不提,让 pre-verify 自然触发

**错误示范**(observation #023):Task 14 brief 未预见需扩 ws.ts v5:md:submit event,Frontend Task 8 已 defer,Backend Task 14 brief 时 Claude 再次遗漏。

### 规则 8:Brief 发出前按极简版最后 tick

**Scott 视角 — safety net**

发 brief 前,**最后一步是 tick 顶部 4 极简动作**:

- [ ] Grep `field-naming-glossary.md`
- [ ] View `cross-task-shared-extension-backlog.md`
- [ ] View brief 里引用的 function declaration + 文件头 TODO
- [ ] 🆕 Signal-related brief:dual-direction grep(client emit ↔ server handler)

**任一未 tick → stop 不发 brief,先解决**。

### 规则 9:涉及 signal / 算法细节时,不信 design doc,信源码

**Pattern D-2 防御:design doc ≠ actual implementation**

写 brief 涉及**具体 signal 公式 / 算法阈值 / marker 列表**时,**不能只读 design doc**(tasks.md / design-reference-full.md / v5-design-clarifications.md)。

原因:
- V5 经过 Round 2 + Round 3 + 多个 Task 迭代,**实现可能和 design doc 微漂移**
- Backend 实现时的简化(如线性公式代替分档)或发现(如某字段不可读)不一定回写到 design doc
- Claude 凭 design doc 推算精确数字会误导 agent

**Day 3 扩展**(observation #065):**外部 spec 文档(如 V5.0 补齐清单 PDF)也属于 design doc**,必须和 codebase cross-check。Claude 假设 "A7 sDecisionPauseQuality 是补齐清单新信号"即 Pattern A + C 双命中,因为 codebase 实际已有 `sDecisionLatencyQuality`(Task 13c Round 3 实装)。

正确做法:
1. Brief 只给**设计意图**(要达到什么目标 signal value)+ **目标 range**
2. **不给**精确 marker 列表 / 阈值分档 / 公式实测条件
3. 让 Backend **先读 signal .ts 源码**(pre-verify D),回报"实测条件"
4. Claude 用 Backend 给的实测条件,repost precise brief

**错误示范**(Task 17b Phase 1 pre-verify catch):
- Claude brief 写 "sReflectionDepth 读 mcAnswers + selfAssess.reflection"(tasks.md 原话)
- 实际源码只读 mcAnswers
- Liam selfAssess 扩 400 字对此 signal 零效果

---

### 规则 10(新 · Day 3):Signal-related brief 必须 dual-direction grep

**Pattern H 防御:test 绿 ≠ production ingest intact**

写任何涉及 runtime 数据(behavior events / submit events / socket payloads)的 signal brief 前,**必须 grep 完整 data pipeline 5 个 link**:

| Link | Grep 对象 | 验证方式 |
|------|----------|---------|
| 1. Client emit | `packages/client/**/*.{ts,tsx}` | `grep -r "socket.emit.*<eventName>"` |
| 2. ws.ts declaration | `packages/shared/ws.ts` | grep event 名在 ClientToServerEvents / ServerToClientEvents |
| 3. Server handler | `packages/server/src/**/*.ts` | `grep -r "socket.on.*<eventName>"` |
| 4. Persist to DB / metadata | `packages/server/src/**/*.ts` | grep prisma write 或 session.metadata 更新 |
| 5. Signal read from persist | `packages/server/src/signals/**/*.ts` | grep 目标字段 / 表名 |

**任何 link 结果 = 0 → Pattern H**。Brief 必须:
- (a) 显式 scope 修这个 link,OR
- (b) 标为 known-broken 并 defer,给 justification

**错误示范**(observation #068 / #071):
- `sDecisionLatencyQuality` 依赖 `behavior:batch` events
- Link 1 ✓(client tracker emit)
- Link 2 ✓(ws.ts 有 declaration)
- Link 3 **✗**(server handler 不存在)→ 11 个 AE signals 全部 null in production
- 单元测试绿 + Golden Path fixture 绿,**但生产 0 数据**
- V5.0 发布前夕才被 Production Coverage Audit catch,损失 Day 1-2 全部 signal brief 的 production validity

**正确示范**(V5.0 scope Task 22 brief 未来):
- Brief 开头明示 "dual-direction grep 结果:Link 1-2 ✓,Link 3 ✗(本 Task scope),Link 4-5 待 Link 3 到位后 Task 22 内完成"
- Backend 按 brief 建 server handler + persist + signal read 全链路

### 规则 11(新 · Day 3):Brief 内强制 Data Pipeline Verification section

**Pattern H 防御 + 机制性 enforcement**

凡是 brief 涉及 new signal / 现有 signal 计算逻辑变更 / runtime 数据流 **任一**,brief 内强制包含一个 **Data Pipeline Verification** section:

```markdown
## Data Pipeline Verification

| Link | File(verified path) | Status | Notes |
|------|--------------------|--------|-------|
| Client emit | packages/client/... | ✓ / ✗ | |
| ws.ts declaration | packages/shared/ws.ts:L | ✓ / ✗ | |
| Server handler | packages/server/.../socket.ts:L | ✓ / ✗ | |
| Persist | packages/server/.../service.ts:L | ✓ / ✗ | |
| Signal read | packages/server/src/signals/.../sX.ts:L | ✓ / ✗ | |
```

**验证纪律**:
- 每个 ✓ 必须有 `file:line` 引用(grep 输出直接复制)
- 每个 ✗ 必须在 Notes 栏说明 (a) scope 进本 Task 修 或 (b) known-broken defer 理由
- 缺此 section 的 signal brief 一律 reject re-draft(agent pre-verify 时可 stop-for-clarification)

**Golden Path 独立不够**:
- Golden Path fixture 直构最终数据结构(aiCompletionEvents[] 等),**绕过 Link 1-4**
- Golden Path 绿 = signal 算法绿,**不 = production pipeline 绿**(observation #071 根因)
- Pattern H 验证不能依赖 Golden Path,必须依赖真实 pipeline grep

**V5.0 发布 gate 新增**:
- Cold Start Validation 必须跑**真实 socket 连接**的 end-to-end session(非 fixture)
- assert 所有 48 signals(V5.0 最终 count)返 non-null
- 未通过 = V5.0 hold release

---

## 迭代频率

本 checklist 每周 review 一次,累加新 Pattern 或 retire 已消除 Pattern。

V5.1 开发期新命中的 Pattern → 立即加入。

## 衡量指标

- **目标**:Claude brief violations 率 20% → 2% (V5.0 发布前)
- **衡量**:Task 总数 vs stop-for-clarification 次数
- **Day 1-2 baseline**:20+ violations / 100 指令 = ~20%
- **Day 2 end**:Pattern H 1 次大规模命中(74.5% signals broken)— baseline 重置
- **Day 3 目标**:Pattern H 0 新命中(规则 10/11 enforcement 后)
- **V5.0 发布目标**:Pattern 总违反率 ≤ 2%

## 本文件和其他文档关系

- `observations.md`:Pattern 历史案例库(observation IDs)
- `cross-task-shared-extension-backlog.md`:Pattern B 防御依赖
- `field-naming-glossary.md`:Pattern C 防御依赖
- `CI_KNOWN_RED.md`:CI 已知红 job(Task owner 追踪)
- `v5-signal-production-coverage.md`(Day 2 end 新增):Pattern H baseline audit

---

## Pattern 统计表(Day 3 start — 含 Pattern H formalization)

| Pattern | 描述 | 命中次数 | 状态 | 严重度 |
|---------|------|----------|------|--------|
| A | V4 前置已复制 default FALSE | 6 | formalized | 中 |
| B | Cross-task shared extensions 发现过晚 | 3 | formalized | 中 |
| C | 字段名 / signal ID 相似导致 Claude 混淆 | 4 | formalized(Day 3 扩展 signal ID 场景)| 中 |
| D-1 | interface 字段 ≠ algorithm 消费字段 | 3 | formalized | 中 |
| D-2 | design doc ≠ actual implementation | 2 | cluster candidate | 中 |
| E | Claude memory ≠ filesystem truth | 4 | formalized(Day 3 扩展 workspace-to-outputs sync)| 中-高 |
| F | 凭记忆粗估 list / 完成度 / 工期 | 6 | **formalized with strict enforcement** | 高 |
| G | Scope expansion by silent acceptance | 2 | cluster candidate | 中 |
| **H** | **test 绿 ≠ production ingest intact** | **5 clusters** | **formalized(V5 开发期最严重 pattern)** | **严重** |

**Pattern D 总计 5 次**(D-1:3 + D-2:2),是 V5 开发期最顽固的 pattern family。

**Pattern H 危害说明**:Pattern H 一次大规模命中(Production Coverage Audit)暴露 V5 74.5% signals 生产不可用。严重度超过 A-G 所有 pattern。规则 10/11 是 V5.0 发布前 unblock 唯一路径。

---

## v2.1 变更总结(对比 v2.0)

**加入**:
- 极简版 3 → 4 动作
- 规则 10(Signal dual-direction grep)
- 规则 11(Brief Data Pipeline Verification section)
- Pattern 统计表加 H 行

**扩展**:
- 规则 2 扩到 signal ID / event 名 / type 名(不只字段)
- 规则 4 扩到文档产出场景(不只代码引用)
- 规则 6 扩到 workspace-to-outputs sync 场景
- 规则 9 扩到外部 spec 文档(PDF / 补齐清单 等)

**纪律加强**:
- 规则 3(Pattern F)明示 "每个数字前显式 tool call grep,不 grep 不写"
- 规则 10/11(Pattern H)明示 "缺失 Data Pipeline Verification section 的 signal brief 一律 reject"

**不变**:
- 规则 1 / 5 / 7 / 8
- 3 分层结构(🔴 极简 / 🟡 标准 / 🟢 详细)
