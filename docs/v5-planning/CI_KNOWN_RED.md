# CI Known-Red Jobs（V5 过渡期）

以下 CI job 因依赖未实现的 Task deliverable 而持续 FAILURE,属于已知债务。Task owner 完成后负责修复或启用。

## 当前 known-red 列表

| Job | 失败原因 | Task owner | 发布影响 | 状态 |
|---|---|---|---|---|
| — | — | — | — | **empty as of 2026-04-29** |

(e2e · prompt-regression · V5.0 CI-Green-Up Task 已 resolve 2026-04-22 · docker 已于
2026-04-29 通过 PR #101-#103 resolve · main CI run `25088716892` green。)

### docker 失败

**状态**:resolved 2026-04-29
**Fix lineage**:
- PR #101 `f5a05bb` · add `.dockerignore` + `packages/server/Dockerfile`
- PR #102 `dae6b94` · include root `tsconfig.base.json` in Docker build context
- PR #103 `edaae5d` · runtime image runs `node packages/server/dist/index.js`
  and removes npm/npx from the final image, clearing Trivy HIGH CVEs without
  weakening the scan
**Evidence**:main CI run `25088716892` green (lint-and-typecheck / test / build / e2e / docker)

### e2e · prompt-regression 解封历史(V5.0 ship gate · 2026-04-22)

**CI-Green-Up Task**(branch `chore/ci-green-up`)交付两件事:

1. `e2e/smoke.spec.ts` · 单 Playwright smoke test · `GET /health` 返 200 · 解封 CI `e2e` job "No tests found"。Scope 限于 `/health` 单 endpoint(OQ3-α)· Task 17 Golden Path E2E 真实 candidate-flow 覆盖仍是 V5.1 scope。
2. `packages/server/promptfooconfig.yaml` + `packages/server/promptfoo/mock-provider.js` · 单 LLM signal(sAiOrchestrationQuality · AE 维度 · OQ2-α)deterministic baseline · 解封 CI `prompt-regression` job · file-based mock provider 无 network / OPENAI_API_KEY 依赖 · V5.0.5 Task A14b 扩 3 LLM signals 真 LLM variance monitoring。

**V5.0 ship gate signal**:本文件目前仅 docker V5.2 row · `e2e + prompt-regression` 已 green · lint+typecheck+test+build 持续 green · **V5.0 CI ship-ready**。

## V5.0 Signal Production Gate

**Status**:superseded / closed by the Cluster sprint, A-series hardening, CI
green-up, and the Cold Start real-session gate.

The 2026-04-18 audit in
`docs/v5-planning/v5-signal-production-coverage.md` remains a historical
baseline only. Do **not** use its `12 / 47 active`, `35 failing`, or
`Critical-Release-Blocker` cluster counts as current release truth.

Current release ledger:

- CI known-red list is empty.
- Runtime signal catalog is 48 definitions/results
  (`packages/server/src/signals/index.ts` keeps `EXPECTED_SIGNAL_COUNT = 48`).
- Cold Start real-session gate closed in observation #171: fresh candidate UI
  run P0 → MA → MB → MD → SelfAssess → MC, admin report hydration, 48 signal
  definitions/results, 0 missing, 0 `value=null`, and 0 `N/A` / `待评估` DOM
  text in the report view.
- Remaining product-quality risk is observation #172: Layer 2 canonical module
  content parity. That is a content/hydration consistency target, not the old
  signal production wiring blocker.

### Historical audit outcome

The original Cluster A/B/C/D gap was closed by Tasks 22-30 and follow-up release
gates. Future edits should update this ledger instead of reviving the old
47-signal matrix as current state.

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
