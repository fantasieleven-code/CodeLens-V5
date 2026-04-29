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

  getMAData(examInstanceId: string): Promise<MAModuleSpecific | null> {
    return this.getModuleData('MA', examInstanceId);
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

  getSEData(examInstanceId: string): Promise<SEModuleSpecific | null> {
    return this.getModuleData('SE', examInstanceId);
  }

  getMCData(examInstanceId: string): Promise<MCModuleSpecific | null> {
    return this.getModuleData('MC', examInstanceId);
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
