/**
 * V5 seed.
 *
 * Seeds 18 v1 prompt placeholders (isActive=true) so the registry has a
 * durable slot for every known key before real content lands. PromptRegistry
 * treats rows marked `metadata.placeholder=true` or seeded TODO content as
 * unavailable, so production callers fail closed to their explicit fallback
 * paths instead of sending TODO text to a model.
 *
 * Re-running this seed is idempotent: existing (name, v1) rows are skipped.
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
