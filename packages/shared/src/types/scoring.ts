export type ScoringDimension = 'V1' | 'V2' | 'V3' | 'V4' | 'V5';

export type SeniorityLevel = 'L1' | 'L2' | 'L3' | 'L4';

export interface ScoringResult {
  id: string;
  sessionId: string;
  dimension: ScoringDimension;
  score: number;
  maxScore: number;
  evidence: string[];
  aiRationale: string;
  createdAt: Date;
}

export interface ScoringWeightProfile {
  id: string;
  name: string;
  isDefault: boolean;
  weights: Record<ScoringDimension, number>;
  thresholds: Record<SeniorityLevel, number>;
}

export interface CheckpointResult {
  id: string;
  sessionId: string;
  checkpointIndex: number;
  startedAt: Date;
  completedAt: Date | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';
  data: Record<string, unknown>;
}

export const DEFAULT_WEIGHTS: Record<ScoringDimension, number> = {
  V1: 0.30,
  V2: 0.25,
  V3: 0.20,
  V4: 0.15,
  V5: 0.10,
};

export const SENIORITY_THRESHOLDS: Record<SeniorityLevel, number> = {
  L1: 25,
  L2: 50,
  L3: 75,
  L4: 90,
};
