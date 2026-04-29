# V5 Module Pipeline Audit

Date: 2026-04-29

Purpose: separate the release truth into three independent layers:

1. Candidate submission persistence.
2. Canonical module content delivery.
3. Hydration, scoring, and report rendering.

The Cold Start gate proves layer 1 and layer 3 are green for a fresh
`deep_dive` session. It does not prove every candidate page is already fed by
canonical DB module content.

## Executive Status

| Layer | Status | Evidence | Remaining issue |
|------|--------|----------|-----------------|
| Submission persistence | Green for V5.0 gate | Cold Start Playwright: P0/MA/MB/MD/SE/MC complete; 48/48 signal results; 0 null | Current reliability path is HTTP fallback for final submissions because root `useSocket()` remains V5.0.1 cleanup |
| Scoring hydration | Green | `ScoringHydratorService` reads top-level namespaces only and Admin report renders 0 `N/A` / `待评估` | No V4 `metadata.submissions.*` fallback by design |
| Canonical content delivery | Partial | MB has `GET /api/v5/exam/:examInstanceId/module/mb`; hydrator reads all six module specs from DB | P0/MA/MC/MD/SE candidate pages still use local/static module content or local prompt constants; endpoint returns 501 for non-MB modules |
| MB telemetry fidelity | Gate-green but nuanced | Real socket `behavior:batch` ingest exists; Cold Start uses e2e HTTP bypass for fixture-shaped editorBehavior | Production live telemetry smoke should remain a V5.0.1 quality target after root socket wiring |

## Module Matrix

| Module | UI source today | Submit trigger | Guaranteed persist path | Metadata namespace | Hydrator read | Signals |
|--------|-----------------|----------------|--------------------------|-------------------|---------------|---------|
| Phase 0 | `P0_MOCK_FIXTURE` default in `Phase0Page` | Submit button builds `V5Phase0Submission` | Socket `phase0:submit` plus HTTP `POST /api/v5/exam/:sessionId/phase0/submit` | `metadata.phase0` | `readNamespace(meta, 'phase0')` | 5 P0 |
| Module A | `MA_MOCK_FIXTURE` default in `ModuleAPage` | Final R4 submit builds one `V5ModuleASubmission` | Socket `moduleA:submit` plus HTTP `POST /api/v5/exam/:sessionId/modulea/submit` | `metadata.moduleA` | `readNamespace(meta, 'moduleA')` | 10 MA |
| Module B | DB-backed candidate-safe MB content via `useModuleContent(examInstanceId, 'mb')` | Stage 4 audit submit builds `V5MBSubmission` | Socket `v5:mb:submit` plus HTTP `POST /api/v5/exam/:sessionId/mb/submit`; telemetry via `behavior:batch` / MB socket handlers | `metadata.mb` | `readMbNamespace(meta)` | 23 MB |
| Module D | `MD_MOCK_FIXTURE` default in `ModuleDPage` | Submit button builds `V5ModuleDSubmission` | Socket `moduleD:submit` plus HTTP `POST /api/v5/exam/:sessionId/moduled/submit` | `metadata.moduleD` | `readNamespace(meta, 'moduleD')` | 4 MD |
| SelfAssess | Local page state + `DecisionSummary` from local store | Submit button builds `V5SelfAssessSubmission` | Socket `self-assess:submit` plus HTTP `POST /api/v5/exam/:sessionId/selfassess/submit` | `metadata.selfAssess` | `readNamespace(meta, 'selfAssess')` | 2 SE |
| Module C | Local prompt constants + voice/text fallback UI | Each text round posts an answer; final button marks session complete | Socket `v5:modulec:answer` kept, but HTTP `POST /api/v5/exam/:sessionId/modulec/round/:roundIdx` is the guaranteed write; final `POST /complete` ends session | `metadata.moduleC` array | `readModuleCNamespace(meta)` | 4 MC |

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
The HTTP fallback is the guaranteed V5.0 write path because the root socket
connection is not yet wired as the only reliable transport.

This is not a scoring compromise; it is a transport reliability boundary. The
right V5.0.1 cleanup is to wire root socket session lifecycle and then decide
which HTTP fallbacks remain as explicit retry/fallback surfaces.

## Layer 2 · Canonical Content Delivery

This is the main product-quality gap found by the audit.

`packages/server/src/routes/exam-content.ts` exposes:

```text
GET /api/v5/exam/:examInstanceId/module/:moduleType
```

but only `mb` is implemented. All other valid module types currently return
501 with a clear message that Brief #15 covered MB only.

Current state:

- MB candidate content is canonical and candidate-safe: DB `MBModuleSpecific`
  is stripped through `stripMBToCandidateView`.
- The hydrator reads all six module specs from DB for scoring:
  P0, MA, MB, MD, SE, MC.
- Candidate pages for P0, MA, MD still default to local mock fixtures.
- Module C uses local prompt constants for text fallback rounds.
- SelfAssess has no heavy module-specific content, but its page still depends
  on local store summary rather than a dedicated canonical content branch.

Root cause: the sprint closed production submission gaps first, because those
blocked signal non-null production scoring. The Layer 2 content swap was only
completed for MB. That leaves a possible divergence class:

```text
candidate sees local/static page content
hydrator scores against DB canonical examData
```

Cold Start can still pass in this state because the fixture answers and local
page content are aligned enough to produce non-null signals. It does not prove
that every future exam instance can safely vary P0/MA/MD/MC content without UI
and scoring drift.

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
not evidence that real browser telemetry quality is perfect. After root socket
wiring, a live telemetry smoke should verify that real candidate interactions
populate at least the MB behavior slices used by the 23 MB signals.

## Root Cause Focus

The current project problem is no longer "signals cannot score." That was the
Cluster A/B/C/D sprint and Cold Start work, now closed for V5.0 gate purposes.

The current root issue is split ownership between two pipeline layers:

- Submission ownership was repaired module by module with socket plus HTTP
  fallback and top-level metadata namespaces.
- Content ownership remains asymmetric: only MB has a canonical
  candidate-facing DB content endpoint, while scoring already assumes all six
  module specs are canonical DB data.

This is the next elegant-delivery target: promote P0/MA/MD/MC content delivery
to the same standard MB already has, with candidate-safe projections and tests
that assert "UI content source == hydrator examData source" for each module.

## Recommended Next Target

Task name candidate: `Layer 2 canonical module content parity`.

Scope:

1. Add candidate-safe projections for P0, MA, MD, and MC where needed.
2. Extend `GET /api/v5/exam/:examInstanceId/module/:moduleType` beyond MB.
3. Swap P0/MA/MD/MC pages from default local fixtures to `useModuleContent`
   in real candidate routes while preserving fixture props for tests/storybook.
4. Add integration tests that create an exam instance and assert candidate-safe
   module content shape for every participating module.
5. Add one Playwright guard that fails if a real candidate route falls back to
   local mock content when `examInstanceId` is present.

Non-goal:

- Do not remove HTTP submission fallbacks in the same task. Socket-root cleanup
  is a separate transport reliability task.

