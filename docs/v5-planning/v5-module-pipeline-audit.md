# V5 Module Pipeline Audit

Date: 2026-04-29
Last implementation update: PR candidate `feat/layer2-module-content-parity`

Purpose: separate the release truth into three independent layers:

1. Candidate submission persistence.
2. Canonical module content delivery.
3. Hydration, scoring, and report rendering.

The Cold Start gate proves layer 1 and layer 3 are green for a fresh
`deep_dive` session. It does not prove every candidate page is already fed by
canonical DB module content.

## Executive Status

| Layer                      | Status                           | Evidence                                                                                                       | Remaining issue                                                                                                   |
| -------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Submission persistence     | Green for V5.0 gate              | Cold Start Playwright: P0/MA/MB/MD/SE/MC complete; 48/48 signal results; 0 null; live `/interview` socket smoke | HTTP fallbacks remain belt-and-suspenders retry surfaces, not the only live transport                             |
| Scoring hydration          | Green                            | `ScoringHydratorService` reads top-level namespaces only and Admin report renders 0 `N/A` / `待评估`           | No V4 `metadata.submissions.*` fallback by design                                                                 |
| Canonical content delivery | Green after Layer 2 parity patch | `GET /api/v5/exam/:examInstanceId/module/:moduleType` now returns candidate-safe content for P0/MA/MB/MC/MD/SE | Existing deployed DBs must re-run `db:seed:canonical` so canonical ExamModule rows pick up MA/MD content updates  |
| MB telemetry fidelity      | Gate-green but nuanced           | Real socket `behavior:batch` ingest exists; `/interview` namespace now wired; Cold Start uses e2e HTTP bypass  | A browser-level live telemetry smoke remains a V5.0.1 quality target                                             |

## Module Matrix

| Module     | UI source today                                                                                                                   | Submit trigger                                                                                                          | Guaranteed persist path                                                                                                                                       | Metadata namespace       | Hydrator read                       | Signals |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------- | ------- |
| Phase 0    | DB-backed candidate-safe P0 content via `useModuleContent(examInstanceId, 'p0')`; local fixture only for tests/preview/no session | Submit button builds `V5Phase0Submission`                                                                               | Socket `phase0:submit` plus HTTP `POST /api/v5/exam/:sessionId/phase0/submit`                                                                                 | `metadata.phase0`        | `readNamespace(meta, 'phase0')`     | 5 P0    |
| Module A   | DB-backed candidate-safe MA content via `useModuleContent(examInstanceId, 'ma')`; local fixture only for tests/preview/no session | Final R4 submit builds one `V5ModuleASubmission`; frontend submits reviewed `line`, server maps to canonical `defectId` | Socket `moduleA:submit` plus HTTP `POST /api/v5/exam/:sessionId/modulea/submit`                                                                               | `metadata.moduleA`       | `readNamespace(meta, 'moduleA')`    | 10 MA   |
| Module B   | DB-backed candidate-safe MB content via `useModuleContent(examInstanceId, 'mb')`                                                  | Stage 4 audit submit builds `V5MBSubmission`                                                                            | Socket `v5:mb:submit` plus HTTP `POST /api/v5/exam/:sessionId/mb/submit`; telemetry via `behavior:batch` / MB socket handlers                                 | `metadata.mb`            | `readMbNamespace(meta)`             | 23 MB   |
| Module D   | DB-backed candidate-safe MD content via `useModuleContent(examInstanceId, 'md')`; local fixture only for tests/preview/no session | Submit button builds `V5ModuleDSubmission`                                                                              | Socket `moduleD:submit` plus HTTP `POST /api/v5/exam/:sessionId/moduled/submit`                                                                               | `metadata.moduleD`       | `readNamespace(meta, 'moduleD')`    | 4 MD    |
| SelfAssess | Local page state + `DecisionSummary` from local store                                                                             | Submit button builds `V5SelfAssessSubmission`                                                                           | Socket `self-assess:submit` plus HTTP `POST /api/v5/exam/:sessionId/selfassess/submit`                                                                        | `metadata.selfAssess`    | `readNamespace(meta, 'selfAssess')` | 2 SE    |
| Module C   | DB-backed probe strategies via `useModuleContent(examInstanceId, 'mc')`; constants only fallback while content loads/no session   | Each text round posts an answer; final button marks session complete                                                    | Socket `v5:modulec:answer` plus HTTP `POST /api/v5/exam/:sessionId/modulec/round/:roundIdx`; final `POST /complete` ends session                               | `metadata.moduleC` array | `readModuleCNamespace(meta)`        | 4 MC    |

Signal distribution: P0 5, MA 10, MB 23, MD 4, SE 2, MC 4 = 48 total.

## Layer 1 · Submission Persistence

The V5.0 submission persistence layer is green against the release gate:

- `e2e/cold-start-validation.spec.ts` creates a fresh `deep_dive` session and
  drives the candidate UI through all participating modules.
- Admin report fetch returns 48 signal definitions and 48 signal results.
- Every signal value is non-null.
- The report DOM has 0 `N/A`, 0 `待评估`, and 0 `signal-na-row`.

