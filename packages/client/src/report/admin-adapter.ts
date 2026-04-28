/**
 * Brief #18 D31 — admin V5AdminSessionReport → ReportViewModel adapter.
 *
 * Closes the V5.0 admin surface gap diagnosed in Brief #17 §A: the admin
 * session-detail page rendered only a 3-field summary stub (grade /
 * composite / reasoning) and linked to `/report/demo-...` (demo fixtures),
 * never showing the actual scored report inline.
 *
 * The two shapes are field-for-field compatible (per
 * `v5-admin-api.ts:170-194` → "Mirrors the Frontend ReportViewModel
 * field-for-field"). The only structural difference is `suite`:
 * `V5AdminSuite` is a Frontend-safe subset (`Omit<SuiteDefinition,
 * 'weightProfile' | 'dimensionFloors' | 'reportSections'>`-ish), while
 * the report sections need the full `SuiteDefinition`. We resolve via
 * the canonical `SUITES` lookup keyed by `suite.id`.
 *
 * `signalDefinitions` is structurally identical (both `Omit<SignalDefinition,
 * 'compute' | 'fallback'>`) — TS structural typing accepts it as-is, no
 * cast needed.
 */

import type { V5AdminSessionReport } from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import type { ReportViewModel } from './types.js';

export function adminReportToViewModel(
  report: V5AdminSessionReport,
): ReportViewModel {
  return {
    sessionId: report.sessionId,
    candidateName: report.candidateName,
    completedAt: report.completedAt,
    suite: SUITES[report.suite.id],
    participatingModules: report.participatingModules,
    gradeDecision: report.gradeDecision,
    capabilityProfiles: report.capabilityProfiles,
    dimensions: report.dimensions,
    signalResults: report.signalResults,
    signalDefinitions: report.signalDefinitions,
    submissions: report.submissions,
    cursorBehaviorLabel: report.cursorBehaviorLabel,
  };
}
