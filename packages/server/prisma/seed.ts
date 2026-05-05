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
import {
  LIVE_PRODUCTION_PROMPT_VERSION,
  LIVE_PRODUCTION_PROMPTS,
} from '../src/services/production-prompts.js';

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

  let activated = 0;
  for (const prompt of LIVE_PRODUCTION_PROMPTS) {
    await prisma.promptVersion.upsert({
      where: {
        name_version: {
          name: prompt.key,
          version: LIVE_PRODUCTION_PROMPT_VERSION,
        },
      },
      create: {
        name: prompt.key,
        version: LIVE_PRODUCTION_PROMPT_VERSION,
        content: prompt.content,
        isActive: true,
        metadata: prompt.metadata,
      },
      update: {
        content: prompt.content,
        isActive: true,
        metadata: prompt.metadata,
      },
    });
    await prisma.promptVersion.updateMany({
      where: {
        name: prompt.key,
        isActive: true,
        version: { not: LIVE_PRODUCTION_PROMPT_VERSION },
      },
      data: { isActive: false },
    });
    activated += 1;
  }

  console.log(
    `[V5 seed] prompts: ${created} placeholder v1 created, ${skipped} placeholder v1 already present, ${activated} live v2 active (total keys: ${V5_PROMPT_KEYS.length})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
