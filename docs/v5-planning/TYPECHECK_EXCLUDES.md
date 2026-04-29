# Server Typecheck Excludes（V5 过渡期）

以下文件因引用未实现的 services / 未重写的 V4 routes / V4 schema 字段，暂时从 typecheck 排除。Task owner 完成后负责 re-enable。当前没有 server source 文件被排除。

| 文件 | 原因 | Task owner | Tracking |
|---|---|---|---|
| _(none)_ | 所有 V5 过渡期 server typecheck excludes 已清空。 | — | #10 |

另见 `src/services/event-bus.service.ts` 中 3 个 `@ts-expect-error`：`behaviorSignal` Prisma 模型（×2）+ `workers/signal-analysis.worker.js` 动态 import。Task 13 信号注册落地时一并移除。

`src/routes/shared-report.ts` 在 Task 15b β-delete（V4 legacy，功能被 `/admin/sessions/:id/report` 覆盖），同步从本清单和 tsconfig `exclude` 移除。

`src/services/archive/v4/` 在 Task 15b β-delete（9 files / 4758 LOC · 0 live import）。

## Task re-enable 清单

- ~~**Task 5（SandboxProvider）**：re-enable `routes/health.ts` + `services/e2b-health.service.ts`~~ ✅ PR Task 5
- ~~**Task 10（exam-generator）**：re-enable `config/job-models/index.ts`~~ ✅ 2026-04-29 · deleted dead V4 copy stub instead. The file had no YAML data, no live imports, and imported a nonexistent `exam-generator.service`; future generator work must add real source data plus tests in-scope.
- ~~**Task 11（MC 后端）**：re-enable V4 `routes/session.ts` lifecycle route~~ ✅ V5 canonical socket-driven · V4 8-endpoint route removed 2026-04-22 per V5 Release Plan OQ-R1 γ. Note: current `packages/server/src/routes/session.ts` is a later Brief #13 single-read candidate metadata endpoint (`GET /api/v5/session/:sessionId`), not the old excluded V4 lifecycle route.
- **Task 13（signal registry 信号落地）**：移除 `event-bus.service.ts` 的 3 个 `@ts-expect-error`
- ~~**Task 15（Admin API / Prisma V5 字段）**：re-enable `routes/shared-report.ts`~~ ✅ Task 15b β-delete

## 操作规则

1. 新条目（未来出现的 V4 残留）必须先 stop-report，说明为什么不能直接删除或修复。
2. 若 Steve 裁决允许临时 exclude，再追加到本表 + `packages/server/tsconfig.json`，PR 描述说明原因。
3. owner 完成后从 `packages/server/tsconfig.json` 的 `exclude` 数组移除对应路径，本地跑 `npx tsc --noEmit -p packages/server/tsconfig.json` 确认 0 error。
