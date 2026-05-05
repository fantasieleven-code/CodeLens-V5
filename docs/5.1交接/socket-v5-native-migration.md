# V5.1 Socket V5-Native Migration Inventory

更新时间:2026-05-05

## 结论

当前 V5 socket 层生产可用,但不是长期形态。所有候选人模块 submit / telemetry payload 仍显式携带 `sessionId`,原因是候选人页面通过 `getSocket()` 直连,没有 socket-level session middleware。V5.1 迁移目标不是立即改事件名,而是先建立统一 session identity / ack / error envelope,再进入 dual-accept deprecation window。

不要直接删除 legacy event 或改成一次性 V5-only shape。正确顺序:

1. 增加 socket middleware 可选读取 session identity,但保持 payload `sessionId` 兼容。
2. 增加统一 ack/error helper,先覆盖新代码和单事件 submit handler。
3. 对 V4 bridge event 做 dual-accept,打 usage log。
4. 客户端切到 V5-native payload。
5. usage 降到 0 后删除 legacy bridge。

## Event Inventory

| Event                      | Direction        | Owner            | Current session source | Ack     | Error frame     | Migration classification                                          |
| -------------------------- | ---------------- | ---------------- | ---------------------- | ------- | --------------- | ----------------------------------------------------------------- |
| `behavior:batch`           | client -> server | MB telemetry     | payload `sessionId`    | none    | none, logs only | Keep name for V5.1; high-volume telemetry, migrate identity first |
| `self-assess:submit`       | client -> server | SE submit        | payload `sessionId`    | boolean | none, logs only | Dual-accept required; current payload is V4 bridge                |
| `phase0:submit`            | client -> server | P0 submit        | payload `sessionId`    | boolean | `{event}:error` | V5-native payload already; identity migration only                |
| `moduleA:submit`           | client -> server | MA submit        | payload `sessionId`    | boolean | `{event}:error` | V5-native payload already; identity migration only                |
| `moduleD:submit`           | client -> server | MD submit        | payload `sessionId`    | boolean | `{event}:error` | V5-native payload already; identity migration only                |
| `v5:modulec:answer`        | client -> server | MC answer        | payload `sessionId`    | boolean | `{event}:error` | V5-native payload already; identity migration only                |
| `session:end`              | client -> server | lifecycle        | payload `sessionId`    | boolean | `{event}:error` | V5-native lifecycle; identity migration only                      |
| `v5:mb:planning:submit`    | client -> server | MB stage         | payload `sessionId`    | boolean | `{event}:error` | Normalize via helper; preserve event                              |
| `v5:mb:standards:submit`   | client -> server | MB stage         | payload `sessionId`    | boolean | `{event}:error` | Normalize via helper; preserve event                              |
| `v5:mb:submit`             | client -> server | MB final         | payload `sessionId`    | boolean | `{event}:error` | Normalize via helper; preserve event                              |
| `v5:mb:audit:submit`       | client -> server | MB stage         | payload `sessionId`    | none    | `{event}:error` | Decide if ack is needed before migration                          |
| `v5:mb:chat_generate`      | client -> server | MB LLM stream    | payload `sessionId`    | none    | `{event}:error` | Streaming event; do not force boolean ack                         |
| `v5:mb:completion_request` | client -> server | MB completion    | payload `sessionId`    | none    | `{event}:error` | Response event already exists; do not force boolean ack           |
| `v5:mb:run_test`           | client -> server | MB sandbox       | payload `sessionId`    | none    | `{event}:error` | Response event already exists; do not force boolean ack           |
| `v5:mb:file_change`        | client -> server | MB file snapshot | payload `sessionId`    | none    | `{event}:error` | Fire-and-forget; migrate identity only                            |
| `v5:mb:visibility_change`  | client -> server | MB telemetry     | payload `sessionId`    | none    | `{event}:error` | Fire-and-forget; migrate identity only                            |

## Current Inconsistencies

- Boolean ack submit / lifecycle events now use typed error frames except `self-assess:submit`.
- `self-assess:submit` still validates with zod and `ack(false)`, but does not send typed error frames.
- `behavior:batch` silently logs invalid schema or persist failure, because telemetry must not block candidate flow.
- MB `safe()` wrapper catches thrown errors and emits `{event}:error`, but it does not call ack because most wrapped events are stream/fire-and-forget.
- `self-assess:submit` is the only V4 -> V5 normalize bridge. Its event name should not be renamed until the client dual-emits or switches shape.

## Proposed V5.1 Contract

### Session Identity

Use a resolver rather than a hard cut:

```ts
resolveSocketSessionId(socket, rawPayload): string | null
```

Resolution order:

1. Middleware-bound session identity from socket handshake/auth.
2. Existing payload `sessionId`.
3. Reject with `ack(false)` / typed error for required-persist events.

This allows server-side migration before any client payload removal.

### Ack / Error Envelope

Keep boolean ack for existing contracts during V5.1:

```ts
type LegacyAck = (ok: boolean) => void;
```

Add typed server error frames for persist submit events:

```ts
socket.emit(`${event}:error`, {
  code: 'VALIDATION_ERROR' | 'PERSIST_FAILED' | 'UNAUTHORIZED',
  message: string,
});
```

Do not use typed ack objects until all clients are dual-compatible. Existing tests and pages assume `(ok: boolean) => void`.

## Recommended PR Sequence

### PR 1 · Socket Contract Helpers

Status:done in V5.1 prep. `packages/server/src/socket/socket-contract.ts` defines
typed error frames and safe boolean ack helpers, with tests in
`socket-contract.test.ts`.

Scope:

- Add helper for safe boolean ack and typed error frame.
- Add unit tests for helper.
- Do not wire handlers yet.

Acceptance:

- Helper emits `{event}:error` with stable `code`.
- Omitted ack remains safe.

### PR 2 · Single-Event Submit Handler Adoption

Status:done in V5.1 prep. `phase0:submit`, `moduleA:submit`,
`moduleD:submit`, `v5:modulec:answer`, and `session:end` now use the shared
socket contract helper for safe boolean ack and typed validation/persist error
frames.

Scope:

- Convert `phase0:submit`, `moduleA:submit`, `moduleD:submit`, `v5:modulec:answer`, `session:end` to helper.
- Preserve event names and boolean ack.

Acceptance:

- Existing tests still pass.
- Add assertions that validation/persist errors emit typed error frames.

### PR 3 · SelfAssess Dual-Shape Bridge

Scope:

- Accept current V4 bridge shape and V5-native `{ sessionId, submission }`.
- Log bridge usage count.
- Keep `self-assess:submit` event name during deprecation window.

Acceptance:

- V4 payload still persists.
- V5 payload persists without normalization drift.
- Tests cover both shapes.

### PR 4 · Optional Session Middleware

Scope:

- Add optional socket middleware that reads session identity from handshake auth/query.
- Handler resolver prefers middleware identity but keeps payload fallback.

Acceptance:

- Existing clients unchanged.
- New tests prove middleware session id works and payload fallback remains.

## Non-Goals

- Do not rename `behavior:batch` to `v5:mb:behavior:batch` in V5.1. It is a shared telemetry envelope and already has production server dispatch.
- Do not reintroduce `v5:modulec:start` or `v5:modulec:complete`; `v5:modulec:answer` + `session:end` are the live contracts.
- Do not switch existing clients from boolean ack to object ack in one PR.
- Do not remove payload `sessionId` until middleware identity has production usage and fallback telemetry proves clients migrated.
