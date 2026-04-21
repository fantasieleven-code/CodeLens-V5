/**
 * Task B-A10-lite — V5CandidateSelfView shared type + zod schema.
 *
 * 候选人自己可见的受限能力视图。Ethics floor 设计 · 刻意 omit:
 *  - grade / composite (防候选人 over-interpret 绝对分)
 *  - signal IDs / signal scores (防工程逆向 tuning · 防 signal gaming)
 *  - dimensionBreakdown 绝对分数 (只 relative 3 档)
 *  - dangerFlag · reasoning (admin-only insight)
 *  - evidenceSignals (candidate 看不到具体 signal 名)
 *
 * `.strict()` is a permanent ethics floor gate: any future contributor
 * adding grade/score/signals to self-view will fail the schema test.
 */

import { z } from 'zod';

export type CandidateDimensionStrength = 'strong' | 'medium' | 'weak';

export interface V5CandidateSelfView {
  sessionId: string;
  /** ISO 8601. */
  completedAt: string;

  capabilityProfiles: Array<{
    id: 'independent_delivery' | 'ai_collaboration' | 'system_thinking' | 'learning_agility';
    nameZh: string;
    nameEn: string;
    label: '自主' | '熟练' | '有潜力' | '待发展';
    description: string;
  }>;

  dimensionRadar: Array<{
    id:
      | 'technicalJudgment'
      | 'aiEngineering'
      | 'systemDesign'
      | 'codeQuality'
      | 'communication'
      | 'metacognition';
    nameZh: string;
    nameEn: string;
    relativeStrength: CandidateDimensionStrength;
  }>;
}

export const V5CandidateSelfViewSchema = z
  .object({
    sessionId: z.string(),
    completedAt: z.string(),
    capabilityProfiles: z.array(
      z
        .object({
          id: z.enum([
            'independent_delivery',
            'ai_collaboration',
            'system_thinking',
            'learning_agility',
          ]),
          nameZh: z.string(),
          nameEn: z.string(),
          label: z.enum(['自主', '熟练', '有潜力', '待发展']),
          description: z.string(),
        })
        .strict(),
    ),
    dimensionRadar: z.array(
      z
        .object({
          id: z.enum([
            'technicalJudgment',
            'aiEngineering',
            'systemDesign',
            'codeQuality',
            'communication',
            'metacognition',
          ]),
          nameZh: z.string(),
          nameEn: z.string(),
          relativeStrength: z.enum(['strong', 'medium', 'weak']),
        })
        .strict(),
    ),
  })
  .strict();
