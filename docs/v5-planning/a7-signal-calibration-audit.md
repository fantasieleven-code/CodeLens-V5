# A7 sDecisionLatencyQuality — Calibration Audit

> **Task**: audit 已实装 signal `sDecisionLatencyQuality` 的 calibration 状态与数据可用性。
> **Branch**: `chore/a7-data-availability-audit`
> **Scope**: 只做分析 + 报告,不改任何 signal / fixture / 服务代码。
> **Origin**: V5.0 补齐清单 PDF 提议"A7 sDecisionPauseQuality",pre-verify
> 发现 signal 已作为 Task 13c Round 3 新 signal 实装为 `sDecisionLatencyQuality`。
> 故 scope 调整为 calibration audit。

---

## 第 1 部分 · 命名混淆记录

| 项 | PDF 命名 | Codebase 实际 |
|---|----------|---------------|
| Signal id | `sDecisionPauseQuality` | `sDecisionLatencyQuality` |
| 算法版本 | — | `sDecisionLatencyQuality@v1` |
| 定义位置 | — | `packages/server/src/signals/mb/cursor/s-decision-latency-quality.ts` |
| 注册位置 | — | `packages/server/src/signals/index.ts` L49 + L119 |
| Glossary 登记 | — | `docs/v5-planning/field-naming-glossary.md` L40 |
| 设计来源 | — | `v5-design-clarifications.md` L499-548 (Round 2 Part 3 调整 4) |
| 所属维度 | — | `AI_ENGINEERING` |

**结论**:PDF 是命名错误(Pattern C);**不重命名 codebase**。理由:

1. signal 已被 `mb-signals.test.ts` L62 / L586 / L629 / L661 的 23-signal count assertion 锁定,rename 会牵动 registry + test + glossary + observations + clarifications 多处;
2. `Pause` vs `Latency` 语义几乎等价(决策停顿时间 = 响应延迟),命名差异无业务价值;
3. PDF 是 V5.0 补齐清单,其作用是驱动当前任务发现现状,已达到该目的。

Pattern C (字段/signal 名相似混淆) 新命中 1 次,追加 `observations.md` 时
计入。

---

## 第 2 部分 · 现 signal 算法 summary

源:`packages/server/src/signals/mb/cursor/s-decision-latency-quality.ts`。

### 输入数据

```
input.submissions.mb?.editorBehavior?.aiCompletionEvents
```

`aiCompletionEvents[]` 由 Round 2 Part 3 调整 4 新增(类型定义
`packages/shared/src/types/v5-submissions.ts` L111-138)。每个事件可携带:

- `shownAt` — 补全弹出时的 wall-clock
- `respondedAt` — 候选人 accept / reject / 继续输入的时刻
- `documentVisibleMs` — `shownAt` 与 `respondedAt` 之间文档前台可见的毫秒数
- `accepted` / `rejected` — 布尔
- `shown` — 是否真的被候选人看到(reject-by-keep-typing 仍 true)

三个 `*At` + `documentVisibleMs` 字段在类型定义中均 **optional**(L128-137),
以保留 Task 11 legacy 数据兼容。

### 过滤 + 计算

```
validEvents  = events where shownAt && respondedAt && (documentVisibleMs ?? (respondedAt - shownAt)) >= 100ms
if validEvents.length < 5 → null (MIN_VALID_EVENTS)

latencies    = validEvents map (documentVisibleMs ?? respondedAt - shownAt)
useful       = latencies where ms <= 10_000 (AFK_CUTOFF_MS)
if useful.length == 0 → null

inGood       = useful where 500 <= ms <= 2000  (inclusive, GOOD_MIN_MS / GOOD_MAX_MS)
tooFast      = useful where ms < 500
goodRatio    = inGood / useful.length
tooFastRatio = tooFast / useful.length
```

### Band 判定(首轮命中生效)

| Band | 条件 | score | 含义 |
|------|------|-------|------|
| S_reading_and_thinking | `goodRatio ≥ 0.5` && `tooFastRatio ≤ 0.2` | 1.0 | 读了再决定 |
| A_mostly_thoughtful | `goodRatio ≥ 0.3` && `tooFastRatio ≤ 0.4` | 0.7 | 多数有思考 |
| C_reflex_accept | `tooFastRatio ≥ 0.7` | 0.2 | 大量反射接受 |
| B_mixed_signals | 其它 | 0.4 | 混杂,无法明确归类 |

