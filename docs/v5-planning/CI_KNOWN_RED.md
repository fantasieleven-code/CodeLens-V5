# CI Known-Red Jobs（V5 过渡期）

以下 CI job 因依赖未实现的 Task deliverable 而持续 FAILURE，属于已知债务。Task owner 完成后负责修复或启用。

| Job | 失败原因 | Task owner | 状态 |
|---|---|---|---|
| prompt-regression | `packages/server/promptfooconfig.yaml` 未创建 | Task 7 | known-red |
| e2e | Playwright webServer 启动超时 — `npm run dev` (tsx) 报 `ERR_MODULE_NOT_FOUND: src/index.ts`。种子/迁移已通过,失败发生在 `npx playwright test` 起 dev server 阶段。疑似 tsx ESM resolution 配置问题或 server 入口依赖未装。 | Task 5 / CI infra | known-red |

### e2e 失败 — 推测原因与调查方向

**可能原因**:
1. server 需要 Task 5（SandboxProvider）才能完整启动
2. tsx 配置或 tsconfig `moduleResolution` 问题
3. server `src/index.ts` 有被 Task 2/3/4 改动后未 rebuild 的引用

**调查建议**（Task 5 启动前）:先 `cd packages/server && npm run dev` 复现,看是 server 本体启动问题还是 sandbox 依赖问题。如果是纯 ESM 配置,优先作为 CI infra PR 单独修（不阻塞 Task 5）。

## 约定

- CI_KNOWN_RED.md 列出的 job 可以忽略 FAILURE，不阻塞 merge
- 每个 Task owner 完成自己部分后，删除对应 row，或改为 green
- V5.0 发布 gate：本文件必须清空

## Related V5 过渡期资源

- V4 seed 脚本参考：`packages/server/prisma/seed.v4-archived.ts`（Task 7/19 使用）
- V4 tsconfig 遗留：`docs/v5-planning/TYPECHECK_EXCLUDES.md`
