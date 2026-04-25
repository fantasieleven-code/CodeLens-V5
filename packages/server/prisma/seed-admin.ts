/**
 * Admin bootstrap seed — Brief #11 hotfix.
 *
 * Idempotent upsert of a default Organization + OWNER OrgMember whose
 * email/password are sourced from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
 *
 * Required so the B3 golden-path spec (and any local dev that touches the
 * admin UI) has a credentialed user to log in with. Prior gap: no existing
 * seed script created an admin user, and CI workflow's `npx playwright test`
 * default config never invoked the golden-path config — together leaving
 * Gate #2/#5 as paper sign-offs (Brief #10 §E E3 trigger).
 *
 * Behavior:
 *   ADMIN_PASSWORD unset/empty → log warning, exit 0 (local dev convenience;
 *   real environments must set the env var). NODE_ENV=production already
 *   enforced via env.ts on server boot, so this seed never silently no-ops
 *   prod.
 *
 * Idempotency: organization upserted by fixed id; member upserted by the
 * `(orgId, email)` unique key so re-runs after password rotation update the
 * hash in place.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_ORG_ID = 'org-default';
const DEFAULT_ORG_NAME = 'CodeLens Default';
const ADMIN_NAME = 'CodeLens Admin';
const BCRYPT_COST = 12;

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL ?? 'admin@codelens.dev';
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password.length === 0) {
    console.warn(
      '[seed-admin] ADMIN_PASSWORD unset · skipping admin bootstrap. ' +
        'Set ADMIN_PASSWORD in .env (or CI env) and re-run to create the admin user.',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  await prisma.organization.upsert({
    where: { id: DEFAULT_ORG_ID },
    create: { id: DEFAULT_ORG_ID, name: DEFAULT_ORG_NAME },
    update: {},
  });

  const member = await prisma.orgMember.upsert({
    where: { orgId_email: { orgId: DEFAULT_ORG_ID, email } },
    create: {
      orgId: DEFAULT_ORG_ID,
      email,
      name: ADMIN_NAME,
      passwordHash,
      role: 'OWNER',
    },
    update: { passwordHash, role: 'OWNER' },
  });

  console.log(
    `[seed-admin] OrgMember upserted · id=${member.id} · email=${email} · org=${DEFAULT_ORG_ID}`,
  );
}

main()
  .catch((err) => {
    console.error('[seed-admin] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
