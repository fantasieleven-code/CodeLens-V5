# CI Known-Red Jobs（V5 过渡期）

以下 CI job 因依赖未实现的 Task deliverable 而持续 FAILURE，属于已知债务。Task owner 完成后负责修复或启用。

| Job | 失败原因 | Task owner | 状态 |
|---|---|---|---|
| prompt-regression | `packages/server/promptfooconfig.yaml` 未创建 | Task 7 | known-red |
| e2e | **原因已变**。Task 5.5 (PR #23) 创建了 `packages/server/src/index.ts`,`ERR_MODULE_NOT_FOUND` 消失,本地 `cd packages/server && npm run dev` clean 启动,`GET /health` 返回 200。**当前 CI 失败原因**:`Error: No tests found` — `e2e/` 目录下尚无 `.spec.ts` 文件,Playwright 找不到测试即退出,根本没走到 webServer 启动路径。第一个 e2e test(Task 17 Golden Path)落地时才能在 CI 真实验证 bootstrap。 | Task 17 | known-red |

### e2e 失败 — 历史与当前状态

**已解决(Task 5.5 / PR #23)**:原 `ERR_MODULE_NOT_FOUND: src/index.ts` 已修复。`packages/server/src/index.ts` 建立,Express + Socket.IO + `/health` 路由 + graceful shutdown 到位。本地 `cd packages/server && npm run dev` clean 启动,`GET /health` 返回 200(db/redis ok,sandbox 按 Task 5 三级降级返回 e2b/docker/static 状态)。

**仍未绿**:`e2e/` 下无 `.spec.ts` 文件。Playwright 在找到测试前即退出,CI 根本没触发 `webServer` 启动路径,因此无法在 CI 证明 bootstrap(仅本地已证明)。第一个 e2e 测试落地(Task 17 Golden Path fixture)后该 row 才能移除。当前 row 保留为 known-red,但原因已和 server 入口无关。

## 约定

- CI_KNOWN_RED.md 列出的 job 可以忽略 FAILURE，不阻塞 merge
- 每个 Task owner 完成自己部分后，删除对应 row，或改为 green
- V5.0 发布 gate：本文件必须清空

## Related V5 过渡期资源

- V4 seed 脚本参考：`packages/server/prisma/seed.v4-archived.ts`（Task 7/19 使用）
- V4 tsconfig 遗留：`docs/v5-planning/TYPECHECK_EXCLUDES.md`