### Null 返回场景

1. `validEvents.length < 5`(样本不足)
2. 所有 latencies > 10_000ms(全 AFK)
3. `aiCompletionEvents` 数组为空

---

## 第 3 部分 · Fixture calibration gap 表

4 个 Task 17b Golden Path fixture 的 `aiCompletionEvents` 实际数据:

| Fixture | 数据位置 | n | documentVisibleMs | latency (derived) | useful | inGood | tooFast | goodRatio | tooFastRatio | 实际命中 band | fixture 声明 tier | gap |
|---------|---------|---|-------------------|-------------------|--------|--------|---------|-----------|--------------|--------------|-------------------|-----|
| Liam (S) | `liam-s-grade.ts:155-165` | 10 | 1000ms × 10 | 1000ms | 10 | 10 | 0 | 1.00 | 0.00 | **S (1.0)** | S grade / 深思熟虑 | ✓ |
| Steve (A) | `steve-a-grade.ts:108-118` | 8 | 1500ms × 8 | 1500ms | 8 | 8 | 0 | 1.00 | 0.00 | **S (1.0)** | A grade / "稍短思考" | **+1 tier 过高** |
| Emma (B) | `emma-b-grade.ts:94-104` | 6 | 2500ms × 6 | 2500ms | 6 | 0 | 0 | 0.00 | 0.00 | **B_mixed (0.4)** | B grade / 偶尔慢 | ✓(偶然命中) |
| Max (D) | `max-c-grade.ts:73-83` | 5 | 500ms × 5 | 500ms | 5 | 5 | 0 | 1.00 | 0.00 | **S (1.0)** | D grade / `accepts everything blindly` | **+4 tier 严重过高** |

**解读**:

- **Liam ✓**:1000ms 是 good-range 正中,所有事件进 good → S 1.0,符合设计意图。
- **Steve +1 tier**:1500ms 仍在 good-range(500-2000 inclusive),goodRatio=1.0
  → 命中 S(1.0)而非 fixture 声明的 A(0.7)。gap 根因:8 条 event 全部 uniform
  1500ms,缺少 A band 需要的 "混合时间分布"。参见 mb-signals.test.ts L922-930
  的 A band 标准用例 `[800, 1200, 300, 3000, 3500, 3000]` — goodRatio=0.33 +
  tooFastRatio=0.17 → A 0.7。
- **Emma ✓(偶然)**:2500ms 超出 good-range 上界(2000),inGood=0 →
  goodRatio=0.0 不满足 S/A 下限,tooFastRatio=0.0 不满足 C 下限 → 落 B_mixed 0.4。
  与 fixture 声明 B tier 表面一致,但语义不符 — Emma 应是"有时深思熟虑,偶尔慢",
  而非"全部慢到超 2 秒"。
- **Max 严重过高**:500ms 精确卡在 `GOOD_MIN_MS = 500` 边界,算法 `ms >= 500`
  是 inclusive → goodRatio=1.0 → S band。fixture 注释 `accepts everything
  blindly` 显示这是反射接受候选人,应命中 C_reflex (0.2),gap 4 tier。

**累计 signal-level 分值偏差**(假设 fixture 重新校准为各自的 tier score):

| Fixture | 当前 signal score | 应有 signal score | Δ | AE 维度 signal 权重 | 维度贡献 Δ | composite 影响(AE=0.25) |
|---------|-------------------|-------------------|---|---------------------|-----------|--------------------------|
| Liam | 1.0 | 1.0 | 0 | ~1/13 | 0 | 0 pt |
| Steve | 1.0 | 0.7 | -0.3 | ~1/13 | -0.023 | ~-0.6 pt(低于现 A 下界的 miss margin) |
| Emma | 0.4 | 0.4 | 0 | ~1/13 | 0 | 0 pt |
| Max | 1.0 | 0.2 | -0.8 | ~1/13 | -0.062 | ~-1.5 pt(在 Max composite 14-24 range 内仍稳) |

