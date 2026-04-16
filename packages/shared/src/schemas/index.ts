import { z } from 'zod';

export const sessionCreateSchema = z.object({
  candidateId: z.string().uuid(),
  templateId: z.string().uuid(),
  durationMinutes: z.number().int().min(30).max(120).default(80),
});

export const candidateCreateSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export const aiMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  role: z.enum(['interviewer', 'assistant', 'scoring', 'probing']).optional(),
});

export const signalBatchSchema = z.object({
  signals: z.array(
    z.object({
      type: z.string(),
      value: z.number(),
      context: z.record(z.unknown()).optional(),
    }),
  ).min(1).max(100),
});

export const fileSaveSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1_000_000),
});

export const ptyInputSchema = z.object({
  input: z.string().max(10000),
});

export const ptyResizeSchema = z.object({
  cols: z.number().int().min(1).max(500),
  rows: z.number().int().min(1).max(200),
});
