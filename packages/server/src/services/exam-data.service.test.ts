import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExamDataService } from './exam-data.service.js';

type FindUniqueMock = ReturnType<typeof vi.fn>;

function buildMockPrisma(): {
  prisma: PrismaClient;
  examInstanceFindUnique: FindUniqueMock;
  examModuleFindUnique: FindUniqueMock;
} {
  const examInstanceFindUnique = vi.fn();
  const examModuleFindUnique = vi.fn();
  const prisma = {
    examInstance: { findUnique: examInstanceFindUnique },
    examModule: { findUnique: examModuleFindUnique },
  } as unknown as PrismaClient;
  return { prisma, examInstanceFindUnique, examModuleFindUnique };
}

const EXAM_ID = 'exam-123';

describe('ExamDataService.getBusinessScenario', () => {
  let service: ExamDataService;
  let findUnique: FindUniqueMock;

  beforeEach(() => {
    const m = buildMockPrisma();
    service = new ExamDataService(m.prisma);
    findUnique = m.examInstanceFindUnique;
  });

  it('returns the typed scenario when the instance exists', async () => {
    const scenario = {
      systemName: 'Payments Ledger',
      businessContext: 'A double-entry payment ledger used by merchants.',
      coreEntities: [],
      techStackDetail: { language: 'python', framework: 'fastapi', database: 'postgres' },
      businessFlow: ['authorize', 'capture'],
      userRoles: ['merchant'],
    };
    findUnique.mockResolvedValueOnce({ businessScenario: scenario });

    const result = await service.getBusinessScenario(EXAM_ID);

    expect(result).toEqual(scenario);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: EXAM_ID },
      select: { businessScenario: true },
    });
  });

  it('returns null when the instance is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await service.getBusinessScenario(EXAM_ID)).toBeNull();
  });
});

describe('ExamDataService module getters', () => {
  let service: ExamDataService;
  let findUnique: FindUniqueMock;

  beforeEach(() => {
    const m = buildMockPrisma();
    service = new ExamDataService(m.prisma);
    findUnique = m.examModuleFindUnique;
  });

  it.each([
    ['P0', 'getP0Data'],
    ['MA', 'getMAData'],
    ['MB', 'getMBData'],
    ['MD', 'getMDData'],
    ['SE', 'getSEData'],
    ['MC', 'getMCData'],
  ] as const)(
    'queries ExamModule by (examInstanceId, %s) and returns moduleSpecific',
    async (moduleType, method) => {
      const payload = { marker: `${moduleType}-payload` };
      findUnique.mockResolvedValueOnce({ moduleSpecific: payload });

      const result = await (service[method] as (id: string) => Promise<unknown>)(EXAM_ID);

      expect(result).toEqual(payload);
      expect(findUnique).toHaveBeenCalledWith({
        where: { examInstanceId_moduleType: { examInstanceId: EXAM_ID, moduleType } },
        select: { moduleSpecific: true },
      });
    },
  );

  it('returns null when the requested module row is missing', async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await service.getMBData(EXAM_ID)).toBeNull();
  });
});
