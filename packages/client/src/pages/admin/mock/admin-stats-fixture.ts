import type { V5AdminStatsOverview } from '@codelens-v5/shared';
import { ADMIN_SESSIONS } from './admin-sessions-fixtures.js';

/**
 * Derive the dashboard stats snapshot from the mock sessions so the numbers
 * stay consistent with the sessions list (no manual drift).
 */
export function buildAdminStatsOverview(): V5AdminStatsOverview {
  const total = ADMIN_SESSIONS.length;
  const completed = ADMIN_SESSIONS.filter((s) => s.status === 'COMPLETED');
  const composites = completed
    .map((s) => s.composite)
    .filter((v): v is number => typeof v === 'number');
  const avgComposite =
    composites.length > 0
      ? Math.round(composites.reduce((a, b) => a + b, 0) / composites.length)
      : 0;

  const gradeDistribution = {
    D: 0,
    C: 0,
    B: 0,
    'B+': 0,
    A: 0,
    S: 0,
    'S+': 0,
  } as V5AdminStatsOverview['gradeDistribution'];
  for (const s of completed) {
    if (s.grade) gradeDistribution[s.grade] += 1;
  }

  const suiteDistribution = {
    full_stack: 0,
    architect: 0,
    ai_engineer: 0,
    quick_screen: 0,
    deep_dive: 0,
  } as V5AdminStatsOverview['suiteDistribution'];
  for (const s of ADMIN_SESSIONS) {
    suiteDistribution[s.suiteId] += 1;
  }

  return {
    totalSessions: total,
    completedSessions: completed.length,
    completionRate: total > 0 ? completed.length / total : 0,
    averageComposite: avgComposite,
    gradeDistribution,
    suiteDistribution,
  };
}
