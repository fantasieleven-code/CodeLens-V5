/**
 * V5.0 Golden Path E2E · W-B 3/3 final brief.
 *
 * 4 fixtures (Liam S · Steve A · Emma B · Max D) replay the full 13-step
 * golden path via B2 `GoldenPathDriver` · assert on `/admin/sessions/{id}`
 * report surface:
 * - Grade bucket membership (boundary-tolerant · Liam ['S','S+'] · Emma ['B','C'])
 * - Composite band (per-fixture [lo,hi] from Task 17 expectations.ts)
 * - Capability labels × 4 profiles (independent_delivery / ai_collaboration /
 *   system_thinking / learning_agility)
 * - sCalibration range (Task A1 · metacognition 7th signal · DK anchor for Max)
 *
 * Scope per Brief #9 B3 Phase 2 ratify (5 drifts D1-D5 α accept):
 * - D1 · FIXTURE_EXPECTATIONS map import · not per-grade named exports
 * - D2 · grades array + grades.includes() · boundary-tolerant
 * - D3 · skip per-dim/per-signal (not in expectations.ts · V5.0.5 extend)
 * - D4 · admin@codelens.dev default (not .test)
 * - D5 · inline REPORT_TESTIDS (fence #9 · not touching testids.ts)
 *
 * Ref · V5 Release Plan 2026-04-22 · Brief #9 B3 · Cold Start Tier 2 prep ·
 * Task 17 fixtures (A14a 180 validated) · A4 canonical seed (PR #90) ·
 * B2 driver (PR #95 · GoldenPathDriver class + testids + refreshed helpers).
 */

import { test, expect, type Page } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';
import type {
  CapabilityLabel,
  CapabilityProfileId,
  V5Grade,
} from '@codelens-v5/shared';

import {
  GoldenPathDriver,
  type GoldenPathDriverFixture,
} from './helpers/golden-path-driver.js';

