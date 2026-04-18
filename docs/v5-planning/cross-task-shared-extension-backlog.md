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

### **Backend Task 14 owners**(MD 后端)

| 扩展项 | 概率 | 影响 | 注意 |
|--------|------|------|------|
| `packages/shared/ws.ts`:`v5:md:submit` event + payload shape | **必然** | 被 Frontend Task 8 消费(当前 deferred,本地 setSubmission 后等 Task 14 接 socket) | Task 14 brief 必须**明示扩 ws.ts** |
| `packages/shared/ws.ts`:`v5:md:submit:response` event(如需) | **中概率** | Backend 可能回推 scoring 完成 event | Brief 提,不硬要求 |

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
