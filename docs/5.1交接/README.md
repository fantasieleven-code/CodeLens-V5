# CodeLens V5.1 交接文档

更新时间:2026-05-05
基线分支:`main`  
基线提交:`e2d3d19 fix(mc): use scoring snapshot for probe signals (#157)`
基线 CI:`25367447936` 全绿(`lint-and-typecheck` / `test` / `e2e` / `build`; `prompt-regression` 全绿; `docker` 按条件跳过)

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
- MC probe snapshot 已改为先读 canonical `Session.scoringResult.signals`,再用 `metadata.signalResults` 覆盖交互期增量;不再依赖历史 `metadata.signalResults` mirror 才能追问。

## 已知未修复 / V5.1 待做

### P1 · 真实 LLM provider 方差监控

状态:A14b deterministic 主线 gate 已闭合;真实 provider nightly/manual workflow 已有 skip-safe 执行面。V5.1 prep 已补结构化诊断:脚本能区分 prompt drift、provider failure、provider variance、parser/schema drift、live-path drift。
入口:

- `packages/server/src/__tests__/reliability/pure-rule-signals.test.ts` 中 `A14b · LLM signal variance monitoring`
- `.github/workflows/llm-variance.yml`
- `packages/server/src/scripts/check-llm-signal-variance.ts`

原因:V5.0 采用 deterministic / fallback gate 保证 release 稳定;A14b 已把 3 个 MD LLM whitelist signals 纳入 mock tolerance-band gate,但主 CI 仍不能依赖真实 LLM secret、网络、token 成本和 provider variance。
建议交付:

- 配置 `GLM_API_KEY` 或 `ANTHROPIC_API_KEY` 后,用 `workflow_dispatch` 先手动跑通。
- 根据真实 provider 数据决定是否收紧 `LLM_VARIANCE_TOLERANCE`;不要改回 pure-rule deep-equal。
- 若要把 nightly 结果升级为 release blocker,把 workflow input `fail_on_skip=true` 的等价策略迁入保护规则。

验收:

- 重复运行同一 fixture,LLM 信号落在 ratify 过的 tolerance band。
- 失败时能区分 prompt drift、provider failure、provider variance、parser/schema drift、live-path drift。
- 没有 provider secret 时 workflow 明确 skip,不污染主 CI。

### P1 · Generator prompt 内容生产化

状态:9 个 live model-adjacent prompt 已有 active v2 seed;9 个 `generator.step0..8` future slot 仍是 placeholder/fail-closed。V5.1 prep 已补测试契约,防止 generator pipeline 尚未上线时误把 generator prompt 标记为 live production prompt。
入口:

- `packages/server/src/services/prompt-registry.service.ts`
- `packages/server/src/services/prompt-keys.ts`
- `packages/server/src/services/production-prompts.ts`
- `packages/server/src/signals/md/llm-helper.ts`
- `packages/server/src/services/mc-probe-engine.ts`

原因:V5.0 允许内置 deterministic fallback / built-in guidance;不能让 TODO seed 文案进入模型。V5.1 live prompts 先覆盖 MB chat、MC probe engine、MD LLM whitelist;generator pipeline 尚无生产调用面,不能伪装完成。
建议交付:

- 等 V5.1 generator pipeline 启动时,为 generator step0-step8 定义 active v2 prompt。
- 每个 generator prompt 配 prompt-regression fixture,不是只改 seed 文本。
- PromptRegistry 仍保持 fail-closed;不要为了“跑通”放开 placeholder。

验收:

- seed placeholder 存在时仍 rejected。
- live active v2 prompt 能被正确取用,模板变量完整替换,无裸 `{{var}}`。
- generator key 在真实 prompt 落地前继续 fail-closed 或显式走 fallback。

### P1 · Session scoring result replay / migration strategy

状态:MC probe 的 replay 读源已收敛到 `Session.scoringResult.signals` canonical snapshot。V5.1 prep 已明确 report snapshot policy:默认冻结 `Session.scoringResult`,只有显式 `forceRefresh=true` 才重算;新写入的 `V5ScoringResult` 带顶层 `computedAt` / `algorithmVersion` snapshot stamp,旧 V5.0 snapshot 仍可解析。
入口:

- `packages/server/src/services/scoring-hydrator.service.ts`
- `packages/server/src/services/scoring-orchestrator.service.ts`
- `packages/shared/src/types/v5-session.ts`
- `packages/shared/src/types/v5-scoring.ts`

问题:信号版本、algorithmVersion、computedAt、historical scoring shape 变更后,旧 session 是“重算当前版本”还是“冻结当时结果”需要明确。MC 追问场景已经不要求额外 `metadata.signalResults` mirror;`metadata.signalResults` 只作为互动期增量覆盖层。
建议交付:

