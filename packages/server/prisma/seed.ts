/**
 * V5 seed placeholder.
 *
 * Minimal seed to satisfy CI contract (package.json prisma.seed).
 * Task 7 (Prompt Registry) will populate initial prompt data.
 * Task 19 (V5.0 exam library) will populate seed exam instances.
 *
 * See prisma/seed.v4-archived.ts for V4 seeding patterns reference.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[V5 seed] Placeholder — no data seeded. Task 7/19 will populate.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