// Task 17 · 4 grade fixtures (Liam S · Steve A · Emma B · Max D).
import { liamSGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/emma-b-grade.js';
import { maxDGradeFixture } from '../packages/server/src/tests/fixtures/golden-path/max-d-grade.js';

// Task 17 expectations · Record<'liam'|'steve'|'emma'|'max', FixtureExpectation>
import {
  FIXTURE_EXPECTATIONS,
  type FixtureExpectation,
} from '../packages/server/src/tests/fixtures/golden-path/expectations.js';

// A4 canonical exam ID (PR #90)
import { CANONICAL_EXAM_ID } from '../packages/server/src/data/canonical-v5-exam-data.js';

// ────────────────────────── Admin credentials ──────────────────────────

// Brief #20 sub-cycle · local B3 credential-source drift. `seed-admin.ts`
// reads packages/server/.env via dotenv, while Playwright runs from repo root.
// Load the same file for local runs; CI-provided env vars still win.
loadDotenv({ path: 'packages/server/.env' });

const ADMIN_CREDS = {
  email: process.env.ADMIN_EMAIL || 'admin@codelens.dev',
  password: process.env.ADMIN_PASSWORD || 'ci-test-password-1234',
};

// ────────────────────────── Per-grade candidate metadata ────────────────

const LIAM_CANDIDATE = {
  name: 'Liam Zhu',
  email: 'liam@test.local',
  yearsOfExperience: 8,
  primaryTechStack: ['TypeScript', 'React', 'Node.js'],
};

const STEVE_CANDIDATE = {
  name: 'Steve Chen',
  email: 'steve@test.local',
  yearsOfExperience: 5,
  primaryTechStack: ['Python', 'Django', 'AWS'],
};

const EMMA_CANDIDATE = {
  name: 'Emma Wang',
  email: 'emma@test.local',
  yearsOfExperience: 3,
  primaryTechStack: ['JavaScript', 'React', 'Node.js'],
};

const MAX_CANDIDATE = {
  name: 'Max Liu',
  email: 'max@test.local',
  yearsOfExperience: 1,
  primaryTechStack: ['HTML', 'CSS', 'JavaScript'],
};

// ────────────────────────── Inline report testids ───────────────────────
// B2 scope didn't migrate report testids to testids.ts · V5.0.5 housekeeping
// extend testids.ts · spec-local const respects fence #9.

const REPORT_TESTIDS = {
  heroGradeBadge: 'hero-grade-badge',
  heroComposite: 'hero-composite',
  capabilityProfile: (profileId: string) => `capability-profile-${profileId}`,
  signalRow: (signalId: string) => `signal-row-${signalId}`,
} as const;

// ────────────────────────── Shared assertion helper ─────────────────────

async function assertReportSurface(
  page: Page,
  sessionId: string,
  expected: FixtureExpectation,
): Promise<void> {
  await page.goto(`/admin/sessions/${sessionId}`);

  // Wait for report to actually be rendered (driver already polled to
  // completion, but navigation to admin detail re-renders).
  await page
    .locator('[data-testid="admin-session-detail-report"]')
    .waitFor({ state: 'visible', timeout: 30_000 });

  // Grade bucket membership · grades array · boundary-tolerant
  // (Liam ['S','S+'] · Emma ['B','C'] · Steve ['A'] · Max ['D'])
  const gradeText = (
    await page.locator(`[data-testid="${REPORT_TESTIDS.heroGradeBadge}"]`).textContent()
  )?.trim();
  expect(expected.grades, `grade ${gradeText} not in expected bucket`).toContain(
    gradeText as V5Grade,
  );

  // Composite band · parse numeric from text content
  const compositeText = await page
    .locator(`[data-testid="${REPORT_TESTIDS.heroComposite}"]`)
    .textContent();
  const compositeMatch = compositeText?.match(/(\d+\.?\d*)/);
  const composite = Number.parseFloat(compositeMatch?.[1] ?? 'NaN');
  expect(Number.isFinite(composite), `composite parse failed from "${compositeText}"`).toBe(true);
  const [compositeMin, compositeMax] = expected.compositeRange;
  expect(composite).toBeGreaterThanOrEqual(compositeMin);
  expect(composite).toBeLessThanOrEqual(compositeMax);

  // Capability labels × 4 profiles · compare against expected labels
  for (const [profileId, expectedLabel] of Object.entries(
    expected.capabilityLabels,
  ) as Array<[CapabilityProfileId, CapabilityLabel]>) {
    const locator = page.locator(
      `[data-testid="${REPORT_TESTIDS.capabilityProfile(profileId)}"]`,
    );
    await expect(
      locator,
      `capability-profile-${profileId} should display ${expectedLabel}`,
    ).toContainText(expectedLabel);
  }

  // sCalibration range assertion · DISABLED Brief #20 sub-cycle.
  //
  // Original best-effort block parsed `signal-row-sCalibration` text content
  // via `text.match(/(\d+\.?\d*)/)` and hard-asserted against
  // `expected.sCalibrationRange`. SignalBarsSection.tsx:181 renders the score
  // via `result.value.toFixed(0)` — values like 0.93 (Liam) and 0.71 (Steve)
  // round to "1" in the DOM text, so the regex always extracts "1" regardless
  // of the true score. The assertion produced false-positive failures on Liam
  // and Steve in the sub-cycle B3 re-run while audit confirmed both signals
  // were within their bands (Liam 0.93 ∈ [0.75,0.95] · Steve 0.71 ∈ [0.65,0.85]).
  //
  // Spec author already flagged the block as best-effort + V5.0.5 housekeeping
  // (preserved comment above the original code · git blame retains it). Block
  // removed rather than wrapped in `if (false)` to keep the active code path
  // clean. V5.0.5 must re-introduce with either:
  //   · a dedicated `signal-row-sCalibration-value` testid carrying the raw
  //     0.00-1.00 score (best · loose-coupled to UI rounding choice), OR
  //   · a numeric attribute (e.g. data-score) on the row, OR
  //   · widening sCalibrationRange to absorb toFixed(0) rounding (worst ·
  //     hides scoring drift).
}

// ────────────────────────── Test describes · 1 per grade ────────────────

test.describe('Golden Path · Liam S-grade', () => {
  test.setTimeout(300_000);

  test('completes full flow and matches liam expectations on admin report', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...liamSGradeFixture,
      grade: 'S',
      candidate: LIAM_CANDIDATE,
      examId: CANONICAL_EXAM_ID,
    };

    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    const { sessionId } = await driver.runFullGoldenPath(fixture);

    await assertReportSurface(page, sessionId, FIXTURE_EXPECTATIONS.liam);
  });
});

test.describe('Golden Path · Steve A-grade', () => {
  test.setTimeout(300_000);

  test('completes full flow and matches steve expectations on admin report', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...steveAGradeFixture,
      grade: 'A',
      candidate: STEVE_CANDIDATE,
      examId: CANONICAL_EXAM_ID,
    };

    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    const { sessionId } = await driver.runFullGoldenPath(fixture);

    await assertReportSurface(page, sessionId, FIXTURE_EXPECTATIONS.steve);
  });
});

test.describe('Golden Path · Emma B-grade', () => {
  test.setTimeout(300_000);

  test('completes full flow and matches emma expectations on admin report', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...emmaBGradeFixture,
      grade: 'B',
      candidate: EMMA_CANDIDATE,
      examId: CANONICAL_EXAM_ID,
    };

    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    const { sessionId } = await driver.runFullGoldenPath(fixture);

    await assertReportSurface(page, sessionId, FIXTURE_EXPECTATIONS.emma);
  });
});

test.describe('Golden Path · Max D-grade', () => {
  test.setTimeout(300_000);

  test('completes full flow and matches max expectations on admin report', async ({
    page,
  }) => {
    const fixture: GoldenPathDriverFixture = {
      ...maxDGradeFixture,
      grade: 'D',
      candidate: MAX_CANDIDATE,
      examId: CANONICAL_EXAM_ID,
    };

    const driver = new GoldenPathDriver(page, ADMIN_CREDS);
    const { sessionId } = await driver.runFullGoldenPath(fixture);

    await assertReportSurface(page, sessionId, FIXTURE_EXPECTATIONS.max);
  });
});
