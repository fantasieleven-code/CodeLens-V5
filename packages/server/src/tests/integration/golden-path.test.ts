/**
 * Task 17 — Golden Path E2E: fixture → scoreSession → grade.
 *
 * Loads each of the 4 Golden Path fixtures (Liam / Steve / Emma / Max),
 * runs the full pipeline via `scoreSession()`, and verifies that:
 *   1) grade falls in the expected bucket per archetype
 *   2) composite sits inside a target band
 *   3) every participating dimension has a score (none null, none NaN)
 *   4) capabilityProfiles are populated and in 0-100 range
 *   5) cursorBehaviorLabel is undefined (V5.1 backlog)
 *   6) monotonic ordering Liam > Steve > Emma > Max on composite
 *
 * Mocks:
 *   - langfuse (mirror signal-registry test pattern)
 *   - modelFactory + promptRegistry so MD LLM-whitelist signals hit fallback
 *     deterministically instead of calling a real model. MD is not a
 *     participating module in full_stack anyway (those signals return null
 *     via isParticipating()), but the mocks keep the import tree safe.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/langfuse.js', () => ({
  getLangfuse: async () => ({
    trace: vi.fn(),
    generation: vi.fn(),
    flush: async () => {},
  }),
}));

vi.mock('../../services/prompt-registry.service.js', () => ({
  promptRegistry: {
    get: vi.fn(async (key: string) => `[TEMPLATE ${key}]`),
  },
}));

vi.mock('../../services/model/index.js', () => ({
  modelFactory: {
    generate: vi.fn(async () => ({
      text: '{"score":0}',
      usage: { promptTokens: 0, completionTokens: 0 },
    })),
  },
}));

import {
  __resetDefaultRegistryForTests,
  scoreSession,
} from '../../services/scoring-orchestrator.service.js';
import { liamSGradeFixture } from '../fixtures/golden-path/liam-s-grade.js';
import { steveAGradeFixture } from '../fixtures/golden-path/steve-a-grade.js';
import { emmaBGradeFixture } from '../fixtures/golden-path/emma-b-grade.js';
import { maxDGradeFixture } from '../fixtures/golden-path/max-d-grade.js';
import { FIXTURE_EXPECTATIONS } from '../fixtures/golden-path/expectations.js';
import type { V5ScoringResult } from '@codelens-v5/shared';
import { V5_DIMENSIONS, V5_GRADE_ORDER } from '@codelens-v5/shared';

beforeEach(() => {
  __resetDefaultRegistryForTests();
});

const ALL_FIXTURES = [
  { name: 'liam', fixture: liamSGradeFixture, expectation: FIXTURE_EXPECTATIONS.liam },
  { name: 'steve', fixture: steveAGradeFixture, expectation: FIXTURE_EXPECTATIONS.steve },
  { name: 'emma', fixture: emmaBGradeFixture, expectation: FIXTURE_EXPECTATIONS.emma },
  { name: 'max', fixture: maxDGradeFixture, expectation: FIXTURE_EXPECTATIONS.max },
] as const;

describe('Golden Path — scoreSession end-to-end', () => {
  const results = new Map<string, V5ScoringResult>();

  for (const { name, fixture, expectation } of ALL_FIXTURES) {
    it(`${name}: produces expected V5ScoringResult shape`, async () => {
      const result = await scoreSession(fixture);
      results.set(name, result);

      expect(result.grade).toBeTruthy();
      expect(Number.isFinite(result.composite)).toBe(true);
      expect(result.dimensions).toBeDefined();
      expect(result.capabilityProfiles.length).toBeGreaterThan(0);
      expect(result.cursorBehaviorLabel).toBeUndefined();
      expect(result.confidence).toMatch(/^(high|medium|low)$/);
      expect(result.reasoning).toBeTruthy();
      expect(result.boundaryAnalysis).toBeDefined();
      // All 48 signals must show up in the output map (participating ones with a
      // value, non-participating ones as null/skipped).
      expect(Object.keys(result.signals).length).toBe(48);
    });

    it(`${name}: composite falls in target band ${expectation.compositeRange[0]}-${expectation.compositeRange[1]}`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);

      const [lo, hi] = expectation.compositeRange;
      expect(result.composite).toBeGreaterThanOrEqual(lo);
      expect(result.composite).toBeLessThanOrEqual(hi);
    });

    it(`${name}: grade is one of ${expectation.grades.join(' / ')}`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);
      expect(expectation.grades).toContain(result.grade);
    });

    it(`${name}: sCalibration falls in target band ${expectation.sCalibrationRange[0]}-${expectation.sCalibrationRange[1]}`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);

      const sc = result.signals.sCalibration;
      expect(sc, `${name}: sCalibration present`).toBeDefined();
      expect(sc?.value, `${name}: sCalibration numeric`).toEqual(expect.any(Number));

      const [lo, hi] = expectation.sCalibrationRange;
      expect(sc?.value).toBeGreaterThanOrEqual(lo);
      expect(sc?.value).toBeLessThanOrEqual(hi);
    });

    it(`${name}: every scored dimension is in 0-100 and all non-SD dimensions have a score`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);
      for (const dim of V5_DIMENSIONS) {
        const score = result.dimensions[dim];
        // full_stack has SD weight 0.05 but no MD module → SD signals are all
        // skipped, so SD dimension legitimately comes back null. Every other
        // dimension must score.
        if (dim === 'systemDesign') continue;
        expect(score).not.toBeNull();
        if (score != null) {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    });

    it(`${name}: capability profiles all score within 0-100 with valid labels`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);
      for (const profile of result.capabilityProfiles) {
        expect(profile.score).toBeGreaterThanOrEqual(0);
        expect(profile.score).toBeLessThanOrEqual(100);
        expect(profile.label).toBeTruthy();
        expect(profile.nameZh).toBeTruthy();
      }
    });

    it(`${name}: capability profile labels match Phase 3 calibration`, async () => {
      const result = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, result);
      for (const profile of result.capabilityProfiles) {
        const expectedLabel = expectation.capabilityLabels[profile.id];
        expect(expectedLabel).toBeTruthy();
        expect(profile.label).toBe(expectedLabel);
      }
    });
  }

  it('monotonic ordering: Liam > Steve > Emma > Max on composite', async () => {
    const order = ['liam', 'steve', 'emma', 'max'] as const;
    const composites: number[] = [];
    for (const n of order) {
      const r = results.get(n) ?? (await scoreSession(
        ALL_FIXTURES.find((f) => f.name === n)!.fixture,
      ));
      results.set(n, r);
      composites.push(r.composite);
    }

    for (let i = 0; i < composites.length - 1; i++) {
      expect(composites[i]).toBeGreaterThanOrEqual(composites[i + 1]);
    }
  });

  it('grade ordering respects V5_GRADE_ORDER', async () => {
    const gradeIndices: number[] = [];
    for (const { name, fixture } of ALL_FIXTURES) {
      const r = results.get(name) ?? (await scoreSession(fixture));
      results.set(name, r);
      gradeIndices.push(V5_GRADE_ORDER.indexOf(r.grade));
    }
    // Liam index >= Steve index >= Emma index >= Max index.
    for (let i = 0; i < gradeIndices.length - 1; i++) {
      expect(gradeIndices[i]).toBeGreaterThanOrEqual(gradeIndices[i + 1]);
    }
  });
});