- 观察是否需要为管理员暴露 snapshot stamp;后端 canonical JSON 已写入。
- 若未来引入额外 session-level scoring mirror,必须说明它相对 `Session.scoringResult` 的所有权和 backfill 策略,避免双写漂移。
- 明确 `V5ScoringResult` 与 legacy `ScoringResult` 的长期命名边界。

验收:

- 老 session 可打开 report,不会因为新 signal shape 变更出现 N/A。
- 新 session 的 scoring result 可追踪 snapshot version / computed time 和 per-signal version / computed time。

### P1 · V5-native socket event / payload migration

状态:主体迁移已完成。PR #162-#175 已交付 typed error helpers、single-event submit handlers、SelfAssess V5 emit + dual-accept bridge、socket handshake identity binding、MB stream/fire-and-forget handlers、`behavior:batch` handshake-first identity,以及 shared socket payload optional fallback。V5.1 prep 已补 payload fallback usage 结构化日志;V5.1 后续只剩观察窗口后的 legacy bridge 删除决策,不要把已完成的 migration sequence 重新当作 blocker。
入口:

- `packages/shared/src/types/ws.ts`
- `packages/server/src/socket/*`
- `packages/client/src/lib/persistCandidateSubmission.ts`
- `packages/client/src/hooks/useBehaviorTracker.ts`
- `docs/5.1交接/socket-v5-native-migration.md`

已知点:

- `self-assess:submit` 仍保留 V4→V5 normalize bridge;client 已发 V5-native shape,server dual-accept 是 deprecation window。
- `behavior:batch` 是 shared envelope,不是每种行为单独事件;事件名 V5.1 不重命名。
- payload `sessionId` 现在是兼容 fallback;server handlers 优先读 socket-bound identity。

建议交付:

- 观察 payload fallback / V4 self-assess bridge 命中率。
- fallback usage 降到 0 后,再移除 legacy V4 shape 和 payload-only client send。
- 若未来统一 ack envelope,先 dual-compatible;V5.1 不硬切 boolean ack。

验收:

- 所有 submit / telemetry handler 都能通过 socket-bound identity 工作。
- legacy bridge / payload fallback 使用量可观测,降到 0 后再删。

### P1 · Candidate / Admin report 边界继续硬化

状态:V5.0 已禁止候选人访问 full report CTA;完成页和 self-view 已有 DOM 级 `/report` / `/admin` 链接防回归断言。V5.1 prep 已把真实 golden-path / cold-start 候选完成态也纳入 Playwright 边界断言,防止 `/report` / `/admin` 链接回流。
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

- Playwright 覆盖 candidate complete flow 中没有 full report / admin 链接。
- Admin report 仍展示完整 view model;candidate self-view 不暴露公司内部评分细节。

### P2 · computedAt / algorithmVersion 责任边界整理

状态:`computedAt` 生产路径已收敛到 registry/orchestrator snapshot 层;`algorithmVersion` 仍由 signal / orchestrator 表达算法身份。
入口:

- `packages/server/src/signals/**`
- `packages/server/src/services/signal-registry.service.ts`
- `packages/server/src/services/scoring-orchestrator.service.ts`

问题:部分 signal 仍自己构造 result metadata。`computeAll` 已在 registry 入口统一覆盖每轮 signal `computedAt`;直接调用单个 `signal.compute()` 的低层测试仍可能看到 signal-local timestamp。
建议交付:

- 保持 `computedAt` 由 registry `computeAll` 统一归一,orchestrator 顶层 snapshot 另有 `computedAt` / `algorithmVersion`。
- 后续若要继续纯化,再把 direct `signal.compute()` helper 的 timestamp 移除。
- 保持测试覆盖 registry `computedAt` 单次归一和 all-signal metadata shape。

验收:

- `computeAll` 单轮返回的所有 signal result 使用同一个 registry `computedAt`。
- 旧 V5.0 snapshot 仍可解析;新 snapshot 顶层 stamp 可用于 report 冻结策略。

### P2 · Admin position / org scope gap audit

状态:`V5AdminPosition` / `V5AdminSuiteRecommendation` 已进入 shared;client-local admin shim 只保留 `CreateWizardDraft` 页面状态。
入口:

- `packages/shared/src/types`
- `packages/client/src/services/adminApi.*`
- `packages/server/src/routes/admin.ts`

建议交付:

- 若 create-session UX 后续接 server-driven position catalog,复用 shared `V5AdminPosition` shape。
- `CreateWizardDraft` 继续留在 client,不要把页面临时状态提升为 API contract。

验收:

- client admin API 不再有与 shared 1:1 重复的 position/recommendation 本地类型。
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
2. 做真实 provider LLM variance:复用 A14b deterministic tolerance-band,先 manual/nightly,稳定后再考虑进主 CI。
3. 做 generator prompt productionization:在 generator pipeline 真启动前补 step0-step8 v2 prompt + regression,fail-closed 保持。
4. 做 socket deprecation observability:量化 payload fallback / V4 self-assess bridge usage,再决定删除窗口。
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
