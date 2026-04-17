# CI Known-Red Jobs（V5 过渡期）

以下 CI job 因依赖未实现的 Task deliverable 而持续 FAILURE，属于已知债务。Task owner 完成后负责修复或启用。

| Job | 失败原因 | Task owner | 状态 |
|---|---|---|---|
| prompt-regression | `packages/server/promptfooconfig.yaml` 未创建 | Task 7 | known-red |
| e2e | `packages/server/src/index.ts` 不存在（V5 server bootstrap 未落地）— Playwright webServer 启动 `tsx src/index.ts` 立即 `ERR_MODULE_NOT_FOUND`。SandboxProvider (Task 5) 不造成此失败，server 入口本身缺失。 | Server bootstrap task（未分配） | known-red |

### e2e 失败 — 根因确认（Task 5 调查）

**Task 5 期间验证**:`cd packages/server && ls src/*.ts` → 不存在 entry 文件。Task 5 完成了 sandbox service + health route + e2b-health worker,但没有 express bootstrap（`app.use(healthRouter)` / `app.listen(PORT)`）。

**建议**:由 Steve 分配一个独立的 "server-bootstrap" task（0.5 天）把 `src/index.ts` 立起来,同时注册 `healthRouter` + 启动 `e2bHealthService.start()`。这样 e2e 自动转绿。Task 5 不扩大 scope 去写 bootstrap。

## 约定

- CI_KNOWN_RED.md 列出的 job 可以忽略 FAILURE，不阻塞 merge
- 每个 Task owner 完成自己部分后，删除对应 row，或改为 green
- V5.0 发布 gate：本文件必须清空

## Related V5 过渡期资源

- V4 seed 脚本参考：`packages/server/prisma/seed.v4-archived.ts`（Task 7/19 使用）
- V4 tsconfig 遗留：`docs/v5-planning/TYPECHECK_EXCLUDES.md`
