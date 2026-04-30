# V5 Release Readiness Ledger

Last updated: 2026-04-29

## Current Gate Matrix

| Gate                        | Status                              | Evidence                                                                                                  | Scope truth                                                                                                                           |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Main CI                     | ✅ green                            | main run `25119721076` at `3c09cf1`                                                                       | lint/typecheck, unit tests, build, e2e smoke/golden config, Docker build + Trivy; GitHub action runtime pins on Node 24-compatible majors |
| Docker/Trivy                | ✅ green                            | PR #101 → #102 → #103                                                                                     | Real Dockerfile + runtime npm removal; not a scan downgrade                                                                           |
| Golden Path B3              | ✅ green before Cold Start addition | `npm run test:golden-path` 5/5 on 2026-04-29                                                              | 4 calibrated fixtures + smoke; proves grade/composite/report surface                                                                  |
| Hydrator Cold Start unit    | ✅ green                            | `npm --prefix packages/server test -- cold-start-validation.test.ts` 4/4                                  | Synthetic metadata + mocked LLM; hydrator seam, not full production                                                                   |
| Final Cold Start Playwright | ✅ green                            | `npx playwright test --config=e2e/playwright.golden-path.config.ts e2e/cold-start-validation.spec.ts` 1/1 | Real new `deep_dive` session through P0/MA/MB/MD/SE/MC, Admin API asserts 48/48 signal results, 0 null, report DOM 0 `N/A` / `待评估` |

## Root Causes Closed In This Pass

Cold Start initially failed with exactly four MD null signals:

- `sConstraintIdentification`
- `sDesignDecomposition`
- `sTradeoffArticulation`
- `sAiOrchestrationQuality`

DB inspection showed `metadata.moduleD` was absent while `suiteId=deep_dive`
and `moduleOrder` included `moduleD`. Root cause was not scoring: Module D had
only socket fire-and-forget persistence before the HTTP fallback patch.

Fix:

- Add `POST /api/v5/exam/:sessionId/moduled/submit`.
- Wire `ModuleDPage` to keep `moduleD:submit` socket emit and also POST the
  same submission over HTTP, matching Phase0 / ModuleA / SelfAssess σ pattern.
- Extend `GoldenPathDriver.runMD()` to operate the real dynamic MD form:
  add submodule rows, fill optional interfaces, click constraint buttons, add
  AI prompt rows.
- Add `e2e/cold-start-validation.spec.ts` and include it in the golden-path
  Playwright config.

Follow-up hardening closed the underlying socket transport mismatch:

- Client `getSocket()` now auto-connects because V5 pages emit directly through
  the shared socket helper.
- Server registers handlers on both root and `/interview`; the client uses the
  `/interview` Socket.IO namespace.
- A live Socket.IO smoke connects to `/interview` and proves `moduleA:submit`
  reaches server persistence with ack `true`.
- Module C's previously documented missing `v5:modulec:answer` handler is now
  wired on the same namespace; the socket payload carries `sessionId` and
  persists through `mc.service.saveRoundAnswer`, while HTTP remains the retry
  surface.

A later docs-only PR run exposed a second production race: a fresh `deep_dive`
session completed with 17 null signals across Module A, MB final-state/rules,
and SE. Root cause was not scoring; candidate pages advanced after
fire-and-forget submit emits/fetches, so the first admin report hydrate could
score and cache before module metadata had landed.

Fix:

- Add `packages/client/src/lib/persistCandidateSubmission.ts`, which races the
  socket ack and HTTP fallback and resolves success when either channel confirms
  persistence.
- Gate Phase0, Module A, MB final submit, Module D, and SelfAssess `advance()`
  on confirmed persistence.
- Keep the candidate on the current module and show a retryable error when both
  persistence channels fail.
- Update page tests so ack success advances after persistence and ack failure
  blocks advance. See observation #187.

The next hardening pass found two narrower follow-up truths:

- Admin report payloads still read the legacy `metadata.submissions.*` envelope
  even after scoring hydration had moved to top-level namespaces. The report
  endpoint now returns `ScoringHydratorService.hydrateAndScore().submissions`,
  so report sections and scoring share one hydrated source of truth. See
  observation #188.
- Module B planning/standards stage submits still advanced fire-and-forget.
  Because MB persistence writes `metadata.mb` through read-modify-write JSON
  updates, a late stage-slice write could land after final `v5:mb:submit` and
  clobber `finalFiles` or final audit data. Planning and standards are now
  ack-gated before stage advance, and the client no longer emits redundant
  `v5:mb:audit:submit` during final submit. See observation #189.

The MB telemetry pass closed the last transport-evidence nuance in the module
pipeline audit:

- Client chat telemetry now emits server-ingestable `chat_response_received`
  payloads with `prompt`, `responseLength`, and `duration`.
- Client diff decisions now emit `diff_accepted` / `diff_rejected` with line
  deltas from the component that actually owns accept/reject.
- `e2e/mb-telemetry-smoke.spec.ts` proves a Vite-loaded browser import of
  `getSocket()` reaches `/interview`, emits `behavior:batch`, and persists
  chat / diff / file navigation / edit-session slices into
  `metadata.mb.editorBehavior`. See observation #190.

Main run `25118324031` then exposed one final MB ordering race after the docs
ledger PR: Cold Start failed with only `sPrecisionFix` and `sRuleEnforcement`
null. Those signals read MB final-state data (`finalFiles` and final audit),
not test pass-rate telemetry. The fix in PR #127:

- Makes socket submit the primary persistence path and calls HTTP only after
  socket ack failure or timeout, so fallback is no longer a parallel metadata
  writer.
- Moves `behavior:batch` flush until after final `v5:mb:submit` persistence
  succeeds.
- Adds client tests proving HTTP is skipped after socket ack success and final
  submit is emitted before telemetry flush.
- Main run `25119721076` proves the fix across lint/typecheck, unit tests,
  build, Docker/Trivy, and e2e Cold Start. See observation #192.

## Remaining Truths

- The first Cold Start attempt exposed Monaco cold-load fragility once, then
  passed through MB on the rerun. This did not block the production gate after
  the MD fix, but it remains a V5.0.5 reliability candidate if it recurs.
- Module submission persistence, scoring hydration, and canonical module
  content delivery are green after the Layer 2 parity patch and the candidate
  persistence-gated advance patch. Existing deployed DBs must re-run
  `npm --prefix packages/server run db:seed:canonical` to upsert the updated
  MA/MD canonical content. See `docs/v5-planning/v5-module-pipeline-audit.md`.
- Existing untracked `.env.bak-*` files are local backup artifacts and must not
  be committed. The one-off local forensic script
  `packages/server/src/scripts/audit-liam-signal-gap.ts` was deleted after the
  Brief #20 sub-cycle closed; it was never a release artifact.
- `docs/v5-planning/v5-signal-production-coverage.md` is historical in places;
  the current release truth is this ledger plus passing Cold Start evidence.
- GitHub Actions Node.js 20 action-runtime deprecation was handled by upgrading
  workflow actions from `checkout@v4` / `setup-node@v4` to v6 and
  `upload-artifact@v4` to v7 while preserving the project test runtime at
  `node-version: 20`. Main run `25119721076` proved the upgraded action pins
  plus the MB final-submit ordering fix across lint/typecheck, test, build, e2e
  artifact upload, Docker, and Trivy. Main run `25139648655` later exposed one
  remaining Docker action-runtime warning from `docker/setup-buildx-action@v3`;
  the follow-up CI hygiene PR upgrades that final Docker action pin to v4
  without changing the project Node runtime.
