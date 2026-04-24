/**
 * V5 Canonical ExamInstance + 6 ExamModule seed runner.
 *
 * Thin upsert orchestration. All data lives in
 * src/data/canonical-v5-exam-data.ts (typed · CI-covered).
 *
 * Usage: npm run db:seed:canonical (from packages/server/)
 * Idempotent: upsert by deterministic id + composite (examInstanceId, moduleType).
 *
 * Ref: V5 Release Plan 2026-04-22 · Brief #4 · Gap 5 unblock
 */

import { PrismaClient } from '@prisma/client';

import {
  CANONICAL_EXAM_ID,
  canonicalExamInstanceFields,
  canonicalModulesByType,
  type CanonicalModuleType,
} from '../src/data/canonical-v5-exam-data.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding canonical V5 ExamInstance + 6 ExamModule...');

  const { id, seed, businessScenario, ...rest } = canonicalExamInstanceFields;
  // Analytics fields (usedCount/avgCompletionMins/avgCompositeScore/
  // discriminationScore/lastUsedAt/qualityReport) intentionally NOT set —
  // canonical re-runs must not overwrite live analytics on this row.
  const examInstance = await prisma.examInstance.upsert({
    where: { id },
    update: { businessScenario, ...rest },
    create: { id, seed, businessScenario, ...rest },
  });
  console.log(`✅ ExamInstance upserted · id: ${examInstance.id}`);

  const moduleTypes = Object.keys(canonicalModulesByType) as CanonicalModuleType[];
  await Promise.all(
    moduleTypes.map((moduleType) => {
      const moduleSpecific = canonicalModulesByType[moduleType];
      return prisma.examModule.upsert({
        where: {
          examInstanceId_moduleType: { examInstanceId: id, moduleType },
        },
        update: { moduleSpecific, version: 1 },
        create: {
          examInstanceId: id,
          moduleType,
          scenarioRef: `canonical/${moduleType.toLowerCase()}`,
          moduleSpecific,
          version: 1,
        },
      });
    }),
  );
  console.log(`✅ 6 ExamModule rows upserted (P0/MA/MB/MC/MD/SE)`);

  console.log('\n✅ Canonical ExamInstance seeded');
  console.log(`   id: ${examInstance.id}`);
  console.log(`   suite: full_stack`);
  console.log(`   businessScenario: 秒杀库存扣减系统 (TypeScript + Express · MySQL + Redis)`);
  console.log(`   level: senior · domain: ecommerce-flash-sale`);
  console.log('\nUse this examInstanceId when calling POST /admin/sessions/create');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
