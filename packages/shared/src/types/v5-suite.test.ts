import { describe, expect, it } from 'vitest';
import { V5Dimension, V5_DIMENSIONS, V5_GRADE_ORDER } from './v5-dimensions.js';
import { SUITES, SUITE_IDS, getSuite, isSuiteId } from './v5-suite.js';
import { isV5ModuleKey } from '../constants/module-keys.js';

describe('SUITES config invariants', () => {
  it('has exactly 5 suites', () => {
    expect(SUITE_IDS).toHaveLength(5);
    expect(Object.keys(SUITES)).toHaveLength(5);
  });

  it.each(SUITE_IDS)('suite "%s" has id matching its key', (id) => {
    expect(SUITES[id].id).toBe(id);
  });

  it.each(SUITE_IDS)('suite "%s" weightProfile covers all 6 dimensions', (id) => {
    const suite = SUITES[id];
    for (const dim of V5_DIMENSIONS) {
      expect(suite.weightProfile[dim]).toBeDefined();
      expect(typeof suite.weightProfile[dim]).toBe('number');
      expect(suite.weightProfile[dim]).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(SUITE_IDS)('suite "%s" weights sum to ~1.0', (id) => {
    const sum = Object.values(SUITES[id].weightProfile).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  it.each(SUITE_IDS)('suite "%s" modules use valid camelCase V5ModuleKey only', (id) => {
    for (const key of SUITES[id].modules) {
      expect(isV5ModuleKey(key), `module "${key}" invalid in suite "${id}"`).toBe(true);
      // Ensure fix 4: no lowercase `modulec` regression.
      expect(key as string).not.toBe('modulec');
    }
  });

  it.each(SUITE_IDS)('suite "%s" gradeCap is a known V5Grade', (id) => {
    expect(V5_GRADE_ORDER).toContain(SUITES[id].gradeCap);
  });

  it.each(SUITE_IDS)('suite "%s" dimensionFloors only reference valid dimensions', (id) => {
    const suite = SUITES[id];
    for (const [grade, floors] of Object.entries(suite.dimensionFloors)) {
      expect(V5_GRADE_ORDER).toContain(grade);
      for (const [dim, minScore] of Object.entries(floors ?? {})) {
        expect(V5_DIMENSIONS).toContain(dim as V5Dimension);
        expect(typeof minScore).toBe('number');
        expect(minScore).toBeGreaterThanOrEqual(0);
        expect(minScore).toBeLessThanOrEqual(100);
      }
    }
  });

  it.each(SUITE_IDS)('suite "%s" reportSections non-empty and all strings', (id) => {
    const sections = SUITES[id].reportSections;
    expect(sections.length).toBeGreaterThan(0);
    for (const s of sections) {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    }
  });

  it('ai_engineer doubles AI engineering weight vs full_stack', () => {
    expect(SUITES.ai_engineer.weightProfile[V5Dimension.AI_ENGINEERING]).toBeGreaterThan(
      SUITES.full_stack.weightProfile[V5Dimension.AI_ENGINEERING],
    );
  });

  it('quick_screen caps at A grade', () => {
    expect(SUITES.quick_screen.gradeCap).toBe('A');
  });

  it('architect includes moduleD and excludes mb', () => {
    expect(SUITES.architect.modules).toContain('moduleD');
    expect(SUITES.architect.modules).not.toContain('mb');
  });

  it('deep_dive includes both mb and moduleD', () => {
    expect(SUITES.deep_dive.modules).toContain('mb');
    expect(SUITES.deep_dive.modules).toContain('moduleD');
  });

  // Clarifications Part 3 adjustment 5: cursor-behavior-label only in suites with MB
  // and enough Cursor signal coverage. architect has no MB; quick_screen has MB but
  // insufficient signal coverage for a meaningful label.
  it('cursor-behavior-label appears in full_stack / ai_engineer / deep_dive', () => {
    expect(SUITES.full_stack.reportSections).toContain('cursor-behavior-label');
    expect(SUITES.ai_engineer.reportSections).toContain('cursor-behavior-label');
    expect(SUITES.deep_dive.reportSections).toContain('cursor-behavior-label');
  });

  it('cursor-behavior-label absent from architect and quick_screen', () => {
    expect(SUITES.architect.reportSections).not.toContain('cursor-behavior-label');
    expect(SUITES.quick_screen.reportSections).not.toContain('cursor-behavior-label');
  });

  // Round 3 Part 4 (Capability Profiles refactor): every suite's reportSections
  // must include 'capability-profiles', rendered right after 'hero' and before 'radar'.
  it.each(SUITE_IDS)('suite "%s" reportSections includes capability-profiles', (id) => {
    expect(SUITES[id].reportSections).toContain('capability-profiles');
  });

  it.each(SUITE_IDS)(
    'suite "%s" renders capability-profiles after hero and before radar',
    (id) => {
      const sections = SUITES[id].reportSections;
      const heroIdx = sections.indexOf('hero');
      const capIdx = sections.indexOf('capability-profiles');
      const radarIdx = sections.indexOf('radar');
      expect(heroIdx).toBeGreaterThanOrEqual(0);
      expect(capIdx).toBeGreaterThan(heroIdx);
      expect(radarIdx).toBeGreaterThan(capIdx);
    },
  );
});

describe('SUITES accessors', () => {
  it('isSuiteId narrows correctly', () => {
    for (const id of SUITE_IDS) expect(isSuiteId(id)).toBe(true);
    expect(isSuiteId('Full_Stack')).toBe(false);
    expect(isSuiteId('')).toBe(false);
    expect(isSuiteId(null)).toBe(false);
  });

  it('getSuite returns the definition', () => {
    expect(getSuite('full_stack').nameZh).toBe('全面评估');
  });
});
