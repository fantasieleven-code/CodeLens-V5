/**
 * Task B-A12 Commit 1 — CandidateProfile zod schema + type-level tests.
 *
 * 6 tests:
 *   1. happy path
 *   2. yearsOfExperience out-of-range rejected
 *   3. primaryTechStack size boundary (2-5 items)
 *   4. enum rejection
 *   5. submit partial-body semantics (profile-only / consent-only / empty)
 *   6. type-level: inferred submit request has optional profile/consent
 */

import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CandidateProfileSchema,
  CandidateProfileSubmitRequestSchema,
} from './candidate-profile.js';
import type {
  CandidateProfile,
  CandidateProfileSubmitRequest,
} from './candidate-profile.js';

const validProfile: CandidateProfile = {
  yearsOfExperience: 5,
  currentRole: 'backend',
  primaryTechStack: ['typescript', 'node'],
  companySize: 'medium',
  aiToolYears: 2,
  primaryAiTool: 'claude_code',
  dailyAiUsageHours: '3_6',
};

describe('CandidateProfileSchema', () => {
  it('accepts a valid 7-field profile', () => {
    const parsed = CandidateProfileSchema.safeParse(validProfile);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(validProfile);
    }
  });

  it('rejects yearsOfExperience outside 0-50 integer range', () => {
    const negative = CandidateProfileSchema.safeParse({
      ...validProfile,
      yearsOfExperience: -1,
    });
    expect(negative.success).toBe(false);
    if (!negative.success) {
      expect(
        negative.error.issues.some((i) => i.path[0] === 'yearsOfExperience'),
      ).toBe(true);
    }

    const tooLarge = CandidateProfileSchema.safeParse({
      ...validProfile,
      yearsOfExperience: 51,
    });
    expect(tooLarge.success).toBe(false);

    const fractional = CandidateProfileSchema.safeParse({
      ...validProfile,
      yearsOfExperience: 3.5,
    });
    expect(fractional.success).toBe(false);
  });

  it('enforces primaryTechStack 2-5 item boundary with non-empty entries', () => {
    // 1 item: below min
    expect(
      CandidateProfileSchema.safeParse({ ...validProfile, primaryTechStack: ['ts'] })
        .success,
    ).toBe(false);

    // 6 items: above max
    expect(
      CandidateProfileSchema.safeParse({
        ...validProfile,
        primaryTechStack: ['a', 'b', 'c', 'd', 'e', 'f'],
      }).success,
    ).toBe(false);

    // 2 items: inside band
    expect(
      CandidateProfileSchema.safeParse({
        ...validProfile,
        primaryTechStack: ['ts', 'node'],
      }).success,
    ).toBe(true);

    // 5 items: inside band
    expect(
      CandidateProfileSchema.safeParse({
        ...validProfile,
        primaryTechStack: ['ts', 'node', 'react', 'postgres', 'redis'],
      }).success,
    ).toBe(true);

    // empty-string entry: fails per-item min(1)
    expect(
      CandidateProfileSchema.safeParse({
        ...validProfile,
        primaryTechStack: ['ts', ''],
      }).success,
    ).toBe(false);
  });

  it('rejects invalid enum values across all 5 enum fields', () => {
    const invalidRole = CandidateProfileSchema.safeParse({
      ...validProfile,
      currentRole: 'designer',
    });
    expect(invalidRole.success).toBe(false);

    const invalidCompanySize = CandidateProfileSchema.safeParse({
      ...validProfile,
      companySize: 'mega',
    });
    expect(invalidCompanySize.success).toBe(false);

    const invalidAiYears = CandidateProfileSchema.safeParse({
      ...validProfile,
      aiToolYears: 4,
    });
    expect(invalidAiYears.success).toBe(false);

    const invalidAiTool = CandidateProfileSchema.safeParse({
      ...validProfile,
      primaryAiTool: 'windsurf',
    });
    expect(invalidAiTool.success).toBe(false);

    const invalidUsage = CandidateProfileSchema.safeParse({
      ...validProfile,
      dailyAiUsageHours: '10_plus',
    });
    expect(invalidUsage.success).toBe(false);
  });
});

describe('CandidateProfileSubmitRequestSchema', () => {
  it('accepts partial bodies (profile-only, consent-only, both) and rejects empty', () => {
    // profile only
    const profileOnly = CandidateProfileSubmitRequestSchema.safeParse({
      profile: validProfile,
    });
    expect(profileOnly.success).toBe(true);

    // consent only
    const consentOnly = CandidateProfileSubmitRequestSchema.safeParse({
      consentAccepted: true,
    });
    expect(consentOnly.success).toBe(true);

    // both
    const both = CandidateProfileSubmitRequestSchema.safeParse({
      profile: validProfile,
      consentAccepted: true,
    });
    expect(both.success).toBe(true);

    // empty → refine fails
    const empty = CandidateProfileSubmitRequestSchema.safeParse({});
    expect(empty.success).toBe(false);
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toContain(
        'At least one of profile or consentAccepted',
      );
    }
  });
});

describe('CandidateProfileSubmitRequest type-level shape', () => {
  it('infers profile and consentAccepted as optional', () => {
    expectTypeOf<CandidateProfileSubmitRequest>()
      .toHaveProperty('profile')
      .toEqualTypeOf<CandidateProfile | undefined>();
    expectTypeOf<CandidateProfileSubmitRequest>()
      .toHaveProperty('consentAccepted')
      .toEqualTypeOf<boolean | undefined>();
  });
});
