# CodeLens V5.1 交接文档

更新时间:2026-05-01  
基线分支:`main`  
基线提交:`96e250f docs(release): mark old scope timeline superseded (#153)`  
基线 CI:`25195956419` 全绿(`lint-and-typecheck` / `test` / `e2e` / `build` / `docker`; `prompt-regression` 按条件跳过)

## 交接结论

V5.0 当前不是“带红上线”状态。已知 V5.0 release gate 已闭合:48 个 runtime signals 在 Cold Start real-session validation 中 0 missing / 0 null / 0 N/A; Admin report hydration、candidate self-view、candidate submit persistence、Layer 2 module content parity、PromptRegistry seed-placeholder fail-closed、CI known-red 清零都已落地。

V5.1 的目标不是补一个 V5.0 blocker,而是把 V5.0 中为了 release 边界保守留出的工程债、观测质量、LLM 质量门和 legacy bridge 清掉。后续接手请先按本文档复核当前事实,不要把历史 backlog 中已经闭合的项重新当作 blocker。

## 当前已确认事实

- GitHub open issues:当前为空。
- 本地 untracked 仅有 `packages/server/.env.bak-*` 三个备份文件,属于环境备份,不纳入 PR,也不要删除。
- `docs/v5-planning/CI_KNOWN_RED.md` 当前 known-red 为空; e2e / prompt-regression / docker 历史红已关闭。
- `/report/:sessionId` 是 demo/design preview route,不是生产公司报告入口。生产公司报告入口是 Admin session detail + admin report API; 候选人只看 `/candidate/self-view/:sessionId/:privateToken` 摘要。
- Prompt seed rows 仍可存在于 DB,但 `PromptRegistry.get()` 已 fail-closed:seed placeholder 不会再流入模型 prompt。
- `edit_session_completed` 已有客户端 `useEditSessionTracker`、`behavior:batch` server dispatch、service append、integration/e2e smoke 覆盖; 不再是 Task 30b open gap。
- `process.env → env.X` 迁移已收敛到允许边界:`env.ts` / `config/secrets.ts` / test setup 读取 `process.env`,业务代码使用 `env.*`。

## 已知未修复 / V5.1 待做

### P1 · A14b LLM 信号方差监控

状态:未实现,有显式 skip marker。  
入口:`packages/server/src/__tests__/reliability/pure-rule-signals.test.ts` 中 `describe.skip('A14b · LLM signal variance monitoring (V5.0.5 deferred)', ...)`。

原因:V5.0 采用 deterministic / fallback gate 保证 release 稳定; LLM 信号需要 tolerance band,不能用 pure-rule deep-equal。  
建议交付:
- 为 3 个 MD LLM whitelist signals 建立真实 provider 或稳定 mock-to-real 迁移矩阵。
- promptfoo 从当前最小 smoke 扩到 3-signal matrix。
- CI secret 未准备时不要让主 CI flaky;可以先 nightly / manual workflow。

验收:
- 重复运行同一 fixture,LLM 信号落在 ratify 过的 tolerance band。
- 失败时能区分 prompt drift、provider variance、parser/schema drift。

### P1 · 真实 prompt 内容生产化

状态:seed placeholder 已 fail-closed,但真实 v2 prompt 内容未系统生产化。  
入口:
- `packages/server/src/services/prompt-registry.service.ts`
- `packages/server/src/services/prompt-keys.ts`
- `packages/server/src/signals/md/llm-helper.ts`
- `packages/server/src/services/mc-probe-engine.ts`

原因:V5.0 允许内置 deterministic fallback / built-in guidance;不能让 TODO seed 文案进入模型。  
建议交付:
- 为 generator step0-step8、MD LLM whitelist、MC probe engine 可配置 prompt、MB chat generate 分别定义 active v2 prompt。
- 每个 prompt 配 prompt-regression fixture,不是只改 seed 文本。
- PromptRegistry 仍保持 fail-closed;不要为了“跑通”放开 placeholder。

验收:
- seed placeholder 存在时仍 rejected。
- active v2 prompt 能被正确取用,模板变量完整替换,无裸 `{{var}}`。

### P1 · Session scoring result replay / migration strategy

状态:V5.0 production scoring pipeline 已可算;历史 session 的 `metadata.signalResults` / report replay 策略仍需要 5.1 决策。  
入口:
- `packages/server/src/services/scoring-hydrator.service.ts`
- `packages/server/src/services/scoring-orchestrator.service.ts`
- `packages/shared/src/types/v5-session.ts`
- `packages/shared/src/types/v5-scoring.ts`

问题:信号版本、algorithmVersion、computedAt、historical metadata shape 变更后,旧 session 是“重算当前版本”还是“冻结当时结果”需要明确。  
建议交付:
- 定义 report snapshot policy:冻结、重算、或双轨显示。
- 若引入 `SessionMetadata.signalResults`,写 migration/backfill 脚本和 admin 可观测字段。
- 明确 `V5ScoringResult` 与 legacy `ScoringResult` 的长期命名边界。