Important scope truth: most module pages still use a belt-and-suspenders
pattern. They emit the canonical socket event and also fire an HTTP fallback.
After the socket namespace hardening patch, direct page emits auto-connect to
the `/interview` namespace and the server registers the V5 handlers there.
Module C now has the same real socket + HTTP retry shape as the other
submission pages; `v5:modulec:answer` carries `sessionId` explicitly because
there is still no socket-level session middleware.

Candidate session bootstrap is a separate read path:
`GET /api/v5/session/:sessionId` returns only candidate-facing metadata
(`id`, candidate snapshot, suiteId, examInstanceId, status). This is not the
deleted V4 session lifecycle route from observation #150; it was reintroduced
later as a narrow Brief #13 metadata endpoint so the candidate app can resolve
the shareable `/exam/:sessionId` URL before loading canonical module content.

This is not a scoring compromise; it is a transport reliability boundary. The
remaining cleanup is UX/policy: decide which HTTP fallbacks stay as explicit
retry surfaces and how ack failures are shown to candidates.

## Layer 2 · Canonical Content Delivery

This was the main product-quality gap found by the audit and is now closed by
the Layer 2 parity patch.

`packages/server/src/routes/exam-content.ts` exposes:

```text
GET /api/v5/exam/:examInstanceId/module/:moduleType
```

and now implements all six valid module types.

Current state:

- P0/MA/MB/MD candidate content is canonical and candidate-safe through server
  strip functions. GroundTruth fields are not returned.
- The hydrator reads all six module specs from DB for scoring:
  P0, MA, MB, MD, SE, MC.
- Candidate pages for P0, MA, MB, MD, and MC fetch by `examInstanceId` in real
  sessions and keep local fixtures/constants only for tests/preview/no-session
  fallback.
- SelfAssess has no heavy module-specific prompt content; the SE endpoint still
  returns its template for parity.

Original root cause: the sprint closed production submission gaps first, because those
blocked signal non-null production scoring. The Layer 2 content swap was only
completed for MB. That left a possible divergence class:

```text
candidate sees local/static page content
hydrator scores against DB canonical examData
```

The parity patch closes that class for current V5 modules by making the real
candidate route consume the same DB module rows the hydrator scores against.
Cold Start caught two data-alignment debts during the patch:

- Existing local DB canonical MA rows still had old 6-line review code until
  `db:seed:canonical` upserted the new line-aligned shape.
- Cold Start MD fixture constraint labels still matched the old mock content;
  it now uses DB canonical MD labels.

## Layer 3 · Hydration And Report

`ScoringHydratorService` is intentionally strict about namespace ownership:

- `metadata.phase0`
- `metadata.moduleA`
- `metadata.mb`
- `metadata.moduleD`
- `metadata.selfAssess`
- `metadata.moduleC`

It does not fallback to V4 `metadata.submissions.*`. Missing or malformed
candidate namespaces degrade to undefined submissions and naturally produce
null signals; session and exam-instance integrity errors still throw.

For exam data, hydrator reads all participating module specs through
`ExamDataService`:

- `getP0Data`
- `getMAData`
- `getMBData`
- `getMDData`
- `getSEData`
- `getMCData`

Admin report then lazy-hydrates/scored sessions and renders the full signal
definition/result map. This is the layer Cold Start proves end to end.

## MB Telemetry Boundary

MB has two truths that must be kept separate:

1. Production telemetry ingest exists through socket `behavior:batch` and MB
   handlers append to `metadata.mb.editorBehavior`.
2. The Golden Path / Cold Start driver does not replay all live Monaco/chat/test
   telemetry, so it posts fixture-shaped `editorBehavior` through
   `POST /mb/editor-behavior` and final test pass rate through
   `POST /mb/test-result` when needed.

The bypass is appropriate for deterministic e2e scoring calibration, but it is
not evidence that real browser telemetry quality is perfect. A browser-level
live telemetry smoke should verify that real candidate interactions populate at
least the MB behavior slices used by the 23 MB signals.

## Root Cause Focus

The current project problem is no longer "signals cannot score." That was the
Cluster A/B/C/D sprint and Cold Start work, now closed for V5.0 gate purposes.

The root issue found in this pass was split ownership between two pipeline layers:

- Submission ownership was repaired module by module with socket plus HTTP
  fallback and top-level metadata namespaces.
- Content ownership remains asymmetric: only MB has a canonical
  candidate-facing DB content endpoint, while scoring already assumes all six
  module specs are canonical DB data.

The parity patch promotes P0/MA/MD/MC content delivery to the same standard MB
already had. The most important design correction is Module A: the frontend no
longer needs `defects[]` to resolve answer keys. It submits the reviewed line,
and server persistence maps that line to canonical `examData.MA.defects[].defectId`.

## Recommended Next Target

Task completed candidate: `Layer 2 canonical module content parity`.

Scope:

1. Candidate-safe projections for P0, MA, MB, MD; SE/MC safe as-is.
2. `GET /api/v5/exam/:examInstanceId/module/:moduleType` supports all six modules.
3. P0/MA/MD/MC pages consume `useModuleContent` in real sessions.
4. MA submits line numbers and server-side persist maps line to canonical defectId.
5. Cold Start + full Golden Path passed after canonical seed refresh.

Non-goal:

- HTTP submission fallbacks were not removed. They remain explicit retry
  surfaces while candidate-facing ack/error UX is finalized.
