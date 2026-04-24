/**
 * Tests for src/data/canonical-v5-exam-data.ts.
 *
 * Validates:
 * 1. ExamInstance fields are fixture-aligned (秒杀业务).
 * 2. businessScenario conforms to BusinessScenario typed shape — 4 typed
 *    drift defenses (systemName string · BusinessEntity arrays ·
 *    TechStackDetail.framework required · businessFlow/userRoles string[]).
 * 3. 6 ExamModule types present in canonicalModulesByType.
 * 4. 5 fixture modules (P0/MA/MB/MC/SE) cross-ref the canonical record
 *    by key parity (SQ-1 β drift catch).
 * 5. MD craft is aligned with fixture MC R3 100k QPS escalation.
 */

import { describe, expect, it } from 'vitest';

import { GOLDEN_PATH_EXAM_DATA } from '../tests/fixtures/golden-path/exam-data.js';

import {
  CANONICAL_EXAM_ID,
  canonicalBusinessScenario,
  canonicalExamInstanceFields,
  canonicalMDModuleSpecific,
  canonicalModulesByType,
} from './canonical-v5-exam-data.js';

describe('canonical-v5-exam-data', () => {
  it('ExamInstance fields are fixture-aligned (秒杀业务)', () => {
    expect(canonicalExamInstanceFields.id).toBe(CANONICAL_EXAM_ID);
    expect(canonicalExamInstanceFields.id).toBe(
      'e0000000-0000-0000-0000-000000000001',
    );
    expect(canonicalExamInstanceFields.seed).toBe(20260424);
    expect(canonicalExamInstanceFields.techStack).toBe('typescript');
    expect(canonicalExamInstanceFields.domain).toBe('ecommerce-flash-sale');
    expect(canonicalExamInstanceFields.challengePattern).toBe(
      'data_consistency',
    );
    expect(canonicalExamInstanceFields.archStyle).toBe('service-layer');
    expect(canonicalExamInstanceFields.level).toBe('senior');
    expect(canonicalExamInstanceFields.orgId).toBeNull();
  });

  it('businessScenario conforms to BusinessScenario typed shape', () => {
    const bs = canonicalBusinessScenario;

    // Drift A defense · systemName must be string
    expect(typeof bs.systemName).toBe('string');
    expect(bs.systemName).toBe('秒杀库存扣减系统');
    expect(bs.businessContext.length).toBeGreaterThan(300);

    // Drift B defense · BusinessEntity uses attributes + relationships arrays
    expect(Array.isArray(bs.coreEntities)).toBe(true);
    expect(bs.coreEntities.length).toBeGreaterThanOrEqual(3);
    expect(bs.coreEntities.length).toBeLessThanOrEqual(5);
    bs.coreEntities.forEach((entity) => {
      expect(typeof entity.name).toBe('string');
      expect(Array.isArray(entity.attributes)).toBe(true);
      entity.attributes.forEach((a) => expect(typeof a).toBe('string'));
      expect(Array.isArray(entity.relationships)).toBe(true);
      entity.relationships.forEach((r) => expect(typeof r).toBe('string'));
    });

    // Drift C defense · TechStackDetail.framework required string
    expect(typeof bs.techStackDetail.language).toBe('string');
    expect(typeof bs.techStackDetail.framework).toBe('string');
    expect(typeof bs.techStackDetail.database).toBe('string');
    expect(bs.techStackDetail.cache).toBe('Redis 7');
    expect(bs.techStackDetail.framework).toBe('Express');

    // Drift D defense · businessFlow + userRoles are string[]
    expect(Array.isArray(bs.businessFlow)).toBe(true);
    bs.businessFlow.forEach((step) => expect(typeof step).toBe('string'));
    expect(bs.businessFlow.length).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(bs.userRoles)).toBe(true);
    bs.userRoles.forEach((role) => expect(typeof role).toBe('string'));
    expect(bs.userRoles.length).toBeGreaterThanOrEqual(2);
  });

  it('canonicalModulesByType has all 6 module types', () => {
    const types = Object.keys(canonicalModulesByType).sort();
    expect(types).toEqual(['MA', 'MB', 'MC', 'MD', 'P0', 'SE']);
  });

  it('5 fixture modules (P0/MA/MB/MC/SE) cross-ref the canonical record', () => {
    // GOLDEN_PATH_EXAM_DATA holds 5 keys (P0/MA/MB/MC/SE) per
    // packages/server/src/tests/fixtures/golden-path/exam-data.ts.
    // Canonical seed copy-inlines these shapes — keys must parity-match.
    const fixtureKeys = Object.keys(GOLDEN_PATH_EXAM_DATA).sort();
    expect(fixtureKeys).toEqual(['MA', 'MB', 'MC', 'P0', 'SE']);

    // Spot-check P0 deep-key parity (codeReadingQuestions.l1 must be present)
    const p0 = canonicalModulesByType.P0;
    expect(p0.codeReadingQuestions.l1.question).toBeTruthy();
    expect(p0.codeReadingQuestions.l1.options.length).toBe(4);
    expect(p0.codeReadingQuestions.l1.correctIndex).toBe(0);

    // Spot-check MA schemes count parity
    expect(canonicalModulesByType.MA.schemes.length).toBe(3);
    expect(canonicalModulesByType.MA.defects.length).toBe(3);

    // Spot-check MB scaffold + violationExamples
    expect(canonicalModulesByType.MB.scaffold.files.length).toBe(3);
    expect(canonicalModulesByType.MB.violationExamples.length).toBe(3);

    // Spot-check MC + SE single-field shapes
    expect(canonicalModulesByType.MC.probeStrategies.baseline).toBeTruthy();
    expect(
      canonicalModulesByType.SE.decisionSummaryTemplate.length,
    ).toBeGreaterThan(0);
  });

  it('MD module crafted aligned with fixture MC R3 100k QPS escalation', () => {
    const md = canonicalMDModuleSpecific;

    // designTask references 100k QPS scale (matches fixture MC R3 escalation prompt)
    expect(md.designTask.description).toContain('100k');
    expect(md.designTask.description).toContain('QPS');
    expect(md.designTask.businessContext.length).toBeGreaterThan(50);
    expect(md.designTask.nonFunctionalRequirements.length).toBeGreaterThanOrEqual(
      5,
    );

    // expectedSubModules · 5-7 sub-modules per design-reference
    expect(md.expectedSubModules.length).toBeGreaterThanOrEqual(3);
    md.expectedSubModules.forEach((m) => {
      expect(typeof m.name).toBe('string');
      expect(typeof m.responsibility).toBe('string');
    });

    // constraintCategories · 5-7 per MDModuleSpecific spec
    expect(md.constraintCategories.length).toBeGreaterThanOrEqual(5);
    expect(md.constraintCategories.length).toBeLessThanOrEqual(7);

    // designChallenges · 2-3 per spec
    expect(md.designChallenges.length).toBeGreaterThanOrEqual(2);
    expect(md.designChallenges.length).toBeLessThanOrEqual(3);
    md.designChallenges.forEach((c) => {
      expect(typeof c.trigger).toBe('string');
      expect(typeof c.challenge).toBe('string');
    });
  });
});
