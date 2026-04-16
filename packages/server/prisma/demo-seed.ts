/**
 * Demo data generator — `npm run demo`
 *
 * Creates a complete demo dataset for product demos:
 * - 1 Organization (Acme Corp, pro plan)
 * - 1 OrgMember (demo@codelens.dev / demo1234)
 * - 1 Candidate with completed session
 * - 5-dimension scoring results with realistic scores
 * - Integrity report (clean)
 *
 * Safe to run multiple times (cleans demo data first).
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_ORG_NAME = 'Acme Demo Corp';
const DEMO_EMAIL = 'demo@codelens.dev';
const DEMO_PASSWORD = 'demo1234';

async function seedDemo() {
  console.log('Seeding demo data...');

  // Clean previous demo data
  const existingOrg = await prisma.organization.findFirst({ where: { name: DEMO_ORG_NAME } });
  if (existingOrg) {
    // Delete sessions belonging to this org (cascade handles children)
    await prisma.session.deleteMany({ where: { orgId: existingOrg.id } });
    await prisma.candidate.deleteMany({ where: { orgId: existingOrg.id } });
    await prisma.orgMember.deleteMany({ where: { orgId: existingOrg.id } });
    await prisma.organization.delete({ where: { id: existingOrg.id } });
    console.log('Cleaned previous demo data');
  }

  // Get first template (assumes seed.ts has been run)
  const template = await prisma.template.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!template) {
    console.error('No template found. Run `npm run db:seed` first.');
    process.exit(1);
  }

  // 1. Create demo organization
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const org = await prisma.organization.create({
    data: {
      name: DEMO_ORG_NAME,
      plan: 'pro',
      interviewCount: 1,
      members: {
        create: {
          email: DEMO_EMAIL,
          name: 'Demo Admin',
          passwordHash,
          role: 'OWNER',
        },
      },
    },
  });
  console.log(`Organization: ${org.id} (${DEMO_ORG_NAME})`);
  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  // 2. Create demo candidate
  const candidate = await prisma.candidate.create({
    data: {
      name: 'Alice Zhang',
      email: 'alice.zhang@example.com',
      orgId: org.id,
      metadata: { source: 'demo', level: 'mid-senior' },
    },
  });

  // 3. Create completed session
  const now = new Date();
  const startedAt = new Date(now.getTime() - 70 * 60 * 1000); // 70min ago
  const session = await prisma.session.create({
    data: {
      candidateId: candidate.id,
      templateId: template.id,
      orgId: org.id,
      status: 'COMPLETED',
      currentCheckpoint: 4,
      startedAt,
      completedAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      metadata: { demo: true },
    },
  });

  // 4. Checkpoint results
  const checkpoints = [
    { index: 0, status: 'COMPLETED', data: { type: 'environment_familiarization' } },
    { index: 1, status: 'COMPLETED', data: {
      answers: [
        { question: 'What does OrderService.create_order() do?', answer: 'Creates an order by validating inventory, calculating price, and processing payment.' },
        { question: 'Why is the pricing_service using float arithmetic?', answer: 'This is likely a bug — float precision issues can cause incorrect totals.' },
      ],
    }},
    { index: 2, status: 'COMPLETED', data: {
      bugsFound: ['race_condition', 'float_precision'],
      testsRun: 8,
      testsPassed: 7,
    }},
    { index: 3, status: 'COMPLETED', data: {
      requirementsAdded: ['caching', 'retry_logic'],
      linesChanged: 45,
    }},
  ];

  for (const cp of checkpoints) {
    await prisma.checkpointResult.create({
      data: {
        sessionId: session.id,
        checkpointIndex: cp.index,
        status: cp.status,
        startedAt: new Date(startedAt.getTime() + cp.index * 15 * 60 * 1000),
        completedAt: new Date(startedAt.getTime() + (cp.index + 1) * 15 * 60 * 1000),
        data: cp.data,
      },
    });
  }

  // 5. Scoring results (realistic mid-senior scores)
  const dimensions = [
    { dimension: 'V1', score: 82, evidence: ['Correctly identified module dependencies', 'Explained OrderService flow accurately', 'Recognized pricing service float issue'] },
    { dimension: 'V2', score: 75, evidence: ['Found 2/2 planted bugs', 'Identified 1 hallucination correctly', 'Good AI interaction pattern — asked clarifying questions'] },
    { dimension: 'V3', score: 70, evidence: ['Added caching with TTL', 'Retry logic with exponential backoff', 'Code style consistent with existing codebase'] },
    { dimension: 'V4', score: 78, evidence: ['Discussed trade-offs of caching strategies', 'Considered distributed scenarios', 'Explained why eventual consistency was acceptable'] },
    { dimension: 'V5', score: 68, evidence: ['Systematic hypothesis-verification cycle', 'Used print debugging initially, then switched to breakpoints', 'Could narrow scope efficiently'] },
  ];

  for (const dim of dimensions) {
    await prisma.scoringResult.create({
      data: {
        sessionId: session.id,
        dimension: dim.dimension,
        score: dim.score,
        maxScore: 100,
        evidence: dim.evidence,
        aiRationale: `Candidate demonstrated ${dim.score >= 75 ? 'strong' : 'adequate'} ${dim.dimension} capabilities.`,
        data: {
          subScores: [
            { name: 'primary', score: dim.score * 0.7, maxScore: 70 },
            { name: 'secondary', score: dim.score * 0.3, maxScore: 30 },
          ],
        },
      },
    });
  }

  // 6. Integrity report (clean)
  await prisma.integrityReport.create({
    data: {
      sessionId: session.id,
      flags: [],
      score: 95,
      details: {
        riskLevel: 'clean',
        confidence: 0.92,
        analyses: {
          responseTime: { flag: false, detail: 'Normal response patterns' },
          typingPattern: { flag: false, detail: 'Consistent typing rhythm' },
          pasteFrequency: { flag: false, detail: '2 paste events (within normal range)' },
          tabSwitching: { flag: false, detail: '1 tab switch (normal)' },
        },
      },
    },
  });

  // 7. Some behavior signals
  const signalTypes = ['FILE_SWITCH', 'EDIT_BURST', 'TERMINAL_COMMAND', 'AI_QUERY'];
  for (let i = 0; i < 20; i++) {
    await prisma.behaviorSignal.create({
      data: {
        sessionId: session.id,
        signalType: signalTypes[i % signalTypes.length],
        value: Math.random() * 10,
        timestamp: new Date(startedAt.getTime() + i * 3 * 60 * 1000),
        context: { checkpoint: Math.min(3, Math.floor(i / 5)) },
      },
    });
  }

  console.log(`\nDemo data ready!`);
  console.log(`Session: ${session.id}`);
  console.log(`Candidate: ${candidate.name} (${candidate.email})`);
  console.log(`\nAdmin login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Admin URL: http://localhost:5173/admin`);
}

seedDemo()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