**影响评估**:当前 Golden Path 期望带 Liam `[85,93]` / Steve `[77,85]` /
Emma `[54,62]` / Max `[14,24]` 均留有足够余量(>3 pt),因此即使 Steve/Max 现
signal over-score,composite 仍在带内,测试不会失败。但这掩盖了 signal 层面
的 calibration bug。

---

## 第 4 部分 · Max fixture 边界 bug 分析

### 具体 bug

```ts
// packages/server/src/tests/fixtures/golden-path/max-c-grade.ts:73-83
aiCompletionEvents: Array.from({ length: 5 }, (_, i) => ({
  timestamp: T0 + 60_000 + i * 5_000,
  shown: true,
  accepted: true,              // accepts everything blindly
  rejected: false,
  lineNumber: i + 3,
  completionLength: 30,
  shownAt: T0 + 60_000 + i * 5_000,
  respondedAt: T0 + 60_000 + i * 5_000 + 500,  // ← 卡 GOOD_MIN_MS 边界
  documentVisibleMs: 500,                        // ← 同上
})),
```

signal 算法:

```ts
// packages/server/src/signals/mb/cursor/s-decision-latency-quality.ts:40-41
const GOOD_MIN_MS = 500;
const GOOD_MAX_MS = 2_000;
// L59
const inGood = useful.filter((ms) => ms >= GOOD_MIN_MS && ms <= GOOD_MAX_MS).length;
```

500ms `>=` 500ms → inclusive → Max 所有 event 被判为 "reading and thinking"。

### 与算法设计意图的偏差

`C_reflex_accept` 期望 latency 明显低于 500ms(<500 的 tooFast)。
mb-signals.test.ts L915-919 的 C band 标准用例 `[50, 100, 200, 300, 400, 450,
4500]` 显示算法期望的 reflex 样本分布是 50-450ms,即 **肌肉记忆 Tab** 的延迟
带。Max fixture 作者若按 "accepts everything blindly" 的语义设计,正确
documentVisibleMs 值应在 `[50, 100, 200, 300, 400]` 这种区间,而非 500。

### 根因判断

根因是 **fixture 作者对 `GOOD_MIN_MS` 边界不敏感**,把 500ms 当作"最小有效
时间"。但算法的 500ms 是 "开始思考的下界",不是"数据有效性的下界"。两个语义
被同一个常数承担,容易混淆。

### 严重度

- **Golden Path 测试层**:低。Max composite 14-24 带宽 10 pt;Max signal
  over-score 贡献 composite ~+1.5 pt,仍在带内。
- **Signal 语义层**:高。Max 明确是 reflex-accepter 原型,却获 S 分,与
  signal 全部设计意图相反。
- **Production 影响**:见第 6 部分 — signal 在 production 实际 **完全不工作**
  (server 无 ingest handler),因此 fixture 的 production-level 影响为 0;
  当前仅影响 Golden Path 和 signal 单元测试的"看似通过"假象。

---

## 第 5 部分 · 真实候选人数据预估

### 假设

- MB session 时长:30min(Cursor mode 完整 session)
- 补全触发:COMPLETION_DEBOUNCE_MS = 500ms(`packages/client/src/lib/runtime.ts`)
- Monaco 限制:单文件单位置同时只有 1 个 inline completion 存在

### 补全事件数量分布(估)

| 候选人层次 | AI 使用倾向 | 估 30min 内 shown 事件数 | ≥5 valid 概率 |
|------------|-------------|--------------------------|----------------|
| S 级(积极用 AI,深思熟虑) | 主动触发 + 读完决定 | **20-40** | 接近 100% |
| A 级(主用 AI,有选择) | 混合反射 + 审阅 | **15-30** | 接近 100% |
| B 级 | 半依赖 | **10-25** | ~95% |
| D 级(近乎不用 AI) | 手写为主 | **0-10** | ~50% |

### latency 分布(估)

| 候选人层次 | 期望 latency 分布 | 期望命中 band |
|------------|-------------------|----------------|
| S | 多数 600-1500ms,少量 reflex,极少 AFK | S 1.0 |
| A | 多数 400-1500ms,部分 reflex | A 0.7 |
| B | 50% good-range + 50% 其他 | B 0.4 |
| D 反射型 | 多数 <400ms | C 0.2 |
| D 不用 AI 型 | 样本不足 | **null** |

