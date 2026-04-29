# V5 Release Readiness Ledger

Last updated: 2026-04-29

## Current Gate Matrix

| Gate                        | Status                              | Evidence                                                                                                  | Scope truth                                                                                                                           |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Main CI                     | ✅ green                            | main run `25088716892` at `edaae5d`                                                                       | lint/typecheck, unit tests, build, e2e smoke/golden config, Docker build + Trivy                                                      |
| Docker/Trivy                | ✅ green                            | PR #101 → #102 → #103                                                                                     | Real Dockerfile + runtime npm removal; not a scan downgrade                                                                           |
| Golden Path B3              | ✅ green before Cold Start addition | `npm run test:golden-path` 5/5 on 2026-04-29                                                              | 4 calibrated fixtures + smoke; proves grade/composite/report surface                                                                  |
| Hydrator Cold Start unit    | ✅ green                            | `npm --prefix packages/server test -- cold-start-validation.test.ts` 4/4                                  | Synthetic metadata + mocked LLM; hydrator seam, not full production                                                                   |
| Final Cold Start Playwright | ✅ green                            | `npx playwright test --config=e2e/playwright.golden-path.config.ts e2e/cold-start-validation.spec.ts` 1/1 | Real new `deep_dive` session through P0/MA/MB/MD/SE/MC, Admin API asserts 48/48 signal results, 0 null, report DOM 0 `N/A` / `待评估` |

## Root Cause Closed In This Pass

Cold Start initially failed with exactly four null signals:

- `sConstraintIdentification`
- `sDesignDecomposition`
- `sTradeoffArticulation`
- `sAiOrchestrationQuality`

DB inspection showed `metadata.moduleD` was absent while `suiteId=deep_dive`
and `moduleOrder` included `moduleD`. Root cause was not scoring: Module D had
only socket fire-and-forget persistence, while the current V5.0 app still
depends on HTTP fallback for guaranteed module submission writes because the
root `useSocket()` connection remains V5.0.1 cleanup.

Fix:

- Add `POST /api/v5/exam/:sessionId/moduled/submit`.
- Wire `ModuleDPage` to keep `moduleD:submit` socket emit and also POST the
  same submission over HTTP, matching Phase0 / ModuleA / SelfAssess σ pattern.
- Extend `GoldenPathDriver.runMD()` to operate the real dynamic MD form:
  add submodule rows, fill optional interfaces, click constraint buttons, add
  AI prompt rows.
- Add `e2e/cold-start-validation.spec.ts` and include it in the golden-path
  Playwright config.

## Remaining Truths

- The first Cold Start attempt exposed Monaco cold-load fragility once, then
  passed through MB on the rerun. This did not block the production gate after
  the MD fix, but it remains a V5.0.5 reliability candidate if it recurs.
- Module submission persistence, scoring hydration, and canonical module
  content delivery are green after the Layer 2 parity patch. Existing deployed
  DBs must re-run `npm --prefix packages/server run db:seed:canonical` to
  upsert the updated MA/MD canonical content. See
  `docs/v5-planning/v5-module-pipeline-audit.md`.
- Existing untracked `.env.bak-*` files are local backup artifacts and must not
  be committed. `packages/server/src/scripts/audit-liam-signal-gap.ts` remains
  a local forensic script unless deliberately promoted or deleted.
- `docs/v5-planning/v5-signal-production-coverage.md` is historical in places;
  the current release truth is this ledger plus passing Cold Start evidence.
