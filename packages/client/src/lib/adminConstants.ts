/**
 * Admin constants — extracted from AdminDashboard.tsx L143-166
 * Uses tokens.ts colors instead of hardcoded hex values
 */

import { colors } from './tokens.js';

export const DIMENSION_LABELS: Record<string, string> = {
  V1: 'Code Understanding',
  V2: 'AI Verification',
  V3: 'Problem Solving',
  V4: 'Engineering Judgment',
  V5: 'Debugging',
};

export const TIER_COLORS: Record<string, string> = {
  P0: colors.green,
  P1: colors.blue,
  P2: colors.yellow,
  P3: colors.peach,
  P4: colors.red,
};

export const RISK_COLORS: Record<string, string> = {
  clean: colors.green,
  low_risk: colors.yellow,
  medium_risk: colors.peach,
  high_risk: colors.red,
};

export const STATUS_COLORS: Record<string, string> = {
  COMPLETED: colors.green,
  IN_PROGRESS: colors.yellow,
  CREATED: colors.blue,
  EXPIRED: colors.red,
};

export const TIER_LABELS: Record<string, string> = {
  P0: 'Expert',
  P1: 'Proficient',
  P2: 'Competent',
  P3: 'Developing',
  P4: 'Novice',
};