### "D 级反射型 vs D 级不用型"不可分问题

`MIN_VALID_EVENTS = 5` 导致:

- D 级反射候选人若产生 ≥5 shown 事件 → 被正确识别为 C_reflex;
- D 级不用 AI 候选人产生 <5 shown 事件 → null → 无法区分 "反射" vs "不用"。

这是 signal 的已知局限,非 bug。若未来想区分,需引入 `sAiUsageIntensity` 之类
的补充 signal 先门控。

---

## 第 6 部分 · Event tracker 捕获率 audit

### Frontend 链路(可信度高)

`packages/client/src/components/editors/InlineCompletionProvider.tsx`:

| 环节 | 实现质量 | 备注 |
|------|----------|------|
| Shown 检测 | ✓ 高 | Monaco 0.55 `provideInlineCompletions` 返回 item 即视为 shown |
| Accept/Reject 检测 | ✓ 高 | `handleEndOfLifetime(reason.kind)`:Accepted(0) / Rejected(1) / Ignored(2)。Ignored 归入 rejected(V5.0 契约 L29) |
| Item 关联 | ✓ 高 | WeakMap keyed on Monaco item reference — 跨 provide→handleEndOfLifetime→disposeInlineCompletions 稳定 |
| 快键连击 | ✓ 高 | 每个 item 独立 tracker;多 item 并发不串 |
| Debounce | ✓ 高 | AbortController + CancellationToken 双层;快速键入自然短路,不产生 shown 事件(降低低质样本,不算丢失) |
| 前台时间计 | ✓ 中高 | `chat-visibility-tracker.ts` 监听 `visibilitychange`,只累加前台 ms |
| **Provider 拆卸丢事件** | ✗ 低 | `disposeInlineCompletions` 安全网:若 completion shown 后 provider 被拆(如 enabled=false / unmount 中途),tracker cancel 但不 emit event — 这是已知的丢事件通道 |
| `behavior:batch` 载荷分片 | ✓ 高 | 50KB 上限;递归二分;单体超限 warn-drop(低概率场景) |

**Frontend-only 预估捕获率**:85-95%。唯一已知丢失通道是 "Provider 中途被
拆卸"(文件切换期间有 shown completion),日常使用很罕见。

### **Backend 链路(🔴 关键发现:无 ingest handler)**

**事实**:client 通过 `behavior:batch` socket event 发送所有 MB Cursor 行为事件
(包括 `ai_completion_shown` / `ai_completion_accepted` / `ai_completion_rejected`
/ `ai_completion_responded`),但 **server 端没有 `behavior:batch` 的 `socket.on()`
注册**。

**证据**:

1. Shared 协议定义 `'behavior:batch'` 于 `packages/shared/src/types/ws.ts:27-29`:
   ```ts
   'behavior:batch': (data: {
     events: Array<{ type: string; timestamp: string; payload: Record<string, unknown> }>;
   }) => void;
   ```

2. Client 发 `socket.emit('behavior:batch', ...)` 于
   `packages/client/src/hooks/useBehaviorTracker.ts:122`。

