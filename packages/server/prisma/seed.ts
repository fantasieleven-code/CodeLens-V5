/**
 * V5 seed.
 *
 * Seeds 17 v1 prompt placeholders (isActive=true) so downstream services can
 * resolve keys before Task 9/10/11/14 supply real content. Content is a TODO
 * marker; the version slot itself is what matters (callers fail closed when a
 * key has no row at all).
 *
 * Re-running this seed is idempotent: existing (name, v1) rows are skipped.
 *
 * See prisma/seed.v4-archived.ts for V4 seeding patterns reference.
 */
import { PrismaClient } from '@prisma/client';
import { V5_PROMPT_KEYS } from '../src/services/prompt-keys.js';

const prisma = new PrismaClient();
const PLACEHOLDER_CONTENT = 'TODO: Task 9-10 填充';

async function main() {
  let created = 0;
  let skipped = 0;
  for (const key of V5_PROMPT_KEYS) {
    const existing = await prisma.promptVersion.findUnique({
      where: { name_version: { name: key, version: 1 } },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.promptVersion.create({
      data: {
        name: key,
        version: 1,
        content: PLACEHOLDER_CONTENT,
        isActive: true,
        metadata: { placeholder: true, seededBy: 'task-7' },
      },
    });
    created += 1;
  }
  console.log(`[V5 seed] prompts: ${created} created, ${skipped} already present (total keys: ${V5_PROMPT_KEYS.length})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
