# CI Known-Red Jobs（V5 过渡期）

以下 CI job 因依赖未实现的 Task deliverable 而持续 FAILURE,属于已知债务。Task owner 完成后负责修复或启用。

## 当前 known-red 列表

| Job | 失败原因 | Task owner | 发布影响 | 状态 |
|---|---|---|---|---|
| prompt-regression | `packages/server/promptfooconfig.yaml` 未创建;promptfoo evaluation 需要真实 prompt 内容(Task 7 只 seed placeholder,Task 13d 开始产出真实 MD whitelist prompt 时建 config) | **Task 17 cleanup**(原 Task 9;Task 17 Golden Path 需要 prompt regression baseline 因此移交) | **Critical** — V5.0 发布前必须清 | known-red |
| e2e | **原因已变**。Task 5.5 (PR #23) 创建了 `packages/server/src/index.ts`,`ERR_MODULE_NOT_FOUND` 消失,本地 `cd packages/server && npm run dev` clean 启动,`GET /health` 返回 200。**当前 CI 失败原因**:`Error: No tests found` — `e2e/` 目录下尚无 `.spec.ts` 文件,Playwright 找不到测试即退出,根本没走到 webServer 启动路径。第一个 e2e test(Task 17 Golden Path)落地时才能在 CI 真实验证 bootstrap。 | Task 17 | **Nice-to-have** — V5.0 可容忍,V5.1 必绿 | known-red |

### e2e 失败 — 历史与当前状态

**已解决(Task 5.5 / PR #23)**:原 `ERR_MODULE_NOT_FOUND: src/index.ts` 已修复。`packages/server/src/index.ts` 建立,Express + Socket.IO + `/health` 路由 + graceful shutdown 到位。本地 `cd packages/server && npm run dev` clean 启动,`GET /health` 返回 200(db/redis ok,sandbox 按 Task 5 三级降级返回 e2b/docker/static 状态)。

**仍未绿**:`e2e/` 下无 `.spec.ts` 文件。Playwright 在找到测试前即退出,CI 根本没触发 `webServer` 启动路径,因此无法在 CI 证明 bootstrap(仅本地已证明)。第一个 e2e 测试落地(Task 17 Golden Path fixture)后该 row 才能移除。当前 row 保留为 known-red,但原因已和 server 入口无关。

**注**:Task 17 PR #51 交付了 backend integration tests(Golden Path 诊断 + 4 fixture × E2E scoring pipeline),但**未交付 Playwright client-side spec**。Playwright `e2e/**/*.spec.ts` 属于 Task 17 follow-up 或 V5.1 scope。V5.0 gate 可接受 e2e 红(Task 12a Frontend 已通过手工 flow walkthrough catch 2 个 P0 bug,有人工 E2E 覆盖)。

### prompt-regression 失败 — owner 变更记录

**原 owner**:Task 9 (Step 0 Prompt 正式内容)

**移交到 Task 17 cleanup**:
- Task 17 Golden Path 需要 LLM whitelist signal(sDesignDecomposition / sTradeoffArticulation / sAiOrchestrationQuality)的 prompt regression baseline,Task 9 原 scope 未覆盖这部分
- Task 13d Backend 已交付 LLM whitelist 3 个 signals 的 v1 prompt + LlmHelper 集成
- promptfooconfig.yaml 现在可以基于 Task 13d 的 prompt 建立 regression baseline
- 移交到 Task 17 cleanup PR 处理(不阻 Task 17b Golden Path fixture calibration)

### docker 失败(若 CI 显示)

**状态**:pre-existing infra 问题,V5 开发全期间持续红
**Owner**:Task 21(Deployment docs)
**发布影响**:**Acceptable** — V5.0 生产用 E2B sandbox(不依赖 docker),Docker 降级验证可 V5.2 加
**Timeline**:V5.2 才硬性要求清理

## 发布影响级别定义

| 级别 | 含义 | 清理时间点 |
|------|------|-----------|
| **Critical** | 影响 V5.0 发布核心质量 gate,必须解决 | V5.0 发布前 |
| **Nice-to-have** | 增加 regression 防护或体验质量,V5.0 可接受红 | V5.1 |
| **Acceptable** | 不影响当前生产路径的 infra,可长期容忍 | V5.2+ |

## 约定

- CI_KNOWN_RED.md 列出的 job 可以忽略 FAILURE,不阻塞 merge
- 每个 Task owner 完成自己部分后,删除对应 row,或改为 green
- **V5.0 发布 gate**:**Critical** 级 known-red 必须清空;Nice-to-have 可延期 V5.1;Acceptable 可 V5.2+

## 新 CI 红出现时的处理流程

Agent:
1. 先跑 main 最新 commit CI,verify 是否 pre-existing
2. 若 pre-existing → grep 本文件,确认在 known-red list
3. 若不在 list → **本 PR 引入的新红**,必须 fix 或 stop-for-clarification
4. 新加 known-red 必须评估 **发布影响级别**(Critical / Nice-to-have / Acceptable)

## Related V5 过渡期资源

- V4 seed 脚本参考:`packages/server/prisma/seed.v4-archived.ts`(Task 7/19 使用)
- V4 tsconfig 遗留:`docs/v5-planning/TYPECHECK_EXCLUDES.md`
- V5 防御文档体系:
  - `docs/v5-planning/observations.md` — 项目历史 pattern 归档
  - `docs/v5-planning/field-naming-glossary.md` — Shared type 字段 canonical 名称 + import path
  - `docs/v5-planning/cross-task-shared-extension-backlog.md` — 跨 Task shared 扩展 backlog
  - `docs/v5-planning/claude-self-check-checklist-v2.md` — Claude coordinator 自查清单
