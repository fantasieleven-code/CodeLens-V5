# V5 State Audit · 2026-04-22

**Main HEAD**: `447a569f5a523ae47cfd030ae7b30025ab21d20e` · `[CI-Green-Up] e2e smoke + promptfoo baseline · V5.0 ship gate unblock (#87)`
**Audit branch**: `audit/v5-state-20260422`
**Audit date**: 2026-04-22 (Beijing) · run 2026-04-24 local
**Audit scope**: broad + quick · plan diff · structural gaps · no severity · no recommend

## Canonical plan sources

- `docs/v5-planning/backend-agent-tasks.md` (1728 LOC) · present
- `docs/v5-planning/cross-task-shared-extension-backlog.md` (462 LOC) · present
- `docs/v5-planning/steve-playbook.md` · **ABSENT** in repo (audit instruction referenced this path but `find docs -name "steve-playbook*"` returns 0 files) → flagged DOC_DRIFT-0

Fall-back co-canonical docs actually present:
- `docs/v5-planning/frontend-agent-tasks.md` (not re-scoped in this audit)
- `docs/v5-planning/v5-signal-production-coverage.md`
- `docs/v5-planning/observations.md`
- `docs/v5-planning/CI_KNOWN_RED.md`

Gap category taxonomy (per instruction): `shipped / partial / missing / diverged` · `N/A / partial / missing / UNDOCUMENTED_IMPL / DOC_DRIFT`

---

## Area 1 · Frontend candidate flow

Plan canonical references:
- backend-agent-tasks.md:1554-1619 (Task 17 Golden Path · 模块 page list)
- cross-task-shared-extension-backlog.md (A15 Transparency · F-A10-lite selfView · B-A12 consent/profile)

| Plan item | File:line reference | Actual state | Gap category |
|-----------|---------------------|--------------|--------------|
| `/candidate/:sessionToken/consent` · ConsentPage | App.tsx:68-70 · ConsentPage.tsx (6 testids · nav to /exam at :65) | shipped | N/A |
| `/candidate/:sessionToken/profile` · ProfileGuard > ProfileSetup | App.tsx:71-78 · ProfileSetup.tsx (12 testids · nav to /exam at :117) | shipped | N/A |
| `/exam/:sessionId` · CandidateGuard > ExamRouter | App.tsx:59-66 · App.tsx:106-136 ExamRouter switch (intro/phase0/moduleA/mb/moduleD/selfAssess/moduleC/complete) | shipped | N/A |
| `/candidate/self-view/:sessionId/:privateToken` · SelfViewPage (no Guard) | App.tsx:79-82 · SelfViewPage.tsx (10 testids) | shipped | N/A |
| `/transparency` · TransparencyPage | App.tsx:94 · TransparencyPage.tsx (5 testids) | shipped | N/A |
| `/report/:sessionId` · ReportViewPage | App.tsx:83 · ReportViewPage.tsx | partial — renders `报告暂未生成` placeholder card when sessionId not in fixture map (ReportViewPage.tsx:8,84-90) · doc comment line 8 "Task 9+ will swap the fixture map for a real fetch" | partial |
| `/share/report/:token` | App.tsx:93 · SharedReportPage → `ErrorPage message="分享报告页尚未启用"` (App.tsx:138-140) | stub | partial |
| EvaluationIntroPage · Phase0Page · ModuleAPage · ModuleBPage · ModuleCPage · ModuleDPage · SelfAssessPage · CompletePage | all .tsx files present in packages/client/src/pages/ (15 module tsx files) | files shipped — per-page completeness not deep-audited per fence #5 | shipped |
| Gate #5: 0 "待评估" / "N/A" / "TBD" user-facing text | grep of packages/client/src/pages/**/*.tsx for `待评估\|N/A\|TBD` → no matches | shipped (text-scoped check only) | N/A |

Per-page data-testid counts (source .tsx only):
- Phase0Page 17 · ModuleAPage 29 · ModuleBPage 7 · ModuleCPage 21 · ModuleDPage 22
- SelfAssessPage 4 · CompletePage 4 · EvaluationIntroPage 7 · ReportViewPage 9
- ConsentPage 6 · ProfileSetup 12 · SelfViewPage 10 · TransparencyPage 5
- ModuleBPage (7) and SelfAssessPage (4) are the two lowest counts among interactive pages.