验收:
- 老 session 可打开 report,不会因为新 signal shape 变更出现 N/A。
- 新 session 的 scoring result 可追踪 signal version 和 computed time。

### P1 · V5-native socket event / payload migration

状态:V5.0 保留若干 legacy bridge,生产可用但不是长期形态。  
入口:
- `packages/shared/src/types/ws.ts`
- `packages/server/src/socket/*`
- `packages/client/src/lib/persistCandidateSubmission.ts`
- `packages/client/src/hooks/useBehaviorTracker.ts`

已知点:
- `self-assess:submit` 仍带 V4→V5 normalize bridge。
- `behavior:batch` 是 shared envelope,不是每种行为单独事件。
- 多个 submit payload 仍显式带 `sessionId`;未来可由 socket middleware 统一注入。

建议交付:
- 设计 V5-native event name 和 payload shape,保留 deprecation window。
- 加 socket middleware 统一 sessionId / candidate identity 注入,减少每个 handler 重复校验。
- 客户端先 dual-emit 或 feature-flag,服务端 dual-accept,再移除 legacy shape。

验收:
- 所有 submit / telemetry handler 有同一类 ack / timeout / error envelope。
- legacy event 使用量可观测,降到 0 后再删。

### P1 · Candidate / Admin report 边界继续硬化

状态:V5.0 已禁止候选人访问 full report CTA,但 5.1 应继续做边界审计。  
入口:
- `packages/client/src/pages/CompletePage.tsx`
- `packages/client/src/pages/CandidateSelfViewPage.tsx`
- `packages/client/src/pages/admin/pages/AdminSessionDetailPage.tsx`
- `packages/client/src/pages/ReportViewPage.tsx`

建议交付:
- 确认所有候选人完成态只指向 self-view summary。
- `/report/:sessionId` 继续保持 demo/design preview,不要接生产 admin report。
- Admin report 与 candidate self-view 的字段白名单分离,避免后续 section registry 复用时越权展示。

验收:
- Playwright 覆盖 candidate complete flow 中没有 full report 链接。
- Admin report 仍展示完整 view model;candidate self-view 不暴露公司内部评分细节。

### P2 · computedAt / algorithmVersion 责任边界整理

状态:V5.0 可用,但实现分散。  
入口:
- `packages/server/src/signals/**`
- `packages/server/src/services/signal-registry.service.ts`
- `packages/server/src/services/scoring-orchestrator.service.ts`

问题:部分 signal 自己构造 metadata,长期会导致版本戳和计算时间散落在 48 个 signal 文件。  
建议交付:
- 将 `computedAt` 统一上移到 registry/orchestrator/hydrator 层。
- signal 只返回业务分数、evidence、algorithmVersion 或 algorithm key。
- 一次性测试所有 signal result metadata shape。

验收:
- 48 个 signal 的 metadata shape 一致。
- 单个 signal 不需要知道运行时 clock,测试更稳定。

### P2 · Admin position / org scope gap audit

状态:历史 Frontend audit 标记过 `V5AdminPosition` scope gap,当前未作为 V5.0 blocker。  
入口:
- `packages/shared/src/types`
- `packages/client/src/services/adminApi.*`
- `packages/server/src/routes/admin.ts`

建议交付:
- 先审计是否仍有 frontend-local shim 或 admin position 概念未进 shared。
- 若存在,以 shared type 为 single source of truth,前后端同步迁移。

验收:
- client admin API 不再有与 shared 1:1 重复的本地类型。
- admin session/create/stats/report 四类 response shape 全部由 shared 导出。

### P2 · Candidate guard server-source-of-truth

状态:V5.0 可用;部分候选人访问状态仍依赖本地 consent/session flag。  
入口:
- `packages/client/src/pages/candidate/*`
- `packages/server/src/routes/candidate*`

建议交付:
- 提供轻量 `/api/candidate/session/:id/status` 或等价端点,由服务器返回 consent、session status、self-view eligibility。
- 本地 storage 只做缓存,不能作为授权事实。

验收:
- 清空 localStorage 后,合法 token 仍能恢复正确候选人状态。
- 过期/错误 token 不会因为本地 flag 绕过服务端判断。

### P2 · CI / e2e 维护项

状态:V5.0 CI 绿,但仍有维护型优化。  
入口:
- `.github/workflows/ci.yml`
- `e2e/*.spec.ts`
- `e2e/playwright.*.config.ts`

建议交付:
- e2e TypeScript 已纳入 CI;后续可补 `eslint e2e --ext .ts`。
- Playwright smoke config 可优化为 backend-only webServer,减少重复启动时间。
- prompt-regression 若接真实 provider,拆 nightly/manual,避免主线 flake。

验收:
- 主线 CI 仍稳定全绿。
- e2e lint 不引入大量格式 churn。

