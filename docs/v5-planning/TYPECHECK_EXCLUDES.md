# Server Typecheck Excludes（V5 过渡期）

以下文件因引用未实现的 services / 未重写的 V4 routes / V4 schema 字段，暂时从 typecheck 排除。Task owner 完成后负责 re-enable。

| 文件 | 原因 | Task owner | Tracking |
|---|---|---|---|
| `src/routes/session.ts` | `SessionService.create` 已删，route 未改 V5 流 | Task 11 | #10 |
| `src/config/job-models/index.ts` | 依赖未实现的 `exam-generator.service`（等待 Task 10 Generator 落地） | Task 10 | #10 |

另见 `src/services/event-bus.service.ts` 中 3 个 `@ts-expect-error`：`behaviorSignal` Prisma 模型（×2）+ `workers/signal-analysis.worker.js` 动态 import。Task 13 信号注册落地时一并移除。

`src/routes/shared-report.ts` 在 Task 15b β-delete（V4 legacy，功能被 `/admin/sessions/:id/report` 覆盖），同步从本清单和 tsconfig `exclude` 移除。

`src/services/archive/v4/` 在 Task 15b β-delete（9 files / 4758 LOC · 0 live import）。

## Task re-enable 清单

- ~~**Task 5（SandboxProvider）**：re-enable `routes/health.ts` + `services/e2b-health.service.ts`~~ ✅ PR Task 5
- **Task 10（exam-generator）**：re-enable `config/job-models/index.ts`
- **Task 11（MC 后端）**：re-enable `routes/session.ts`
- **Task 13（signal registry 信号落地）**：移除 `event-bus.service.ts` 的 3 个 `@ts-expect-error`
- ~~**Task 15（Admin API / Prisma V5 字段）**：re-enable `routes/shared-report.ts`~~ ✅ Task 15b β-delete

## 操作规则

1. re-enable 方式：从 `packages/server/tsconfig.json` 的 `exclude` 数组移除对应路径（连同 `// TODO(task-N)` 注释一起删），本地跑 `npx tsc --noEmit -p packages/server/tsconfig.json` 确认 0 error。
2. 本表加一列不新增条目：owner 完成后在 PR 描述里注明"removes entry from TYPECHECK_EXCLUDES.md"。
3. 新条目（未来出现的 V4 残留）：追加到表格 + tsconfig，引用 issue #10。
