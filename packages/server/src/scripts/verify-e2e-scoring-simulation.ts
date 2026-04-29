/**
 * Brief #20 C6 · ratify-error #7 落实 verify script.
 *
 * SCOPE NOTE (Brief #20 ratify-error #8 prevention) · This script validates
 * the SCORING ENGINE + FIXTURE BASELINE via server-side replay only. It
 * feeds the in-memory `ScoreSessionInput` fixture directly into
 * `scoreSession()` — same path the integration test
 * (`tests/integration/golden-path.test.ts`) uses. It does NOT exercise:
 *   · UI submission collection (Phase0 confidence slider · MB editorBehavior
 *     · SE reviewedDecisions — the 4 gaps Brief #20 closed)
 *   · HTTP persist endpoints (Brief #19 σ + Brief #20 C2)
 *   · Driver bypass posts (Brief #20 C3)
 *   · `Session.metadata` round-trip via Prisma
 * Therefore a green result here is NECESSARY but NOT SUFFICIENT for ship
 * gate #5. The B3 Playwright spec is the e2e validation; this script is
 * its <1s pre-flight ("did the engine itself drift?").
 *
 * Phase 1 Q1 cross-validation surfaced the original failure mode: server-side
 * fixture scoring landed 30/30 in-band, e2e flow scoring landed 0/4 in-band.
 * Brief #19 §E E7 ratify then assumed Bug #1 (PROBE_STRATEGIES) was the
 * composite-gap root cause without verifying — the C8 fix proved near-zero
 * impact (74.1 → 74.1).
 *
 * This script runs scoreSession() against each Golden Path fixture and asserts
 * (composite ∈ compositeRange) ∧ (grade ∈ grades). MUST stay green BEFORE the
 * B3 Playwright spec runs in CI; if it goes red, the V5 scoring pipeline
 * itself drifted and 12-minute Playwright cycles would expose nothing new.
 *
 * Run · `tsx packages/server/src/scripts/verify-e2e-scoring-simulation.ts`
 *      `npm --prefix packages/server run verify:e2e-scoring`
 *
 * Exit · 0 if 4/4 in band · 1 if any fixture drifts.
 */

// `env.ts` validates DATABASE_URL/JWT_SECRET at module load via Zod ·
// transitive import chain pulls it in even though scoring-orchestrator
// itself doesn't touch the DB. Loading dotenv at the top of the script
// lets `npm run verify:e2e-scoring` work locally without `--env-file`.
import 'dotenv/config';

import { scoreSession } from '../services/scoring-orchestrator.service.js';
import { liamSGradeFixture } from '../tests/fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../tests/fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../tests/fixtures/golden-path/emma-b-grade.js';
import { maxCGradeFixture } from '../tests/fixtures/golden-path/max-c-grade.js';
import { FIXTURE_EXPECTATIONS } from '../tests/fixtures/golden-path/expectations.js';

const FIXTURES = [
  { key: 'liam', fixture: liamSGradeFixture, expectation: FIXTURE_EXPECTATIONS.liam },
  { key: 'steve', fixture: steveAGradeFixture, expectation: FIXTURE_EXPECTATIONS.steve },
  { key: 'emma', fixture: emmaBGradeFixture, expectation: FIXTURE_EXPECTATIONS.emma },
  { key: 'max', fixture: maxCGradeFixture, expectation: FIXTURE_EXPECTATIONS.max },
] as const;

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  for (const { key, fixture, expectation } of FIXTURES) {
    const result = await scoreSession(fixture);
    const [lo, hi] = expectation.compositeRange;
    const inBand = result.composite >= lo && result.composite <= hi;
    const gradeOk = expectation.grades.includes(result.grade);
    const ok = inBand && gradeOk;
    const tag = ok ? '✓' : '✗';
    const status = ok ? 'PASS' : 'FAIL';
    console.log(
      `${tag} [${status}] ${key.padEnd(5)} · composite=${result.composite.toFixed(2)} ` +
        `(band ${lo}-${hi}) · grade=${result.grade} (expected ${expectation.grades.join('|')})`,
    );
    if (ok) pass++;
    else fail++;
  }
  console.log(`\nVerify · ${pass}/${FIXTURES.length} fixtures in-band${fail > 0 ? ` · ${fail} drift` : ''}`);
  if (fail > 0) {
    console.error('Server-side scoring drifted · do NOT run B3 Playwright until this passes.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('verify-e2e-scoring-simulation script failed:', err);
  process.exit(1);
});