### P2 · shared dist / prebuild hook

状态:历史 frontend 多次踩到 shared dist 未构建;当前 release 通过,但 monorepo 开发体验仍可改善。  
入口:
- root `package.json`
- `packages/shared/package.json`
- client/server build scripts

建议交付:
- 明确 client/server dev/test 前是否自动 build shared。
- 避免每个开发者手动记忆 `shared` build 顺序。

验收:
- fresh clone 后按 README 命令能跑 client/server/test。
- CI 与本地命令顺序一致。

### P3 · CursorBehaviorLabel / capability profile 增强

状态:显式 V5.1 backlog。  
入口:`packages/server/src/services/scoring-orchestrator.service.ts` 注释中 `computeCursorBehaviorLabel is V5.1 backlog`。  
建议交付:
- 实现 `computeCursorBehaviorLabel(signals)`。
- 评估 `CursorBehaviorLabel.score` / confidence 是否进入 shared。
- Report view 增加可解释 evidence,不要只给标签。

验收:
- label 与 MB cursor signals 的 evidence 可追溯。
- 低数据量时返回 `undefined` 或低置信,不硬判。

### P3 · sAestheticJudgment / commentType `style`

状态:V5.2+ 候选,不是 V5.1 必做。  
背景:MA Round 2 commentType 当前锁定 4 值;`style` 曾被明确推迟,避免扩大 A6 scope。  
建议:如果恢复,必须同步 shared schema、ModuleAPage select、server zod、scoring signal 和 fixtures,不要只在 UI 加选项。

### P3 · 文档 / 流程债

状态:不影响运行,但影响下一轮多人协作质量。  
建议交付:
- 将 cross-repo mock sync rule 写入 checklist,避免 split-repo frontend mock 与 backend/shared drift。
- 整理 `docs/v5-planning` 中 superseded 历史段落,保留 current snapshot 指针。
- 继续维护 `observations.md`,但新任务 brief 应优先引用 current release snapshot,不要引用旧 47-signal audit 作为现状。
- HireFlow `generation_meta_prompt.md` 第零步 diagnostic layer 是 cross-product backlog,不应混入 CodeLens V5.1 release gate。

## 明确不要误修

- 不要把历史 “47 signals / 41 active” 当成当前事实;当前 release truth 是 48 runtime signals Cold Start 全通过。
- 不要恢复候选人 full report CTA;candidate self-view 是伦理和访问边界。
- 不要为了让 prompt 调用“成功”而放开 seed placeholder;正确做法是新增真实 active prompt version。
- 不要把 `/report/:sessionId` 接成生产公司报告入口;它是 demo/design preview。
- 不要重引入已删除的 stale socket contracts,例如 candidate submit/pause local-only contract 或 Module C start/complete placeholder。
- 不要只改 client mock 不改 shared/server canonical shape;所有跨 package shape 先从 shared 类型和 server zod 对齐。

## 建议 V5.1 执行顺序

1. 复核基线:拉最新 `main`,确认 CI 全绿、open issues 空、untracked 只有 env backup。
2. 做 A14b:LLM variance + promptfoo 3-signal matrix,先 manual/nightly,稳定后再考虑进主 CI。
3. 做 PromptRegistry v2 prompt productionization:真实 prompt 内容、prompt-regression、fail-closed 保持。
4. 做 socket V5-native migration plan:sessionId middleware、legacy bridge deprecation、统一 ack/timeout envelope。
5. 做 scoring replay policy:明确历史 report 是冻结还是重算,落 `signalResults` migration/backfill。
6. 做 report/candidate boundary audit:继续防止 full report 泄露到 candidate surface。
7. 做维护项:computedAt 上移、admin shared type audit、shared prebuild hook、e2e lint、文档整理。

## 上线前复核清单

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npx playwright test` 或项目当前 CI 使用的 e2e 命令
- Golden Path / Cold Start real-session run:admin 创建 session → candidate 跑完 P0/MA/MB/MC/MD/SE/self-view → admin report 打开。
- Report null scan:Admin report 和 candidate self-view 均不出现非预期 `N/A` / `待评估`。
- Prompt check:active prompt 无 seed TODO marker;placeholder row 被拒绝。
- Access check:candidate token 不能访问 admin full report;admin token 不能绕过 org scope。

## 主要参考

- `docs/v5-planning/cross-task-shared-extension-backlog.md`
- `docs/v5-planning/CI_KNOWN_RED.md`
- `docs/v5-planning/v5-release-readiness-ledger.md`
- `docs/v5-planning/v5-module-pipeline-audit.md`
- `docs/v5-planning/observations.md`
- `packages/server/src/__tests__/cold-start-validation.test.ts`
- `packages/server/src/__tests__/reliability/pure-rule-signals.test.ts`
- `packages/server/src/services/prompt-registry.service.ts`
- `packages/server/src/services/scoring-orchestrator.service.ts`
