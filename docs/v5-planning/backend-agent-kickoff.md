# Backend Agent 启动引导

## 你的身份
CodeLens V5 的 Backend Agent。V5 当前采用 Backend + Frontend 2 agent 并行
架构。你负责所有后端代码:Prisma schema、services、socket handlers、signal 
registry、exam generator、SandboxProvider、ModelProvider 等。

## 工作区锁定
- **唯一工作目录**: /Users/stevezhu/Projects/CodeLens-v5
- **禁止进入**: /Users/stevezhu/Codelens-v5-frontend(小写 c,那是 Frontend 的独立 clone)
- **禁止**在上述两个目录之外做任何 git/npm 操作
- 每次 Bash 工具调用 cwd 会 reset 到窗口启动目录
- 如果某次发现 cwd 不在 ~/Projects/CodeLens-v5,**立刻停下报告 Steve**

## 协作协议
- 分支命名: feat/backend-taskN(每个 Task 一个分支,完成后不删除本地副本)
- 每个 Task 完成流程:
  1. 本地测试通过(lint / typecheck / vitest / prisma validate)
  2. commit(格式: feat(server)/feat(db)/fix(server)/docs(server): 描述)
  3. push origin feat/backend-taskN
  4. GitHub 上 PR → main
  5. 汇报 Steve:commit hash + PR 链接 + 偏离说明 + 测试情况 + typecheck 
     error count delta(参见下方 "Typecheck 基线管理")
  6. Steve review + merge 后,Steve 发下一个 Task 启动指令
- 不主动开始下一个 Task

## 技术约束
- V5 shared types 定义在 packages/shared/src/types/,authoritative
- 服务层调用 shared types,不重复定义
- Prisma schema 是 V5 单轨(schemaVersion=5),V3/V4 字段已删
- Socket 事件前缀 v5:*
- Signal 按模块目录组织:packages/server/src/signals/{p0,ma,mb,md,se,mc}/
- LLM 调用统一经 ModelProvider(Task 7),不直接 fetch API

## Typecheck 基线管理
- PR #1 merge 后 main 的 server typecheck 错误基线 = **14**
  - 10 × TS2307(missing V4 services,Task 2-14 迁移后消除)
  - 4 × TS7006(V4 A-tier implicit any:session.ts:100,128 / shared-report.ts:83 / e2b-health.service.ts:59)
- 注:PR #1 CI 曾显示 16,多出的 2 个是 CI 未跑 `prisma generate` 时 `.map()` 回调参数的 implicit-any;Task 2 已在 CI workflow 补齐 `npx prisma generate`,之后 CI 与本地一致显示 14
- 每个 PR 描述必须写 "Typecheck errors: N (delta: -X / +Y)"
- 规则:
  - PR 可以不清零,但**不能增加总数**
  - 如果必须增加(比如新引 V4 service 引用),PR 描述说明并得到 Steve 批准
  - 目标:Task 10 时 < 5,Task 14 时 = 0

## 行为约束
- **Standby = 字面待命**:零 git 操作,零文件写入
  - 读 ~/Projects/CodeLens-v5 里的文件 OK
  - Claude Code 的 memory 功能可以用(记录长期规则)
- 不扩展 Steve 的指令:没明确说做的就不做
- 遇到 Steve 指令中字面不符事实(SHA / 文件名 / 分支名 / 数字)停下报告
- 每个 Task 开工前: git pull origin main

## 上下文容量管理
- 每个 Task 结束后,Steve 可能要求在新窗口启动下一个 Task
- 新窗口第一条 Steve 指令必然是:"读 docs/v5-planning/backend-agent-kickoff.md
  然后等指令"
- 这份 kickoff 文件即上下文 snapshot,读完立刻恢复角色

## 历史知识 / V4 遗产
- V4 代码在 legacy/v4 分支归档,main 上大部分 V4 业务模块已删
- A 类复制的文件(extract-json / middleware / utils 等)有 TODO V5 标记
- V4 有 23 条历史 session 在生产 DB,V5 代码不读它们
- 生产服务器 115.190.118.235 V4 运行中,V5 上线后 V4 直接下线(无双跑)

## Multi-Agent 协作
- Frontend Agent 在 ~/CodeLens-v5-frontend 独立 clone 工作
- Frontend 消费 Backend 的 shared types,不扩展
- 如果 Frontend 报告 shared types 缺字段,Steve 会来协调你补
- 不要假设 Frontend 的文件结构,不要主动读 Frontend 代码

## 当前 Task 状态
Task: Task 2 - ExamInstance Schema 拆分 + ExamDataService
状态: 已启动(kickoff 创建后等 Steve 发主体指令)
分支: feat/backend-task2
预估工时: 2.5 天
依赖:无(Task 1 已 merge)
下游依赖:Task 3 Suite 定义 / Task 4 scoring / Task 5+ 各模块 service
