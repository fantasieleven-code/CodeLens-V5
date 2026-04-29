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

## V5.0 Signal Production Gap(2026-04-18 新增)

> **Source**:`docs/v5-planning/v5-signal-production-coverage.md` audit。
> **本 section 不是 CI job 红,而是 signal production readiness gate**。列在 CI_KNOWN_RED
> 的原因:V5 防御纪律要求一切"发布前必须清理但暂未清理"的结构性问题都集中记录,
> 便于 release checklist 落地。未来 V5.1 引入 Signal Production Readiness Gate
> (类似 CI job)后,本 section 迁移到真正的 CI job 形式。

### 单项状态

**47 signal 中 35 failing**(16 broken + 19 unimplemented,74.5%)。

| Cluster | 影响 signal 数 | Root cause | Task owner | 发布影响 |
|---------|----------------|-------------|------------|----------|
| **A · behavior:batch ingest 缺失** | 11 MB + 2 间接(sWritingQuality 部分 / sIterationEfficiency fallback) | Client 发 `behavior:batch` socket event,server 未注册 `socket.on('behavior:batch')`;mb.service 无 persistence path 写入 `editorBehavior.{aiCompletionEvents, chatEvents, diffEvents, editSessions, fileNavigationHistory, testRuns}` | **新 Task 18.1**(Backend) | **Critical-Release-Blocker** |
| **B · finalFiles / finalTestPassRate persist 缺失** | 3(sPrecisionFix / sChallengeComplete / sIterationEfficiency) | `fileSnapshotService.persistToMetadata` 定义存在但无 production call site;`run_test` handler 计算 passRate 但不 persist;签约的 "submission 时 snapshot" 机制未接通 | Task 18.1 同 PR | **Critical-Release-Blocker** |
| **C · Phase 0 / MA / MD 整模块未接入** | 19(5 P0 + 10 MA + 4 MD) | Phase0Page / ModuleAPage / ModuleDPage **零 socket.emit**;server 无 submission handler 也无 REST 端点 | **新 Task 18.2**(Frontend + Backend) | **Critical-Release-Blocker** |
| **D · self-assess socket handler 缺失** | 1(sMetaCognition) | SelfAssessPage 发 `self-assess:submit`,server 未注册;shared ws.ts 也未声明此 event type | Task 18.2 同 PR | **Critical-Release-Blocker** |

### V5.0 Ship Decision Gate

- **当前 ACTIVE signal = 12 / 47 = 25.5%**
- **AE 维度 ACTIVE 信号 ≈ 0**(最核心卖点失效)
- **CQ 维度 ACTIVE 信号 = 0**
- **Steve 授权的 "broken > 3 → 考虑延期" 规则已触发**(broken = 16)

**V5.0 发布前必须决定**:

1. **路径 1 · 严格修**:把 Cluster A/B/C/D 作为 V5.0 must-fix,新增 Task 18.1 + 18.2,
   工期估 7-8 elapsed days(multi-agent 并行 ~4-5 days),V5.0 延期 ≥ 1 周。
2. **路径 2 · scope downgrade**:承认 V5.0 只是 MB + MC pilot,P0/MA/MD/SE 延到 V5.1。
   套件定义 / 对外材料 / fixture 全需调整。
3. **路径 3 · ship-as-is**:不推荐,违背 V5 防御文档精神。

**Claude 推荐路径 1**。具体见
`docs/v5-planning/v5-signal-production-coverage.md` 第 4 部分。

### 清理时间点约定

- Cluster A + B + D:V5.0 发布前必清(即使走路径 1,也要 Task 18.1 落地)
- Cluster C:路径 1 下 V5.0 发布前必清;路径 2 下可 V5.1
- 任何 signal 从 broken / unimplemented 转 ACTIVE 后,同 PR 更新
  `v5-signal-production-coverage.md` matrix 的 status 列

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
