import { z } from 'zod';

// ─── Template Create Schema ───

export const TemplateFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  isHidden: z.boolean().default(false),
});

export const PlantedBugSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  file: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  severity: z.enum(['low', 'medium', 'high']),
  hints: z.preprocess(
    (v) => (typeof v === 'string' ? JSON.parse(v) : v),
    z.array(z.string()).default([]),
  ),
  solution: z.string().default(''),
});

export const CheckpointConfigSchema = z.object({
  checkpointIndex: z.number().int().min(1).max(4),
  title: z.string().min(1),
  description: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  instructions: z.record(z.string()),
  criteria: z.preprocess(
    (v) => (typeof v === 'string' ? JSON.parse(v) : v),
    z.array(z.string()),
  ),
});

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().default(''),
  language: z.enum(['python', 'javascript', 'typescript', 'java', 'go']),
  metadata: z.record(z.unknown()).default({}),
  files: z.array(TemplateFileSchema).min(1),
  plantedBugs: z
    .array(PlantedBugSchema)
    .optional(),
  checkpointConfigs: z
    .array(CheckpointConfigSchema)
    .optional(),
});

export type TemplateCreateInput = z.infer<typeof TemplateCreateSchema>;

// ─── Hidden Test Result ───

export interface HiddenTestResult {
  testName: string;
  passed: boolean;
  error?: string;
  duration: number;
}
