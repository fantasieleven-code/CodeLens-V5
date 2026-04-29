/** Brief #18 D31 · admin V5AdminSessionReport → ReportViewModel adapter. */

import { describe, expect, it } from 'vitest';
import { SUITES } from '@codelens-v5/shared';
import type { V5AdminSessionReport } from '@codelens-v5/shared';

import { adminReportToViewModel } from './admin-adapter.js';
import { aFullStackBoundaryFixture } from './__fixtures__/a-fullstack-boundary.js';

/**
 * Build a V5AdminSessionReport from an existing ReportViewModel fixture by
 * downgrading `suite` to its V5AdminSuite subset. This mirrors what the
 * server does in admin.ts when serializing the scoring result.
 */
function asAdminReport(vm: typeof aFullStackBoundaryFixture): V5AdminSessionReport {
  const { suite } = vm;
  return {
    sessionId: vm.sessionId,
    candidateName: vm.candidateName,
    completedAt: vm.completedAt,
    suite: {
      id: suite.id,
      nameZh: suite.nameZh,
      nameEn: suite.nameEn,
      estimatedMinutes: suite.estimatedMinutes,
      gradeCap: suite.gradeCap,
      modules: suite.modules,
    },
    participatingModules: vm.participatingModules,
    gradeDecision: vm.gradeDecision,
    capabilityProfiles: vm.capabilityProfiles,
    dimensions: vm.dimensions,
    signalResults: vm.signalResults,
    signalDefinitions: vm.signalDefinitions,
    submissions: vm.submissions,
    cursorBehaviorLabel: vm.cursorBehaviorLabel,
  };
}

describe('adminReportToViewModel', () => {
  it('resolves V5AdminSuite to canonical SuiteDefinition via SUITES', () => {
    const adminReport = asAdminReport(aFullStackBoundaryFixture);
    const vm = adminReportToViewModel(adminReport);

    expect(vm.suite).toBe(SUITES.full_stack);
    expect(vm.suite.weightProfile).toBeDefined();
    expect(vm.suite.dimensionFloors).toBeDefined();
    expect(vm.suite.reportSections).toBeDefined();
  });

  it('passes through scoring fields field-for-field', () => {
    const adminReport = asAdminReport(aFullStackBoundaryFixture);
    const vm = adminReportToViewModel(adminReport);

    expect(vm.sessionId).toBe(adminReport.sessionId);
    expect(vm.candidateName).toBe(adminReport.candidateName);
    expect(vm.completedAt).toBe(adminReport.completedAt);
    expect(vm.gradeDecision).toBe(adminReport.gradeDecision);
    expect(vm.capabilityProfiles).toBe(adminReport.capabilityProfiles);
    expect(vm.dimensions).toBe(adminReport.dimensions);
    expect(vm.signalResults).toBe(adminReport.signalResults);
    expect(vm.signalDefinitions).toBe(adminReport.signalDefinitions);
    expect(vm.submissions).toBe(adminReport.submissions);
    expect(vm.cursorBehaviorLabel).toBe(adminReport.cursorBehaviorLabel);
    expect(vm.participatingModules).toBe(adminReport.participatingModules);
  });
});
