# Brief #20 Truth Ledger

Date: 2026-04-29
Branch: `fix/submission-completeness-and-polling`

## Purpose

This ledger separates release evidence from lower-level smoke evidence for
Brief #20. It exists because ratify-error #8 came from treating
server-side fixture replay as Golden Path gate #5 closure.

## Evidence Ladder

| Evidence | Scope | Current status | Release meaning |
|---|---|---|---|
| Unit / service tests | Local functions and persistence helpers | Covered by prior commits | Necessary, not release proof |
| `verify:e2e-scoring` | In-process scoring against four fixtures | 2026-04-29: 4/4 pass; Max 23.54 in `[14,24]` | Fast pre-B3 drift check only |
| B3 Playwright Golden Path | UI flow -> persist -> admin report scoring | 2026-04-29 clean rerun: 5/5 pass | Gate #5 proof |
| Cold Start | Real candidate session + Steve manual trace | Pending after Brief #20 closure | Gate #6 proof |

Rule: lower-level green never substitutes for a higher-level gate. A
server-side replay can block B3 if red, but cannot close B3 when green.

## Brief #20 Fix Stack

| Commit | Purpose | Evidence level |
|---|---|---|
| `ef09949` | MB editor-behavior, test-result, and SE reviewedDecisions endpoints | Production-path plumbing |
| `19fe090` | GoldenPathDriver MB bypass posts fixture behavior/test data | B3 input bridge |
| `d4a17f2` | Phase0 confidence slider replaces hardcoded 0.5 | UI -> submission truth |
| `a4c6c1b` | SelfAssess reviewedDecisions textarea + driver fill | UI -> submission truth |
| `f817e40` | `verify:e2e-scoring` fast replay script | Pre-B3 smoke only |
| `3b364bb` | Script scope note: replay is not e2e validation | Ratify-error #8 defense |
| `0b399b6` | Module A R2 page resolves real `defectId` from clicked line | V5.0 ship-blocking UI scoring fix |
| `efcbb72` | testRuns dispatch in `/mb/editor-behavior` | C2/C3 self-regression closure |
| `b625fec` | Disable invalid DOM parse of sCalibration row | B3 false-positive removal |

## Z Recalibration Truth

Z is not a production-code fix. Z is a Golden Path expectation
recalibration after the real UI path started submitting the real MA R2
defect id.

Evidence chain:

- Calibration provenance: Max `[14,24]` was introduced in `aa67369`
  after Task 17b Phase 3. At that time the MA R2 page path did not submit a
  real canonical defect id in e2e, so `sHiddenBugFound` effectively stayed at
  miss-level for Max.
- Fixture provenance: Max's `unknown` R2 marker originated in `ef850a5`.
  The later `9c62f72` edit only padded the comment text for UI thresholds;
  it did not change the intended shallow `nit` behavior.
- Post-fix distribution: after `0b399b6`, B3 clicks line 4 and the page
  resolves that line to critical `d1`. Max still marks it as `nit`, so
  `MISCLASSIFIED_PENALTY=0.5` fires. The observed B3 composite becomes
  about 26.47, roughly +2.47 over the old band.
- Design narrative: this is the Dunning-Kruger pattern the Max fixture is
  meant to represent: noticing "something" on a critical bug but classifying
  it as cosmetic. "Near zero" is not absolute zero.
- Non-bug confirmation: real candidate scoring behavior is already correct
  after `0b399b6`; Z touches expectations only.

Decision: widen Max composite band from `[14,24]` to `[14,28]` so B3
assertions match the corrected UI path while preserving grade `D` and
monotonic ordering Liam > Steve > Emma > Max.

## Gate Closure Steps

1. Apply Z in `expectations.ts`. Done.
2. Append obs#170 Z entry with the evidence chain above. Done.
3. Run `npm --prefix packages/server run verify:e2e-scoring`. Done: 4/4 pass.
4. Run `npm run test:golden-path`. Done: 5/5 pass.
5. Treat any B3 failure as a stop-report, not as a band-adjustment prompt.
   Followed: two infrastructure failures were isolated before the final clean
   rerun; no score band was adjusted after a B3 failure.

## B3 Credential Source Drift

First post-Z B3 run on 2026-04-29 failed at admin login before any candidate
flow:

- Page showed `邮箱或密码错误`.
- `seed-admin.ts` had seeded `admin@codelens.dev`, but it reads
  `packages/server/.env` through `dotenv/config`.
- `e2e/golden-path.spec.ts` ran from repo root and only read
  `process.env.ADMIN_PASSWORD`, so local runs fell back to
  `ci-test-password-1234`.
- A read-only bcrypt probe confirmed the seeded hash did not match the
  fallback password.

Fix: load `packages/server/.env` in the B3 spec before building
`ADMIN_CREDS`. CI-provided environment variables still take precedence because
dotenv does not override existing env values by default.

## B3 Stale WebServer Note

After the credential fix, an intermediate B3 run failed at
`admin-create-step3-exam-${CANONICAL_EXAM_ID}` with the page showing
`listExamInstances failed: 500`. Direct HTTP probe against a fresh
`NODE_ENV=test` backend returned 200 and the canonical exam row. Root cause was
stale Playwright webServer reuse after interrupting the previous failed run.
Killing stale backend/frontend processes and rerunning from a clean server pair
produced the final 5/5 pass.

Final B3 result on 2026-04-29:

```text
5 passed (2.5m)
```
