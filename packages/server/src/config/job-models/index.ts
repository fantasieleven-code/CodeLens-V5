/**
 * Job Model Loader
 * Reads YAML job model files and provides typed access.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'yaml';
import type { JobModel } from '../../services/exam-generator.service.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadYaml(filename: string): JobModel {
  const raw = readFileSync(join(__dirname, filename), 'utf-8');
  const data = parse(raw);
  return {
    role: data.role,
    level: data.level,
    codeSize: {
      lines: data.code_size.lines,
      files: data.code_size.files,
      minDepth: data.code_size.min_depth || 3,
    },
    techStacks: data.tech_stacks.map((ts: any) => ({
      language: ts.language,
      framework: ts.framework,
      testRunner: ts.test_runner,
    })),
    businessDomains: data.business_domains,
    bugPool: data.bug_pool.map((b: any) => ({
      type: b.type,
      difficulty: b.difficulty,
      description: b.description,
      surfaceFix: b.surface_fix || '',
      rootFix: b.root_fix || '',
      affectedFiles: b.affected_files || 1,
      aiBlindSpot: b.ai_blind_spot || '',
      fixDepth: b.fix_depth || 'single_file',
    })),
    featurePool: data.feature_pool.map((f: any) => ({
      type: f.type,
      example: f.example,
      reusableCode: f.reusable_code || '',
      sideEffects: f.side_effects || [],
      hiddenDependency: f.hidden_dependency || '',
      forcedAiTask: f.forced_ai_task || '',
    })),
    architectureQuestions: data.architecture_questions,
    sandboxImage: data.sandbox_image,
    openTaskPool: (data.open_task_pool || []).map((t: any) => ({
      type: t.type,
      difficulty: t.difficulty,
      description: t.description,
    })),
    issueConfig: data.issue_config || undefined,
  };
}

export const JOB_MODELS: Record<string, JobModel> = {
  backend_mid: loadYaml('backend_mid.yaml'),
  campus_backend_mid: loadYaml('campus_backend_mid.yaml'),
  frontend_mid: loadYaml('frontend_mid.yaml'),
  devops_mid: loadYaml('devops_mid.yaml'),
  test_dev_mid: loadYaml('test_dev_mid.yaml'),
};

export function getJobModel(key: string): JobModel | undefined {
  return JOB_MODELS[key];
}
