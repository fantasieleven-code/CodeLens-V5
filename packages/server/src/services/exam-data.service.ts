/**
 * ExamDataService — typed accessor for ExamModule.moduleSpecific + ExamInstance.businessScenario.
 *
 * 约定 (v5-design-reference.md P0-1):
 * - ExamModule 行按 (examInstanceId, moduleType) 唯一; moduleSpecific 存该模块的出题 JSON。
 * - 读取方调用对应 getXXData 拿 typed 结果; 行缺失返回 null。
 * - getBusinessScenario 从 ExamInstance.businessScenario 取,用于跨模块共享业务总纲。
 */

import type { PrismaClient } from '@prisma/client';
import type {
  BusinessScenario,
  CandidateModuleViewByType,
  MAModuleSpecific,
  MBCandidateView,
  MBModuleSpecific,
  MCModuleSpecific,
  MDModuleSpecific,
  ModuleSpecificByType,
  P0ModuleSpecific,
  SEModuleSpecific,
  V5ModuleType,
} from '@codelens-v5/shared';
import { prisma as defaultPrisma } from '../config/db.js';

/**
 * Brief #15 · strip MBModuleSpecific to its candidate-facing projection.
 *
 * Pure function (exported for unit testability) — no DB, no IO. Removes
 * groundTruth + instructor-only metadata, derives Monaco `language` from
 * file path extension. See `MBCandidateView` JSDoc for the strip rationale.
 */
export function stripMBToCandidateView(data: MBModuleSpecific): MBCandidateView {
  return {
    featureRequirement: {
      description: data.featureRequirement.description,
      acceptanceCriteria: [...data.featureRequirement.acceptanceCriteria],
    },
    scaffold: {
      files: data.scaffold.files.map((f) => ({
        path: f.path,
        content: f.content,
        language: languageFromPath(f.path),
      })),
      dependencyOrder: [...data.scaffold.dependencyOrder],
    },
    violationExamples: data.violationExamples.map((v) => ({
      exampleIndex: v.exampleIndex,
      code: v.code,
    })),
  };
}

export function stripP0ToCandidateView(data: P0ModuleSpecific): CandidateModuleViewByType['P0'] {
  return {
    systemCode: data.systemCode,
    codeReadingQuestions: {
      l1: {
        question: data.codeReadingQuestions.l1.question,
        options: [...data.codeReadingQuestions.l1.options],
      },
      l2: { question: data.codeReadingQuestions.l2.question },
      l3: { question: data.codeReadingQuestions.l3.question },
    },
    aiOutputJudgment: data.aiOutputJudgment.map((j) => ({
      codeA: j.codeA,
      codeB: j.codeB,
      context: j.context,
    })),
    decision: {
      scenario: data.decision.scenario,
      options: data.decision.options.map((o) => ({ ...o })),
    },
    aiClaimDetection: {
      code: data.aiClaimDetection.code,
      aiExplanation: data.aiClaimDetection.aiExplanation,
    },
  };
}

export function stripMAToCandidateView(data: MAModuleSpecific): CandidateModuleViewByType['MA'] {
  return {
    requirement: data.requirement,
    schemes: data.schemes.map((s) => ({
      ...s,
      pros: [...s.pros],
      cons: [...s.cons],
    })),
    counterArguments: Object.fromEntries(
      Object.entries(data.counterArguments).map(([k, v]) => [k, [...v]]),
    ),
    codeForReview: data.codeForReview,
    failureScenario: {
      successCode: data.failureScenario.successCode,
      failedCode: data.failureScenario.failedCode,
    },
    migrationScenario: { ...data.migrationScenario },
  };
}

export function stripMDToCandidateView(data: MDModuleSpecific): CandidateModuleViewByType['MD'] {
  return {
    designTask: {
      description: data.designTask.description,
      businessContext: data.designTask.businessContext,
      nonFunctionalRequirements: [...data.designTask.nonFunctionalRequirements],
    },
    constraintCategories: [...data.constraintCategories],
    designChallenges: data.designChallenges.map((c) => ({ ...c })),
  };
}

function languageFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'py':
      return 'python';
    case 'json':
      return 'json';
    case 'md':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

export class ExamDataService {
  constructor(private readonly prisma: PrismaClient) {}

  async getBusinessScenario(examInstanceId: string): Promise<BusinessScenario | null> {
    const row = await this.prisma.examInstance.findUnique({
      where: { id: examInstanceId },
      select: { businessScenario: true },
    });
    if (!row) return null;
    return row.businessScenario as unknown as BusinessScenario;
  }

  getP0Data(examInstanceId: string): Promise<P0ModuleSpecific | null> {
    return this.getModuleData('P0', examInstanceId);
  }

  async getP0DataCandidateSafe(
    examInstanceId: string,
  ): Promise<CandidateModuleViewByType['P0'] | null> {
    const data = await this.getP0Data(examInstanceId);
    return data ? stripP0ToCandidateView(data) : null;
  }

  getMAData(examInstanceId: string): Promise<MAModuleSpecific | null> {
    return this.getModuleData('MA', examInstanceId);
  }

  async getMADataCandidateSafe(
    examInstanceId: string,
  ): Promise<CandidateModuleViewByType['MA'] | null> {
    const data = await this.getMAData(examInstanceId);
    return data ? stripMAToCandidateView(data) : null;
  }

  getMBData(examInstanceId: string): Promise<MBModuleSpecific | null> {
    return this.getModuleData('MB', examInstanceId);
  }

  /** Brief #15 · candidate-facing MB projection (groundTruth-stripped). */
  async getMBDataCandidateSafe(examInstanceId: string): Promise<MBCandidateView | null> {
    const data = await this.getMBData(examInstanceId);
    return data ? stripMBToCandidateView(data) : null;
  }

  getMDData(examInstanceId: string): Promise<MDModuleSpecific | null> {
    return this.getModuleData('MD', examInstanceId);
  }

  async getMDDataCandidateSafe(
    examInstanceId: string,
  ): Promise<CandidateModuleViewByType['MD'] | null> {
    const data = await this.getMDData(examInstanceId);
    return data ? stripMDToCandidateView(data) : null;
  }

  getSEData(examInstanceId: string): Promise<SEModuleSpecific | null> {
    return this.getModuleData('SE', examInstanceId);
  }

  getSEDataCandidateSafe(examInstanceId: string): Promise<CandidateModuleViewByType['SE'] | null> {
    return this.getSEData(examInstanceId);
  }

  getMCData(examInstanceId: string): Promise<MCModuleSpecific | null> {
    return this.getModuleData('MC', examInstanceId);
  }

  getMCDataCandidateSafe(examInstanceId: string): Promise<CandidateModuleViewByType['MC'] | null> {
    return this.getMCData(examInstanceId);
  }

  private async getModuleData<T extends V5ModuleType>(
    moduleType: T,
    examInstanceId: string,
  ): Promise<ModuleSpecificByType[T] | null> {
    const row = await this.prisma.examModule.findUnique({
      where: { examInstanceId_moduleType: { examInstanceId, moduleType } },
      select: { moduleSpecific: true },
    });
    if (!row) return null;
    return row.moduleSpecific as unknown as ModuleSpecificByType[T];
  }
}

export const examDataService = new ExamDataService(defaultPrisma);