Placeholder / TODO grep surface (packages/client/src/pages/**/*.tsx):
- `placeholder=` occurrences are all `<input>` / `<textarea>` UI attributes (ModuleAPage, ModuleDPage, Phase0Page, ModuleCPage, SelfAssessPage, ProfileSetup) — no user-facing stub copy
- `ReportViewPage.tsx` has an explicit "placeholder" code path (lines 8, 13, 84-90, 280-298) rendering `报告暂未生成` when sessionId is unknown · design per header comment "Task 9+ will swap the fixture map for a real fetch"
- `Phase0Page.tsx:58` comment `stubbing the session store` (test hook)
- `ModuleBPage.tsx:82` comment `fall back to a deterministic placeholder so the socket payloads keep` (handler defensive fallback)

Area 1 summary: candidate routing and pages are structurally present; ReportViewPage still returns a placeholder card for unknown sessionIds and the `/share/report/:token` route explicitly renders the "功能未启用" error page.

---

## Area 2 · Backend routing

Plan canonical references:
- backend-agent-tasks.md · Task 5.5 (health), 8 (auth), 12 (candidate), 15a+15b (admin), 6 (voice/RTC)
- cross-task-shared-extension-backlog.md · B-A10-lite (candidate self-view)

| Plan item | File:line reference | Actual state | Gap category |
|-----------|---------------------|--------------|--------------|
| `app.use('/health', healthRouter)` | index.ts:54 · routes/health.ts | shipped | N/A |
| `app.use('/api/admin', requireAdmin, adminRouter)` | index.ts:56 · routes/admin.ts (7 endpoints at lines 595-602) | shipped | N/A |
| `app.use('/api/candidate/self-view', candidateSelfViewRouter)` (URL-as-auth, mounted BEFORE /api/candidate per comment) | index.ts:57-59 · routes/candidate-self-view.ts:75 | shipped | N/A |
| `app.use('/api/candidate', requireCandidate, candidateRouter)` | index.ts:60 · routes/candidate.ts:113 (1 endpoint: POST /profile/submit) | shipped | N/A |
| `app.use('/auth', authRouter)` | index.ts:61 · routes/auth.ts:117 (POST /login) | shipped | N/A |
| `routes/session.ts` — 8 endpoints (sessionRouter.post('/', :id/start, :id/end, :id/report, :id/timer, :id/checkpoints, :id/checkpoint/advance, :id/run-hidden-tests) | file at routes/session.ts exists (lines 18, 34, 44, 54, 64, 74, 84, 115, 125) · **NOT mounted in index.ts** · index.ts header comment at line 6-9: `routes/session.ts (Task 11, MC backend rewrite)` in TYPECHECK_EXCLUDES | orphan | UNDOCUMENTED_IMPL (file shipped but not wired) |
| `routes/voice.ts` — 4 endpoints (/token, /v5/start, /stop, /status) | file at routes/voice.ts (lines 36, 80, 183, 208) · **NOT mounted in index.ts** | orphan | UNDOCUMENTED_IMPL |
| `routes/mc-voice-chat.ts` — VERTC Custom LLM endpoint | file at routes/mc-voice-chat.ts:105 (POST /voice-chat) · **NOT mounted in index.ts** | orphan | UNDOCUMENTED_IMPL |

`POST /api/admin/sessions/create` body contract:
- Required: `{ suiteId, examInstanceId, candidate: { name, email } }` (admin.ts:197-218)
- Response 201: `{ session, shareableLink, candidateToken, candidateSelfViewToken, selfViewUrl }` (admin.ts:277-284)
- Hard precondition: `examInstanceId` must match existing ExamInstance row else 404 (admin.ts:220-225) — depends on Area 7 (no ExamInstance seed script)

Consent submission: there is no dedicated `/consent/submit` endpoint. `POST /api/candidate/profile/submit` accepts partial bodies with `{ consentAccepted?: boolean }` (candidate.ts:12-14, 63, 69-71) — **single endpoint handles both consent-only and profile submits**.

Area 2 summary: 5 routers are mounted per plan; 3 router files (session / voice / mc-voice-chat) exist on disk but are never registered in `index.ts`.

---

## Area 3 · Socket handlers

Plan canonical references:
- backend-agent-tasks.md · Task 11 (Socket scaffold), Task 13a-e (per-module signals), Tasks 23/24/26/27 (Cluster C submit handlers)
- V5 design spec — 13 events across 6 modules

| Plan event | Handler file | Shipped | Gap |
|------------|--------------|---------|-----|
| `phase0:submit` | socket/phase0-handlers.ts:58 | yes | N/A |
| `moduleA:submit` | socket/moduleA-handlers.ts:86 | yes | N/A |
| `moduleD:submit` | socket/moduleD-handlers.ts:60 | yes | N/A |
| `self-assess:submit` | socket/self-assess-handlers.ts:64 | yes | N/A |
| `behavior:batch` | socket/behavior-handlers.ts:77 | yes | N/A |
| MB 9 events (`v5:mb:{planning:submit, standards:submit, audit:submit, chat_generate, completion_request, run_test, file_change, visibility_change, submit}`) | socket/mb-handlers.ts:113,124,139,150,182,215,252,264,274 | yes | N/A |
| MC module handlers | `packages/server/src/socket/` has no `moduleC-handlers.ts` or `mc-handlers.ts`; MC flow designed to go through REST `mc-voice-chat.ts` (which itself is unmounted — see Area 2) | missing | missing + UNDOCUMENTED_IMPL (design shifted MC to SSE per `routes/mc-voice-chat.ts:10` comment `Protocol: VERTC Custom LLM standard (OpenAI-compatible SSE)`) |

Total socket event handlers shipped (from inventory): **14** events across 6 files (phase0 1 + moduleA 1 + moduleD 1 + self-assess 1 + mb 9 + behavior 1). MC is out-of-band via unmounted SSE route.

Area 3 summary: the 5 module submit events + MB cluster + behavior batch are all wired; MC has no socket handler and its planned SSE transport is unmounted.

---

## Area 4 · Scoring pipeline 48 signals

Plan canonical references:
- backend-agent-tasks.md · Task 9-10 (signal framework), Task 13a-e (per-dim signals), Task A1 (sCalibration), Task A7 (sDecisionLatencyQuality calibration)
- cross-task-shared-extension-backlog.md · A14a reliability gate

Registry bootstrap: `packages/server/src/signals/index.ts:88-152` calls `registry.register(...)` 48 times. `EXPECTED_SIGNAL_COUNT = 48` (line 73). Log line 150: `registered 48/48 (4 MC + 5 P0 + 10 MA + 23 MB + 4 MD + 2 SE) — V5.0 + A1 closed`.

| Dimension / module | Planned count | Filesystem count | Shipped (registered) | Gap |
|--------------------|---------------|------------------|----------------------|-----|
| MC | 4 | `signals/mc/s-*.ts` = 4 (sBeliefUpdateMagnitude, sBoundaryAwareness, sCommunicationClarity, sReflectionDepth) | 4 (index.ts:90-93) | N/A |
| P0 | 5 | `signals/p0/s-*.ts` = 5 (sBaselineReading, sAiCalibration, sDecisionStyle, sTechProfile, sAiClaimDetection) | 5 (index.ts:95-99) | N/A |
| MA | 10 | `signals/ma/s-*.ts` = 10 | 10 (index.ts:101-110) | N/A |
| MB | 23 | `signals/mb/{stage1,stage2-exec,stage2-quality,stage3,stage4,cursor,horizontal}/s-*.ts` = 23 total | 23 (index.ts:112-140) | N/A |
| MD | 4 (3 LLM whitelist + 1 pure) | `signals/md/s-*.ts` = 4 | 4 (index.ts:142-145) | N/A |
| SE | 2 | `signals/se/s-*.ts` = 2 (sMetaCognition, sCalibration) | 2 (index.ts:147-148) | N/A |

LLM whitelist set (verified at `grep -rn "isLLMWhitelist: true" packages/server/src/signals/md/`):
- `sAiOrchestrationQuality` (s-ai-orchestration-quality.ts:152) · `true`
- `sDesignDecomposition` (s-design-decomposition.ts:124) · `true`
- `sTradeoffArticulation` (s-tradeoff-articulation.ts:163) · `true`
- `sConstraintIdentification` (s-constraint-identification.ts:106) · **`false`** → pure-rule (matches A14a finding)
- Total LLM whitelist = **3** (not 4) — contradicts any brief Appendix A that lists 4 (observations #137 records this drift)

Stub / unimplemented grep:
- `grep -rln "throw new Error.*not implemented\|throw new Error.*TODO\|return null.*stub" packages/server/src/signals/` → **no matches**
- `v5-signal-production-coverage.md` previously reported 35/47 failing (observation #057, pre-Task 18) — this audit did NOT rerun the coverage matrix (fence #5 defers implementation quality)

Area 4 summary: 48 signals registered; 3 MD signals are LLM whitelist and 1 MD signal (sConstraintIdentification) plus all 45 others are pure-rule.

---

## Area 5 · Ethics floor (asymmetric access)

Plan canonical references:
- cross-task-shared-extension-backlog.md · B-A10-lite (SelfView strict filter)
- Ethics floor permanent gate per observations / design-spec

| Plan item | File:line reference | Actual state | Gap |
|-----------|---------------------|--------------|-----|
| Candidate self-view strips grade/composite/signal ids/scores/dangerFlag/dimensionBreakdown abs/evidenceSignals | `packages/shared/src/types/v5-candidate-self-view.ts:1-84` schema explicitly enumerates `sessionId / completedAt / capabilityProfiles[{id,nameZh,nameEn,label,description}] / dimensionRadar[{id,nameZh,nameEn,relativeStrength(='strong'\|'medium'\|'weak')}]` — no grade/composite/signals fields present · transform at `services/candidate-self-view.service.ts:59-85` honors this | shipped | N/A |
| `schema.strict()` as permanent gate | `v5-candidate-self-view.ts` has 3 `.strict()` invocations (L64 inner capabilityProfile object, L81 inner dimensionRadar object, L84 outer schema) · grep of `packages/shared/src/types/**` for `.strict()` returns **only** those 4 occurrences (all in v5-candidate-self-view.ts) | shipped (for self-view) · absent on other shared schemas | partial |
| 2-token separation (candidate exam token vs self-view token) | `prisma/schema.prisma:70-74` Session has `candidateToken String? @unique` + `candidateSelfViewToken String? @unique` · admin.ts:247-253 mints both at session creation · self-view route (candidate-self-view.ts:42) rejects on token mismatch with uniform 404 | shipped | N/A |
| Admin endpoints can access grade / composite / signals (asymmetric — admin not over-stripped) | `routes/admin.ts` references `grade`, `composite`, `signalScores`, `dangerFlag` in the scoring accessors (admin.ts:127-133 readGradeFromScoring / readCompositeFromScoring) · admin session detail/report handlers present at admin.ts:596-598 | shipped | N/A |

Observation: only `v5-candidate-self-view.ts` uses `.strict()` among shared schemas. Other candidate-submit schemas (e.g. `CandidateProfileSubmitRequestSchema` imported at candidate.ts:22) were not audited for `.strict()` coverage in this pass — DO NOT CONCLUDE they are open; unverified.

Area 5 summary: candidate self-view transform + schema enforce the documented strip list with `.strict()` gates; other shared schemas were not strict-audited in this pass.

---

## Area 6 · Admin UI completeness

Plan canonical references:
- backend-agent-tasks.md · Task 15a + 15b (admin API) · Task 12 Layer 2 (real API cutover per commit 866d85f)

| Plan item | File:line reference | Actual state | Gap |
|-----------|---------------------|--------------|-----|
| Create session page (suite + candidate picker → POST /admin/sessions/create) | `pages/admin/pages/AdminCreateSessionPage.tsx` (21 testids · imports adminApi at line 13 · calls `adminApi.createSession` at line 99) | shipped | N/A |
| List sessions page | `pages/admin/pages/AdminSessionsListPage.tsx` (10 testids · imports adminApi at line 12) | shipped | N/A |
| Session detail / report | `pages/admin/pages/AdminSessionDetailPage.tsx` (12 testids · calls `adminApi.getSessionReport` at line 31) | shipped | N/A |
| Exam library browser | `pages/admin/pages/AdminExamLibraryPage.tsx` (7 testids · imports adminApi at line 2) | shipped | N/A |
| Stats overview / dashboard | `pages/admin/pages/AdminDashboardPage.tsx` (8 testids · imports adminApi at line 2) | shipped | N/A |
| Login | `pages/admin/LoginPage.tsx` (6 testids · calls `postLogin` via `services/authApi.ts`) | shipped | N/A |
| Layout shell | `pages/admin/AdminLayoutPage.tsx` (4 testids) + `AdminGuard.tsx` | shipped | N/A |
| Admin API contract | `adminApi` imported from `services/adminApi.js` in all 5 admin pages (grep hits all 5) | shipped | N/A |
| "placeholder / stub / not implemented" TODO copy in admin pages | grep for `TODO\|FIXME\|placeholder\|stub\|not implemented` on admin/**/*.tsx returned only `AdminSessionsListPage.test.tsx:13,82` `<div data-testid="detail-stub" />` — test-only stub, no production stub copy | shipped | N/A |

Mock-data fixtures survived as `packages/client/src/pages/admin/mock/` (admin-exam-instances-fixtures / admin-positions-fixtures / admin-sessions-fixtures / admin-stats-fixture) — per task 12 Layer 2 commit `866d85f` description these are used when `VITE_ADMIN_API_MOCK=true`. Not removed.

Area 6 summary: all 5 admin pages + login wire through adminApi to real endpoints; mock-data fixtures remain on disk for a VITE env-toggled fallback path.

---

## Area 7 · Database / seed

Plan canonical references:
- backend-agent-tasks.md · Task 4 (schema), Task 14 (exam generation), Task 7 (prompt seed), Task B-A12 (candidateProfile/Consent), Task B-A10-lite (selfViewToken)

| Plan item | File:line reference | Actual state | Gap |
|-----------|---------------------|--------------|-----|
| Prisma schema has Session + Candidate + Organization + OrgMember + ExamInstance + ExamModule + PromptVersion + EventLog | `schema.prisma` (`grep "^model "` returns 8 models) | shipped | N/A |
| Session model includes candidateToken + candidateSelfViewToken (V5.0) | schema.prisma:70-74 (unique, nullable) | shipped | N/A |
| CandidateProfile + consentAcceptedAt migration (B-A12) | `migrations/20260420084500_add_candidate_profile/` + schema.prisma:62-65 | shipped | N/A |
| candidateToken migration (B-A12 auth-fallback) | `migrations/20260420110000_add_session_candidate_token/` | shipped | N/A |
| candidateSelfViewToken migration (B-A10-lite) | `migrations/20260421000000_add_session_candidate_self_view_token/` | shipped | N/A |
| V5 init migration | `migrations/20260417002542_init_v5/` | shipped | N/A |
| Prompt seed (17 keys, placeholder content for Task 9/10 fill) | `prisma/seed.ts:1-49` · `PLACEHOLDER_CONTENT = 'TODO: Task 9-10 填充'` · creates 17 rows for `V5_PROMPT_KEYS` | shipped (placeholder only) | partial — real prompts pending Task 9/10/14 fill |
| Demo admin + sample session seed | `prisma/demo-seed.ts` (194 LOC) · creates demo admin + Alice Zhang COMPLETED session | shipped | N/A |
| ExamInstance seed (canonical exam baseline for dev / cold-start / golden path) | **MISSING** — `find packages/server -name "*canonical-exam*" -o -name "*seed-exam*" -o -name "*canonical-v*"` returns 0 · `demo-seed.ts` creates no ExamInstance per prior grep | missing | GAP |
| `packages/server/src/exam-generator/` directory | CLAUDE.md lists this path as "出题目录" but `ls packages/server/src/exam-generator/` → No such file or directory | missing | DOC_DRIFT (CLAUDE.md claims directory that does not exist) |

Area 7 summary: all 4 migrations apply cleanly and Prompt seed + demo-seed are in place; no script creates ExamInstance rows and the `exam-generator` directory referenced in CLAUDE.md does not exist.

---

## Area 8 · CI / test infrastructure

Plan canonical references:
- CI_KNOWN_RED.md · current state
- backend-agent-tasks.md Phase 3 Task 17 + 18 + 20

Latest main CI run (run id `24764362751`, HEAD `447a569`):
| Job | Status / conclusion |
|-----|---------------------|
| lint-and-typecheck | completed · **success** |
| test | completed · **success** |
| e2e | completed · **success** (smoke.spec.ts only) |
| build | completed · **success** |
| prompt-regression | completed · **skipped** (path-gate on main-push doesn't fire when baseline file was added in same commit — observations #146) |
| docker | completed · **failure** (pre-existing · Dockerfile missing · V5.2 known-red) |

| Plan item | File:line reference | Actual state | Gap |
|-----------|---------------------|--------------|-----|
| `.github/workflows/ci.yml` with 6 jobs | file present · sections lint-and-typecheck / test / e2e / prompt-regression / build / docker | shipped | N/A |
| `CI_KNOWN_RED.md` current | `docs/v5-planning/CI_KNOWN_RED.md` lists docker as only known-red; e2e + prompt-regression resolved 2026-04-22 per section "e2e · prompt-regression 解封历史" | shipped | N/A |
| E2E smoke (V5.0 minimal) | `e2e/smoke.spec.ts` (28 LOC, GET /health) · V5.0.1 A14b expands | shipped | N/A |
| Task 17 V5 Golden Path spec (`e2e/candidate-v5-golden-path.spec.ts`) | **NOT CREATED** — `find . -name "candidate-v5-golden-path*" -o -name "golden-path*.spec.ts"` returns 0 (only smoke.spec.ts exists) | missing | GAP |
| Task 17 fixtures (4 grades × liam/steve/emma/max) | `packages/server/src/tests/fixtures/golden-path/{liam-s,steve-a,emma-b,max-c}-grade.ts` + exam-data.ts + expectations.ts · 1406 LOC total | shipped | N/A |
| `e2e/fixtures/` (UI test fixtures referenced by v4 helpers) | dir does not exist — `e2e/helpers/golden-path-driver.ts:26-28` imports `../fixtures/golden-paths/testid-map.js` and `./types.js` which do not exist · ~506 LOC of dead helpers | missing | DOC_DRIFT + broken import chain |
| Promptfoo mock provider (V5.0 single LLM signal baseline) | `packages/server/promptfoo/mock-provider.js` + `packages/server/promptfooconfig.yaml` · sAiOrchestrationQuality only | shipped (minimal) | partial vs. 3-LLM ambition deferred to V5.0.5 A14b |

Area 8 summary: 4/6 jobs green, 1 skipped (prompt-regression path-gate artifact), 1 failure (docker, known-red V5.2); Task 17 fixtures exist in-process but the UI-facing Golden Path E2E spec has not been created.

---

## Area 9 · Phase 3 roadmap tasks

Plan canonical references:
- backend-agent-tasks.md · Task 15 / 17 / 18 / 20 / 21 sections (Phase 3 · line 1524 onward)

`git log --all --oneline --grep="Task 15\|Task 17\|Task 18\|Task 20\|Task 21"` results:

| Task | Expected deliverable | Actual state | Gap |
|------|----------------------|--------------|-----|
| Task 15a · Hydration Wrapper + Shared Types + Cold Start Harness | PR #73 merged (`4475def`) · shared/v5-admin-api.ts + services/scoring-hydrator.service.ts + Cold Start Validation harness | shipped | N/A |
| Task 15b · Admin API Routes + Auth Login + V5.0 Cleanup | PR #74 merged (`6c4ad21`) · routes/admin.ts 7 endpoints + routes/auth.ts /login + shipped β-delete of V4 legacy routes | shipped | N/A |
| Task 17 · V5 Golden Path full-suite fixture + UI spec + seed | branches `feat/backend-task17` and `feat/backend-task17b-calibration` exist · fixtures shipped (see Area 8), but on inspection the Task 17 scope appears to have pivoted to **A1 sCalibration signal** (`73a62c9 feat(backend-task-a1): sCalibration signal + two-pass orchestrator seam`) rather than the E2E spec | partial / diverged — fixtures shipped, E2E spec missing, scope partially absorbed by Task A1 | partial + DOC_DRIFT (backend-agent-tasks.md:1554-1619 still describes Task 17 as the UI E2E spec) |
| Task 18 · Consistency test | Not located in `git log --grep "Task 18"` · commit `662ce58 [A14a]` appears to be the merged-in successor (pure-rule signal reliability · 180 deep-equal gates). Also, `CI_KNOWN_RED.md` section "V5.0 Signal Production Gap" (2026-04-18) lists a "new Task 18.1 / 18.2" scope split — different from backend-agent-tasks original Task 18 | diverged | DOC_DRIFT — "Task 18" name reused for (a) consistency test absorbed by A14a, (b) CI_KNOWN_RED 18.1/18.2 behavior:batch + module ingestion fix |
| Task 20 · Performance | No matching commits · no obvious perf harness in `packages/server/src/__tests__/` beyond `reliability/pure-rule-signals.test.ts` | missing | GAP |
| Task 21 · Deploy config + integration | No `Dockerfile` · no `docker-compose*.yml` · no `ecosystem.config.js` at repo root · CI_KNOWN_RED.md classifies this as V5.2 deployment scope (not V5.0 blocker) | missing (V5.2 deferred per doc) | N/A (deferred per plan) |

Related Phase 3 commits outside the 15/17/18/20/21 window:
- Task 23 MB submit (`77a5555`) · Task 24 self-assess (`d16b738`) · Task 26 MA submit (`6cd3b33`) · Task 27 MD submit (`64dc7cd`) — all shipped under "Cluster C" / Pattern H gates
- Task 12 Layer 2 admin real-API cutover (`866d85f`, `00ab85a`) · shipped
- Task A1 sCalibration (`73a62c9`) · shipped
- Task A7 audit (`96def46`) · docs-only audit of sDecisionLatencyQuality · shipped
- Task A14a (`662ce58`) · reliability gate · shipped
- Task A15 Transparency (`bc338ea`) · shipped
- Task B-A10-lite (self-view) · shipped
- Task B-A12 (`a6f009c`, `376ada7`, `d655018`) · shipped

Area 9 summary: Tasks 15a / 15b / 23 / 24 / 26 / 27 / A1 / A7 / A14a / A15 / B-A10-lite / B-A12 all shipped; Task 17 diverged (fixtures yes, UI E2E spec no), Task 18 name reused across two different scopes, Task 20 and Task 21 have no commits in repo.

---

## Area 10 · Environment / integration health

Plan canonical references:
- backend-agent-tasks.md · Task 6 (RTC/voice), observability plan in env schema
- CLAUDE.md · SandboxProvider 3-tier · ModelProvider abstraction

| Plan item | File:line reference | Actual state | Gap |
|-----------|---------------------|--------------|-----|
| LLM ModelProvider abstraction (Ark primary + fallbacks) | `services/model/` = base-openai-provider.ts + claude.provider.ts + deepseek.provider.ts + glm.provider.ts + qwen.provider.ts + index.ts + model-factory.ts | shipped (5 providers + factory) | N/A |
| Env keys ARK / DASHSCOPE / DEEPSEEK / ANTHROPIC / GLM | `src/config/env.ts` has ARK_API_KEY, ARK_BASE_URL (default `https://ark.cn-beijing.volces.com/api/v3`), ARK_MODEL_PRO/LITE, DASHSCOPE_API_KEY + BASE_URL (default DashScope compat endpoint) + MODEL (default qwen3-coder-plus), DEEPSEEK_*, ANTHROPIC_API_KEY + CLAUDE_BASE_URL + CLAUDE_MODEL, GLM_API_KEY + GLM_BASE_URL (default `https://open.bigmodel.cn/api/paas/v4/`) + GLM_DEFAULT_MODEL (default `glm-4-plus`) — all optional | shipped | N/A |
| 3-tier sandbox (E2B → Docker → Static) | `services/sandbox/sandbox-factory.ts:24-36` constructs in that order · 5-minute health cache · `e2bForceUnhealthy` operator override | shipped | N/A |
| RTC integration (Volcano VERTC) | `services/rtc-token.service.ts` + `services/voice-chat.service.ts` + `services/mc-probe-engine.ts` · env keys VOLC_RTC_APP_ID, VOLC_RTC_APP_KEY, VOLC_AK, VOLC_SK, VOLC_AI_USER_ID (default AI_Interviewer01), VOLC_SUBTITLE_CALLBACK_URL, VOLC_SUBTITLE_SIGNATURE, VOLC_TTS_SPEAKER (default ICL_zh_female_yuxin_v1_tob), VOLC_VAD_SILENCE_TIME (default 1300), VOLC_INTERRUPT_MODE, VOLC_INTERRUPT_SPEECH_DURATION (default 800) | shipped (config + services) · HTTP route `mc-voice-chat.ts` **not mounted** (see Area 2) | partial — transport disconnected |
| SSE endpoint (MC voice) | `routes/mc-voice-chat.ts:105 POST /voice-chat` (OpenAI-compatible SSE, Ark primary + DashScope fallback) | file exists · NOT mounted | orphan (Area 2) |
| Observability · Langfuse tracing | `lib/langfuse.ts` · env keys LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL (default cloud.langfuse.com) · optional | shipped | N/A |
| Observability · Sentry | `lib/sentry.ts` present, dynamically imports `@sentry/node` when `SENTRY_DSN` env is set · **SENTRY_DSN and SENTRY_ENVIRONMENT are read from `process.env` directly and are NOT declared in the zod env schema `src/config/env.ts`** · `@sentry/node` is listed as "optional peer dependency" (header comment) | partial | UNDOCUMENTED_IMPL (env var not in schema) |
| Structured logger | `lib/logger.ts` present · used throughout (grep shows imports from ~30 files) · no pino / winston package in the grep output, implementation detail deferred per fence #5 | shipped | N/A |

`env.ts` required keys (no `.optional()` / no `.default()`): `DATABASE_URL`, `JWT_SECRET (min 16)`. All others have `.optional()` or `.default(...)`.

Area 10 summary: Model providers + sandbox 3-tier + Langfuse tracing are wired; RTC services + SSE route exist on disk but the HTTP transport for MC voice is not mounted; Sentry is optional + not declared in env schema.

---

## Cross-area gaps inventory (factual list · no severity)

- **Gap 1** · `routes/session.ts` (8 endpoints) not mounted in `src/index.ts` · references in index.ts header comment line 7 · Area 2
- **Gap 2** · `routes/voice.ts` (4 endpoints) not mounted · Area 2
- **Gap 3** · `routes/mc-voice-chat.ts` (POST /voice-chat SSE) not mounted · Area 2 + Area 10
- **Gap 4** · No MC socket handler file · Area 3
- **Gap 5** · No ExamInstance seed script (`find packages/server -name "*canonical-exam*" -o -name "*seed-exam*"` returns 0) · Area 7 — affects `POST /admin/sessions/create` which 404s on missing examInstanceId (admin.ts:220-225)
- **Gap 6** · `packages/server/src/exam-generator/` directory does not exist · Area 7 (also DOC_DRIFT)
- **Gap 7** · `e2e/candidate-v5-golden-path.spec.ts` not created · Area 8 — Task 17 E2E ambition
- **Gap 8** · `e2e/fixtures/` directory missing; `e2e/helpers/golden-path-driver.ts` imports `../fixtures/golden-paths/testid-map.js` + `./types.js` which do not exist (broken imports, ~506 LOC of orphan helpers) · Area 8
- **Gap 9** · `Dockerfile` not present at repo root (docker CI job red pre-existing) · Area 9 / Area 10 — V5.2 deferred per CI_KNOWN_RED.md
- **Gap 10** · Task 20 (Performance) has no commits in repo · Area 9
- **Gap 11** · `SENTRY_DSN` / `SENTRY_ENVIRONMENT` env vars read by `lib/sentry.ts` but not declared in zod schema `src/config/env.ts` · Area 10

## Documentation drift detected

- **DOC_DRIFT-0** · `docs/v5-planning/steve-playbook.md` is referenced by this audit instruction as a canonical plan source, but the file does not exist in repo. (Covered by audit in 2/3 canonical docs only.)
- **DOC_DRIFT-1** · CLAUDE.md `目录规范` section declares `packages/server/src/exam-generator/` as "出题目录" but the directory does not exist (Area 7). CLAUDE.md also states "按 step 拆分" which has no corresponding filesystem layout to verify.
- **DOC_DRIFT-2** · backend-agent-tasks.md:1554-1619 describes Task 17 as the V5 Golden Path E2E build (spec file `candidate-v5-golden-path.spec.ts`), but in-repo Task 17 branches and commits (`feat/backend-task17`, `feat/backend-task17b-calibration`, `73a62c9 feat(backend-task-a1): sCalibration signal`) appear to have pivoted toward A1 sCalibration signal work rather than the E2E spec. (Area 9)
- **DOC_DRIFT-3** · "Task 18" label reused for two different scopes: (a) Consistency test per backend-agent-tasks.md plan which appears absorbed into A14a reliability gate (`662ce58`), and (b) `CI_KNOWN_RED.md` section "V5.0 Signal Production Gap (2026-04-18)" introduces a new "Task 18.1 / 18.2" covering behavior:batch ingest + Phase0/MA/MD submission integration. These are distinct scopes sharing a number. (Area 9)
- **DOC_DRIFT-4** · Prior design brief Appendix A reportedly listed 4 LLM signals, but only 3 are currently marked `isLLMWhitelist: true` (observations #137). `sConstraintIdentification` is pure-rule (s-constraint-identification.ts:106). (Area 4)
- **DOC_DRIFT-5** · CLAUDE.md says "43 信号: 40 纯规则 + 3 LLM 白名单" but `EXPECTED_SIGNAL_COUNT = 48` (45 pure-rule + 3 LLM whitelist) per Task A1 closure. (Area 4)

## Undocumented implementations detected

- **UNDOCUMENTED_IMPL-1** · `routes/session.ts` (8 endpoints: POST /, POST /:id/start, POST /:id/end, GET /:id, GET /:id/timer, GET /:id/checkpoints, GET /:id/report, POST /:id/checkpoint/advance, POST /:id/run-hidden-tests) exists with full implementation but is never registered in `src/index.ts`. Currently dead code.
- **UNDOCUMENTED_IMPL-2** · `routes/voice.ts` (POST /token, POST /v5/start, POST /stop, GET /status) exists with RTC token minting logic but not mounted.
- **UNDOCUMENTED_IMPL-3** · `routes/mc-voice-chat.ts` (VERTC Custom LLM SSE endpoint, 280+ LOC with Ark primary + DashScope fallback) exists but not mounted — its entire integration path is latent.
- **UNDOCUMENTED_IMPL-4** · Sentry integration via `lib/sentry.ts` uses `process.env.SENTRY_DSN` + `process.env.SENTRY_ENVIRONMENT` directly, bypassing the central `env.ts` zod schema. Neither key is declared nor validated at boot.
- **UNDOCUMENTED_IMPL-5** · `packages/client/src/pages/admin/mock/` contains 4 fixture files used when `VITE_ADMIN_API_MOCK=true`. The mock-switch behavior (`auto iff !VITE_API_URL`) is documented only inline in `packages/client/.env.example:20-24` — not in the 3 canonical plan docs.

## Audit metadata

- Duration: ~25-30 min (parallelized heavily across grep/glob/gh · faster than 1-1.5h budget because many blocks reused data from the preceding pre-brief-audit pass)
- Total grep + gh + file reads this session: ~35 distinct tool calls
- Files inspected: ~50 (schema.prisma, 7 routes files, 5 socket handler files, signals/index.ts, env.ts, 6 admin page .tsx, all 13 candidate-flow .tsx via grep, 4 self-view docs, CI_KNOWN_RED.md, playwright configs, seed.ts/demo-seed.ts)
- Branch: `audit/v5-state-20260422` off main `447a569`

===== Audit END · Awaiting planning Claude re-plan =====