3. Server 全仓 grep `'behavior:batch'` / `socket.on(.*behavior` 命中 **0 次**
   (packages/server/**)。

4. `packages/server/src/socket/mb-handlers.ts` 仅注册:
   - `v5:mb:planning:submit` / `v5:mb:standards:submit` / `v5:mb:audit:submit`
   - `v5:mb:chat_generate` / `v5:mb:completion_request`
   - `v5:mb:file_change` / `v5:mb:run_test`
   - `v5:mb:visibility_change`
   没有 `behavior:batch`。

5. `packages/server/src/services/modules/mb.service.ts` 只有
   `appendVisibilityEvent` 写入 `editorBehavior.documentVisibilityEvents`。
   **无任何路径写入 `editorBehavior.aiCompletionEvents`**。

### **Production 捕获率:0%**

- 真实候选人的 MB submission 中,`editorBehavior.aiCompletionEvents` 始终为 `[]`(默认空数组,由 mb.service.ts L205 的 snapshot spread 产生)。
- Signal `compute()` 的 L45 早返回 `nullResult`(events.length === 0)。
- **无论候选人是 S 级深思熟虑还是 D 级反射接受,signal 在生产环境都返 null**。

### 影响

1. **V5.0 生产:signal 无效**,所有候选人此 signal = null。
2. **AE 维度 N/A rescaling 机制**会把缺失权重分摊给其他 AE signals,因此总分
   不会报错,但 AE 维度失去此 signal 的差分能力。
3. **Golden Path 测试绿** 但不反映生产现实 — fixture 直接构造数组绕过了
   ingest 缺失。这是 Pattern "test ≠ production" 的典型表现。

---

## 第 7 部分 · 3 option recommendation

### Option A — V5.0 修(Task 17b Phase 5 或独立小 PR)

**Scope**:

1. Fixture 修正:
   - Max:`documentVisibleMs: 500` → 仿 mb-signals.test.ts C band 用例
     `[50, 100, 200, 300, 400]`(变化的低于 500 值,goodRatio=0 /
     tooFastRatio=1.0 → C 0.2)
   - Steve:uniform 1500ms → 引入 tooFast + good 混合分布(如
     `[800, 1200, 300, 1500, 1500, 400, 1500, 1800]`,goodRatio=5/8 /
     tooFastRatio=2/8=0.25 → A 0.7)
2. Server ingest handler(`packages/server/src/socket/behavior-batch-handler.ts`
   新文件):
   - 监听 `behavior:batch`,按 type 分发 `ai_completion_shown` /
     `ai_completion_responded`
   - 按 `lineNumber + shownAt` 配对 shown → responded,组装 `aiCompletionEvents[]`
     条目(携带 shown / rejected / shownAt / respondedAt / documentVisibleMs)
   - 写入 `session.metadata.mb.editorBehavior.aiCompletionEvents`(append mode)
3. 对应端到端集成测试(mock socket → behavior:batch → 校验 metadata 被更新)
4. 更新 Golden Path FIXTURE_EXPECTATIONS 以吸收新 signal 值

**Estimated effect**:

- 生产 signal 捕获率从 0% → 85-95%(Frontend 侧的已知丢失通道除外)
- Fixture 4 组全部落对应 tier,Signal 单元测试 + Golden Path 校准双绿
- AE 维度恢复此 signal 的差分贡献

**Risk**:

- Server handler 约 1-2 天(解析 + 配对 + persist + 单元测试),远超 Phase 5
  "小 PR" 口径
- 配对逻辑需定义清楚 "shown 与 responded 如何匹配"(timestamp 最近?
  lineNumber+filePath?)— 涉及 Frontend 侧 emit payload 的轻度修改
- 吸收新 signal 值进 expectations 需要重跑校准(+0.5 天)
- **scope 风险**:此改动性质是 bug 修复但工作量接近一个独立 Task;混入
  Task 17b Phase 5 会突破 scope discipline

### Option B — V5.1 修(保持 V5.0 现状 + 文档警告)

**Scope**:

1. V5.0:不改 signal / 不改 fixture / 不写 server handler
2. 立即在 `observations.md` 追加一条:A7 signal 在 V5.0 生产不工作
   (server 未实装 behavior:batch ingest),Golden Path 通过是 fixture 直构
3. 立即在 `CI_KNOWN_RED.md` 的 "发布影响" 部分或 `cross-task-shared-extension-backlog.md`
   追加"V5.1 Task 待建:behavior:batch server handler + aiCompletionEvents
   ingest"(owner: V5.1 MB 数据完善 Task)
4. V5.1:独立 Task 完成 Server handler + Fixture 修 + 实际 session 校准

**Estimated effect**:

- V5.0 期间此 signal 零贡献(AE 维度 N/A rescale 吸收)
- V5.1 signal 转为生产可用;V5.0 历史 session 无 aiCompletionEvents 数据不可追溯
- Calibration 团队明确知晓此 signal 当前为 no-op,不会误把 null 当"未
  归类反射候选人"

**Risk**:

- V5.0 期间 ~ 3 周此 signal 零差分 — 对 AE 维度差分能力轻度削弱
- 若 V5.0 扩到 V5.0.x patch 而非 V5.1,需拆分独立 patch Task
- 低:纯文档警告成本极小,跨 session 记忆由 observations + backlog 承载

### Option C — Ship as-is(不改任何东西)

**Scope**:

1. 不改代码
2. 不写文档警告

**Estimated effect**:

- V5.0 生产 signal null(同 Option B)
- Calibration 团队可能把 null 解读为"此候选人无补全行为",导致误判
- Fixture 过分 tier(Steve +1 / Max +4)维持隐藏;未来任何 fixture 重构风险踩坑

**Risk**:

- **高**:signal 测试绿 + Golden Path 绿 营造 "完全就绪" 假象;未来任何
  人想依赖此 signal 做 calibration 决策时踩坑
- Pattern "test ≠ production" 继续膨胀
- 与 V5 防御文档系统(尤其 `cross-task-shared-extension-backlog.md`)精神
  违背 — 明确的 pending 延期不记录 = 记忆从未发生

### Option 对比 + 推荐

| Option | 代码改动 | 文档改动 | 工期 | 生产 signal 可用 | V5.0 scope 风险 | 后续记忆丢失风险 |
|--------|----------|----------|------|------------------|------------------|------------------|
| A | 中(1.5-2 天) | 小 | 高 | ✓ V5.0 | 高 | 低 |
| B | 无 | 小 | 低(~1h) | V5.1 起 | 低 | 低 |
| C | 无 | 无 | 0 | V5.1+(希望有人记得) | 无 | **高** |

**推荐:Option B**。理由:

1. **V5.0 runway 受压**:Task 14 / 15 / 17 cleanup / A1 sSelfCalibration / Task
   18/19/20/21 尚未完成,剩余 15-17 工作日,此 signal 不在 critical path 上。
2. **Option A 的 server handler 是独立工作量**(1-2 天),挂在 Task 17b
   Phase 5 小 PR 违背 scope discipline;若独立 Task 做,应以 V5.1 规划。
3. **Option C 的隐藏代价最高**:signal-level bug + production gap 同时隐身,
   后续 calibration 决策可能踩坑。
4. **Option B 的文档记录成本极小**,满足 V5 防御文档纪律,风险可控。

**配套动作(Option B 选定后):**

1. 本 PR 自身包含此 audit 文档
2. 追加 observations.md entry(A7 命名混淆 + Server ingest gap + Max 边界 bug 的 Pattern C / production-gap 归档)
3. 追加 `cross-task-shared-extension-backlog.md`:"V5.1:behavior:batch server
   handler + aiCompletionEvents ingest(必然)+ Max/Steve fixture
   re-calibration(高概率)"

---

## 附录 A · 本 audit 产出的追加 pattern 观察

- **Pattern C(signal/字段名相似混淆)** 命中 +1:A7 sDecisionPauseQuality
  (PDF)vs sDecisionLatencyQuality(codebase)。Agent pre-verify 时通过 grep
  codebase 拦截,未进入实装阶段。
- **新 Pattern 候选:"test ≠ production"** — signal 单元测试 + Golden Path
  fixture 双绿,但生产 ingest 断链。暂计为 1 次(观察值),后续命中 3 次可
  升级 signal candidate。

## 附录 B · 验证本 audit 的 reproducibility

核心事实(本文引用的 signal 算法 / fixture 数据 / server 缺 handler)均可由
以下命令复现:

```bash
# 1. 定位 signal + 验证注册
rg "sDecisionLatencyQuality" packages/server/src/signals

# 2. 验 server 无 behavior:batch handler
rg "'behavior:batch'|socket\.on.*behavior" packages/server/src

# 3. 验 4 fixture 的 aiCompletionEvents 初始化
rg -n "aiCompletionEvents: Array.from" packages/server/src/tests/fixtures/golden-path

# 4. Signal 单元测试 band 定义
rg -n "sDecisionLatencyQuality.*4 bands" packages/server/src/signals/mb/mb-signals.test.ts
```

---

**文档状态**:完成,等待 Steve 决策 Option A / B / C。
