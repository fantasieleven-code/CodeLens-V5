# CodeLens V5 Client — Deployment

Covers the Admin cutover shipped in **Task 12 Layer 2** (feat/task-12-layer-2-phase-2).
Reading order for a first-time deploy: Config → Build → Runtime → Smoke.

## Config

All client-side config is driven by `VITE_*` environment variables, baked in
at build time. See `.env.example` for the authoritative list.

| Variable               | Required | Notes |
|------------------------|----------|-------|
| `VITE_API_URL`         | Prod     | Absolute URL to the server (no trailing slash required; we strip it). Omit in dev to force mock. |
| `VITE_ADMIN_API_MOCK`  | No       | `'true'` / `'false'` / unset. Unset = auto (mock iff `!VITE_API_URL`). |

### Loading order

Vite loads `.env → .env.local → .env.[mode] → .env.[mode].local`, with
later files overriding earlier ones. The `.local` variants are gitignored —
use them for developer-specific overrides without touching the committed
`.env.example`.

## Build

```bash
# From repo root
npm install
npm run build --workspace=@codelens-v5/shared   # required: client imports types from shared's dist
npm run build --workspace=@codelens-v5/client
```

The shared-dist-staleness caveat is tracked for V5.0.5: if you see
"Module has no exported member V5Admin*", rebuild `@codelens-v5/shared`
before retrying the client build.

## Runtime expectations

The Admin client expects the server to:

1. Expose `POST /auth/login` (no `/api` prefix) returning
   `{ token, orgId, orgRole, expiresIn }`. 401 responses carry
   `{ error, code: 'AUTH_INVALID' }`; 429 responses carry
   `{ error: 'Too many authentication attempts' }`.
2. Mount the 7 admin endpoints under `/api/admin/*`, each gated by the
   `requireAdmin` middleware. The client attaches
   `Authorization: Bearer <token>` on every admin call; on any 401 the
   client clears its auth store and `AdminGuard` bounces to `/login`.

No session cookies are used — the JWT lives in `localStorage` under the
key `codelens_admin_auth`. Token lifetime is controlled server-side via
`JWT_ADMIN_EXPIRY`.

## Local smoke

After a fresh install:

```bash
# Terminal 1 — server (requires server .env)
npm run dev --workspace=@codelens-v5/server

# Terminal 2 — client (with VITE_API_URL=http://localhost:4000)
npm run dev --workspace=@codelens-v5/client
```

Golden path:

1. Visit `/admin` → bounced to `/login` with `state.from = '/admin'`.
2. Submit valid admin credentials → lands on `/admin/dashboard`.
3. Click any nav item (仪表盘 / 创建评估 / 查看评估 / 题库管理) → page renders
   against real endpoints.
4. Click **退出登录** in the header → returns to `/login`; visiting
   `/admin/sessions` directly after this also bounces to `/login`.

Error paths to spot-check:

- Wrong password → `admin-login-error[data-error-kind=invalid_credentials]`.
- Stop the server mid-session → next admin call hits 401 fallback then
  bounces to `/login`.
- Token expiry (server-side `JWT_ADMIN_EXPIRY=10s` in a throwaway run) →
  `AdminGuard` re-evaluates on next navigation and redirects.

## V5.0.5 follow-ups

- 2FA / OAuth / password reset / refresh rotation (brief §3).
- Shared-dist staleness automation (tracked in memory:
  `v5_05_ui_infra_candidates`).
