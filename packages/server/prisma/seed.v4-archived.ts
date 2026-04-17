/**
 * ARCHIVED V4 SEED SCRIPT
 *
 * This file is NOT executed by Prisma. It's preserved as a reference
 * for Task 7 (Prompt Registry) and Task 19 (V5.0 exam library generation)
 * to crib V4's seeding patterns (deleteMany ordering, dependency handling).
 *
 * V5 schema no longer has: checkpointConfig / followupTemplate /
 * goldenAnswer / plantedBug / plantedHallucination / scoringWeightProfile /
 * template / templateFile. Only promptVersion remains.
 *
 * Task 7 owner: replace prisma/seed.ts (the active one) with real V5 seed.
 * This archive can be deleted once V5 seed is complete.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PROBING_LIBRARY } from '../src/lib/probing-library.js';
import { HALLUCINATION_LIBRARY } from '../src/lib/hallucination-library.js';

const prisma = new PrismaClient();

const PILOT_DIR = join(process.cwd(), '..', '..', '..', 'pilot-template');

function readPilotFile(filename: string): string {
  const path = join(PILOT_DIR, filename);
  if (!existsSync(path)) {
    console.warn(`Pilot file not found: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf-8');
}

async function seed() {
  console.log('Seeding database...');

  // Clean existing data
  await prisma.followupTemplate.deleteMany();
  await prisma.checkpointConfig.deleteMany();
  await prisma.plantedHallucination.deleteMany();
  await prisma.plantedBug.deleteMany();
  await prisma.templateFile.deleteMany();
  await prisma.template.deleteMany();
  await prisma.scoringWeightProfile.deleteMany();

  // Create pilot template
  const template = await prisma.template.create({
    data: {
      name: 'Order Processing Service',
      description: 'E-commerce order processing service with planted bugs for technical assessment',
      language: 'python',
      metadata: {
        duration: 70,
        checkpoints: 4,
        difficulty: 'mid-senior',
      },
    },
  });

  console.log(`Template created: ${template.id}`);

  // Template files
  const templateFiles = [
    { path: 'README.md', content: readPilotFile('README.md'), isHidden: false },
    { path: 'models.py', content: readPilotFile('models.py'), isHidden: false },
    { path: 'order_service.py', content: readPilotFile('order_service.py'), isHidden: false },
    { path: 'inventory_service.py', content: readPilotFile('inventory_service.py'), isHidden: false },
    { path: 'pricing_service.py', content: readPilotFile('pricing_service.py'), isHidden: false },
    { path: 'payment_client.py', content: readPilotFile('payment_client.py'), isHidden: false },
    { path: 'conftest.py', content: readPilotFile('conftest.py'), isHidden: false },
    { path: 'tests/__init__.py', content: readPilotFile('tests/__init__.py'), isHidden: false },
    { path: 'tests/test_orders.py', content: readPilotFile('tests/test_orders.py'), isHidden: false },
    { path: 'tests/test_hidden.py', content: readPilotFile('tests/test_hidden.py'), isHidden: true },
  ];

  for (const file of templateFiles) {
    if (file.content) {
      await prisma.templateFile.create({
        data: {
          templateId: template.id,
          ...file,
        },
      });
    }
  }
  console.log(`${templateFiles.filter(f => f.content).length} template files created`);

  // Planted bugs
  await prisma.plantedBug.createMany({
    data: [
      {
        templateId: template.id,
        name: 'Race Condition in Inventory Deduction',
        description: 'Read-then-write without locking in deduct_stock(); _sync_warehouse() 10ms delay widens race window',
        file: 'inventory_service.py',
        lineStart: 77,
        lineEnd: 107,
        severity: 'high',
        hints: JSON.stringify([
          'What happens when two threads call deduct_stock simultaneously?',
          'Look at the _sync_warehouse delay between read and write',
        ]),
        solution: 'Use threading.Lock, atomic SQL UPDATE with WHERE clause, or SELECT FOR UPDATE',
      },
      {
        templateId: template.id,
        name: 'Float Precision in Pricing',
        description: 'Accumulating float values in calculate_total() causes precision errors (e.g., 10.600000000000001)',
        file: 'pricing_service.py',
        lineStart: 61,
        lineEnd: 77,
        severity: 'medium',
        hints: JSON.stringify([
          'Try adding items with prices 4.95, 3.10, and 2.55',
          'What type should monetary values use?',
        ]),
        solution: 'Use decimal.Decimal for monetary calculations or integer cents',
      },
    ],
  });
  console.log('2 planted bugs created');

  // M1-5: Planted hallucinations from library (22 entries)
  for (const h of HALLUCINATION_LIBRARY) {
    await prisma.plantedHallucination.create({
      data: {
        templateId: template.id,
        description: h.description,
        trigger: h.trigger,
        reality: h.reality,
        dimension: h.dimension,
      },
    });
  }
  console.log(`${HALLUCINATION_LIBRARY.length} planted hallucinations created`);

  // Checkpoint configs (P0-1: refined instructions for naturalness and signal quality)
  const checkpoints = [
    {
      checkpointIndex: 1,
      title: 'Code Understanding',
      description: 'Structured Q&A at fact/intent/inference levels about the order processing service',
      durationMinutes: 10,
      instructions: {
        overview: 'Walk the candidate through 3 questions with increasing depth. Let them explore the code freely before each question.',
        level1_fact: 'Walk me through what happens when process_order() is called — what are the main steps?',
        level2_intent: 'Why do you think check_stock and deduct_stock are separate functions rather than one combined operation?',
        level3_inference: 'If this service handles 100 orders per second, what problems might you anticipate? Where would you look first?',
        naturalness: 'Frame questions conversationally. If candidate answers partially, probe deeper on their answer rather than moving to the next question.',
        timing: 'Allow 2-3 min per question. If candidate finishes early, ask a follow-up on their most interesting observation.',
      },
      criteria: JSON.stringify([
        'Can identify the pipeline steps and data flow between modules',
        'Understands separation of concerns and its trade-offs',
        'Can reason about concurrency and scaling implications without prompting',
        'Shows systematic approach (reads related files, traces call chain)',
      ]),
    },
    {
      checkpointIndex: 2,
      title: 'Bug Location & Fixing',
      description: 'Candidate locates and fixes 2 planted bugs: race condition in inventory + float precision in pricing',
      durationMinutes: 12,
      instructions: {
        overview: 'Guide discovery, do not reveal bugs directly. Start with the symptom, let candidate trace to root cause.',
        bug1_intro: 'We have been seeing occasional stock counts going negative under load. Can you investigate what might cause that?',
        bug1_hints: 'If stuck after 3 min: "Look at what happens between check_stock and deduct_stock when two threads run simultaneously."',
        bug2_intro: 'QA reported that order totals sometimes show values like ¥10.600000000000001. Any idea what is going on?',
        bug2_hints: 'If stuck after 3 min: "Check how calculate_total handles the arithmetic."',
        naturalness: 'Present bugs as real production issues. Acknowledge good observations. If candidate finds bugs in a different order, follow their lead.',
        v5_signal: 'Observe debugging approach: does candidate form hypotheses, check assumptions systematically, or randomly try things?',
      },
      criteria: JSON.stringify([
        'Identifies race condition root cause (read-then-write gap)',
        'Proposes valid fix (lock/atomic update/SELECT FOR UPDATE)',
        'Identifies float precision issue (IEEE 754 limitation)',
        'Proposes valid fix (Decimal/integer cents)',
        'Verifies fixes by running tests',
        'Debugging approach is systematic, not random',
      ]),
    },
    {
      checkpointIndex: 3,
      title: 'Requirements Extension',
      description: 'Design and implement a coupon/discount system that integrates with existing pricing',
      durationMinutes: 15,
      instructions: {
        overview: 'Present as a product request. Let candidate ask clarifying questions before coding.',
        requirement: 'Product wants to add coupon support: percentage discounts (e.g., 20% off) and fixed-amount discounts (e.g., ¥50 off). Coupons should have expiry dates and usage limits.',
        clarification_ready: 'If asked: minimum order amounts for coupons are optional but a good idea. Coupons cannot stack. One coupon per order.',
        naturalness: 'Let the candidate drive the conversation. If they start coding immediately, ask "Before you start, how are you thinking about integrating this with the existing pricing_service?" to encourage planning.',
        v3_signal: 'Watch for: does the candidate extend existing code or rewrite? Do they consider the pricing_service float bug when adding coupon logic?',
      },
      criteria: JSON.stringify([
        'Clean model design (Coupon class/dataclass with validation)',
        'Extends pricing_service rather than rewriting from scratch',
        'Handles edge cases (expired coupon, usage limit, minimum amount)',
        'Code style is consistent with existing codebase',
        'Considers interaction with the float precision fix from CP2',
      ]),
    },
    {
      checkpointIndex: 4,
      title: 'Decision Probing',
      description: 'Voice-based deep follow-up on design decisions and engineering judgment (via RTC)',
      durationMinutes: 20,
      instructions: {
        overview: 'Switch to voice mode. Probe the depth of understanding behind coding decisions made in CP1-CP3.',
        opening: 'Let us talk about some of the decisions you made. I would like to understand your reasoning.',
        topics: [
          'Why did you choose that particular approach for fixing the race condition? What alternatives did you consider?',
          'If this service needed to handle 10x the current load, what would you change first?',
          'How would you approach testing the coupon system to have confidence it works correctly?',
          'If a junior developer asked you to review this codebase, what would you flag as the top 3 things to improve?',
        ],
        naturalness: 'Follow the candidate\'s train of thought. If they give a surface-level answer, ask "Can you go deeper on that?" or "What are the trade-offs?" Do not rush through all topics — depth on 2-3 topics is better than breadth on all.',
        probing_strategy: 'Use context_switch questions if candidate seems to be reciting memorized answers. Jump from architecture to testing to debugging to see if understanding is genuine.',
      },
      criteria: JSON.stringify([
        'Can articulate trade-offs with specificity (not just "it depends")',
        'Considers multiple alternatives and explains why one was chosen',
        'Demonstrates understanding beyond the immediate task (scaling, maintenance)',
        'Responds well to follow-up pressure — answers get deeper, not shallower',
        'Can connect decisions across different parts of the system',
      ]),
    },
  ];

  for (const cp of checkpoints) {
    await prisma.checkpointConfig.create({
      data: {
        templateId: template.id,
        ...cp,
        instructions: cp.instructions,
        criteria: cp.criteria,
      },
    });
  }
  console.log('4 checkpoint configs created');

  // M1-5: Followup templates from probing library (50+ entries)
  for (const entry of PROBING_LIBRARY) {
    await prisma.followupTemplate.create({
      data: {
        templateId: template.id,
        checkpointIndex: entry.checkpointIndex,
        category: entry.category,
        question: entry.question,
        expectedTopics: JSON.stringify(entry.expectedTopics),
      },
    });
  }
  console.log(`${PROBING_LIBRARY.length} followup templates created`);

  // Default scoring weight profile
  await prisma.scoringWeightProfile.create({
    data: {
      name: 'Default',
      isDefault: true,
      weights: { V1: 0.30, V2: 0.25, V3: 0.20, V4: 0.15, V5: 0.10 },
      thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
    },
  });

  // M2-8: Role weight profiles
  await prisma.scoringWeightProfile.createMany({
    data: [
      {
        name: 'role:BACKEND',
        isDefault: false,
        weights: { V1: 0.25, V2: 0.25, V3: 0.20, V4: 0.15, V5: 0.15 },
        thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
      },
      {
        name: 'role:FRONTEND',
        isDefault: false,
        weights: { V1: 0.30, V2: 0.20, V3: 0.25, V4: 0.15, V5: 0.10 },
        thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
      },
      {
        name: 'role:FULLSTACK',
        isDefault: false,
        weights: { V1: 0.28, V2: 0.22, V3: 0.22, V4: 0.15, V5: 0.13 },
        thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
      },
      {
        name: 'role:DATA',
        isDefault: false,
        weights: { V1: 0.30, V2: 0.20, V3: 0.20, V4: 0.20, V5: 0.10 },
        thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
      },
      {
        name: 'role:DEVOPS',
        isDefault: false,
        weights: { V1: 0.20, V2: 0.20, V3: 0.20, V4: 0.20, V5: 0.20 },
        thresholds: { L1: 25, L2: 50, L3: 75, L4: 90 },
      },
    ],
  });

  // M2-8: Level weight profiles (Junior emphasizes V1+V5, Senior emphasizes V4)
  await prisma.scoringWeightProfile.createMany({
    data: [
      {
        name: 'level:L1',
        isDefault: false,
        weights: { V1: 0.35, V2: 0.25, V3: 0.15, V4: 0.10, V5: 0.15 },
        thresholds: { L1: 20, L2: 40, L3: 60, L4: 80 },
      },
      {
        name: 'level:L2',
        isDefault: false,
        weights: { V1: 0.30, V2: 0.25, V3: 0.20, V4: 0.12, V5: 0.13 },
        thresholds: { L1: 25, L2: 50, L3: 70, L4: 85 },
      },
      {
        name: 'level:L3',
        isDefault: false,
        weights: { V1: 0.25, V2: 0.25, V3: 0.20, V4: 0.18, V5: 0.12 },
        thresholds: { L1: 30, L2: 55, L3: 75, L4: 90 },
      },
      {
        name: 'level:L4',
        isDefault: false,
        weights: { V1: 0.20, V2: 0.20, V3: 0.20, V4: 0.25, V5: 0.15 },
        thresholds: { L1: 35, L2: 60, L3: 80, L4: 92 },
      },
    ],
  });
  console.log('Scoring weight profiles created (1 default + 5 role + 4 level)');

  // ─── AR-11: Template 2 — Node.js REST API (TypeScript) ───

  const template2 = await prisma.template.create({
    data: {
      name: 'User Management API',
      description: 'Node.js REST API with Express + TypeScript for user CRUD operations',
      language: 'typescript',
      metadata: {
        duration: 70,
        checkpoints: 4,
        difficulty: 'mid-senior',
        runtime: 'node',
      },
    },
  });

  const tsFiles = [
    {
      path: 'README.md',
      isHidden: false,
      content: `# User Management API\n\nA REST API built with Express and TypeScript for managing users.\n\n## Setup\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n\n## Endpoints\n- GET /api/users\n- GET /api/users/:id\n- POST /api/users\n- PUT /api/users/:id\n- DELETE /api/users/:id\n`,
    },
    {
      path: 'src/server.ts',
      isHidden: false,
      content: `import express from 'express';
import { userRouter } from './routes/users.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
app.use(express.json());

// Public routes
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Protected routes
app.use('/api', authMiddleware);
app.use('/api/users', userRouter);

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));

export default app;
`,
    },
    {
      path: 'src/routes/users.ts',
      isHidden: false,
      content: `import { Router } from 'express';
import { db } from '../db/queries.js';
import { validateUser } from '../utils/validation.js';

export const userRouter = Router();

// GET /api/users
userRouter.get('/', async (_req, res) => {
  const users = await db.getUsers();
  res.json({ users });
});

// GET /api/users/:id
userRouter.get('/:id', async (req, res) => {
  const user = await db.getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
});

// POST /api/users
userRouter.post('/', async (req, res) => {
  const errors = validateUser(req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  const user = await db.createUser(req.body);
  res.status(201).json({ user });
});

// PUT /api/users/:id — BUG: Race condition on concurrent updates
userRouter.put('/:id', async (req, res) => {
  const existing = await db.getUserById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Read-then-write without optimistic locking
  const merged = { ...existing, ...req.body, updatedAt: new Date() };
  const updated = await db.updateUser(req.params.id, merged);
  res.json({ user: updated });
});

// DELETE /api/users/:id
userRouter.delete('/:id', async (req, res) => {
  await db.deleteUser(req.params.id);
  res.json({ deleted: true });
});
`,
    },
    {
      path: 'src/middleware/auth.ts',
      isHidden: false,
      content: `import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    (req as any).user = decoded;
    next();
  } catch (err) {
    // BUG: JWT expiry comparison off-by-one (uses > instead of >=)
    if (err instanceof jwt.TokenExpiredError) {
      const decoded = jwt.decode(token) as { exp: number } | null;
      if (decoded && decoded.exp > Math.floor(Date.now() / 1000)) {
        // This branch is dead code — exp is already past
        (req as any).user = decoded;
        next();
        return;
      }
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}
`,
    },
    {
      path: 'src/db/queries.ts',
      isHidden: false,
      content: `interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory store (simulates a database)
const users = new Map<string, User>();
let idCounter = 0;

export const db = {
  async getUsers(): Promise<User[]> {
    return Array.from(users.values());
  },

  async getUserById(id: string): Promise<User | null> {
    return users.get(id) || null;
  },

  async createUser(data: { name: string; email: string; role?: string }): Promise<User> {
    const id = String(++idCounter);
    const user: User = {
      id,
      name: data.name,
      email: data.email,
      role: data.role || 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    users.set(id, user);
    return user;
  },

  async updateUser(id: string, data: Partial<User>): Promise<User | null> {
    const existing = users.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    users.set(id, updated);
    return updated;
  },

  async deleteUser(id: string): Promise<boolean> {
    return users.delete(id);
  },

  // For testing
  _clear() {
    users.clear();
    idCounter = 0;
  },
};
`,
    },
    {
      path: 'src/utils/validation.ts',
      isHidden: false,
      content: `export function validateUser(data: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }

  if (!data.email || typeof data.email !== 'string') {
    errors.push('Email is required');
  } else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(data.email)) {
    errors.push('Invalid email format');
  }

  if (data.role && !['user', 'admin', 'moderator'].includes(data.role as string)) {
    errors.push('Role must be user, admin, or moderator');
  }

  return errors;
}
`,
    },
  ];

  for (const file of tsFiles) {
    await prisma.templateFile.create({
      data: { templateId: template2.id, ...file },
    });
  }

  await prisma.plantedBug.createMany({
    data: [
      {
        templateId: template2.id,
        name: 'Concurrent User Update Race Condition',
        description: 'PUT /api/users/:id reads then writes without optimistic locking; concurrent requests can overwrite each other',
        file: 'src/routes/users.ts',
        lineStart: 36,
        lineEnd: 47,
        severity: 'high',
        hints: JSON.stringify(['What if two PUT requests arrive for the same user at the same time?', 'The read-then-write has no version check']),
        solution: 'Add version field for optimistic locking, or use atomic update operation',
      },
      {
        templateId: template2.id,
        name: 'JWT Expiry Off-by-One',
        description: 'Dead code branch in auth middleware — TokenExpiredError means exp is already past, so the > check never succeeds',
        file: 'src/middleware/auth.ts',
        lineStart: 20,
        lineEnd: 28,
        severity: 'medium',
        hints: JSON.stringify(['What does TokenExpiredError mean about the exp claim?', 'Is the recovery branch reachable?']),
        solution: 'Remove dead code branch; if grace period needed, compare with tolerance',
      },
    ],
  });

  await prisma.checkpointConfig.createMany({
    data: [
      { templateId: template2.id, checkpointIndex: 1, title: 'Code Understanding', description: 'Understand the REST API structure and middleware chain', durationMinutes: 10, instructions: { level1: 'Trace a POST /api/users request through the codebase', level2: 'Why is auth separated from route handlers?', level3: 'What happens if the DB write fails mid-request?' }, criteria: '["Identifies middleware chain","Understands route structure","Reasons about error scenarios"]' },
      { templateId: template2.id, checkpointIndex: 2, title: 'Bug Fixing', description: 'Find and fix the race condition and JWT expiry bug', durationMinutes: 12, instructions: { bug1: 'Guide candidate to concurrent update issue', bug2: 'Guide candidate to JWT dead code' }, criteria: '["Identifies race condition","Proposes locking solution","Spots dead code in auth"]' },
      { templateId: template2.id, checkpointIndex: 3, title: 'Feature Extension', description: 'Add pagination and filtering to GET /api/users', durationMinutes: 15, instructions: { requirement: 'Add query params: page, limit, search by name/email' }, criteria: '["Clean implementation","Handles edge cases","Backward compatible"]' },
      { templateId: template2.id, checkpointIndex: 4, title: 'Decision Probing', description: 'Voice Q&A on design decisions', durationMinutes: 20, instructions: { focus: 'REST vs GraphQL, auth strategies, DB scaling' }, criteria: '["Articulates trade-offs","Multi-perspective analysis"]' },
    ],
  });

  console.log(`Template 2 created: ${template2.id} (Node.js REST API)`);

  // ─── AR-11: Template 3 — Spring Boot Inventory (Java) ───

  const template3 = await prisma.template.create({
    data: {
      name: 'Inventory Management Service',
      description: 'Spring Boot inventory service with JPA for product stock management',
      language: 'java',
      metadata: {
        duration: 70,
        checkpoints: 4,
        difficulty: 'mid-senior',
        runtime: 'java',
      },
    },
  });

  const javaFiles = [
    {
      path: 'README.md',
      isHidden: false,
      content: `# Inventory Management Service\n\nSpring Boot service for managing product inventory.\n\n## Build & Run\n\`\`\`\nmvn spring-boot:run\n\`\`\`\n\n## Endpoints\n- GET /api/products\n- POST /api/products\n- PUT /api/products/{id}/stock\n- GET /api/products/low-stock\n`,
    },
    {
      path: 'src/main/java/com/inventory/controller/InventoryController.java',
      isHidden: false,
      content: `package com.inventory.controller;

import com.inventory.model.Product;
import com.inventory.service.InventoryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class InventoryController {

    private final InventoryService service;

    public InventoryController(InventoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<Product> listProducts() {
        return service.getAllProducts();
    }

    @PostMapping
    public ResponseEntity<Product> createProduct(@RequestBody Product product) {
        return ResponseEntity.status(201).body(service.createProduct(product));
    }

    @PutMapping("/{id}/stock")
    public ResponseEntity<Product> updateStock(
            @PathVariable Long id,
            @RequestParam int quantity) {
        return ResponseEntity.ok(service.adjustStock(id, quantity));
    }

    @GetMapping("/low-stock")
    public List<Product> getLowStockProducts(@RequestParam(defaultValue = "10") int threshold) {
        return service.getLowStockProducts(threshold);
    }

    @GetMapping("/total-value")
    public ResponseEntity<String> getTotalInventoryValue() {
        return ResponseEntity.ok(service.calculateTotalValue().toString());
    }
}
`,
    },
    {
      path: 'src/main/java/com/inventory/service/InventoryService.java',
      isHidden: false,
      content: `package com.inventory.service;

import com.inventory.model.Product;
import com.inventory.repository.ProductRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
public class InventoryService {

    private final ProductRepository repository;

    public InventoryService(ProductRepository repository) {
        this.repository = repository;
    }

    public List<Product> getAllProducts() {
        return repository.findAll();
    }

    public Product createProduct(Product product) {
        return repository.save(product);
    }

    // BUG: ConcurrentModificationException — iterates products while modifying
    public List<Product> getLowStockProducts(int threshold) {
        List<Product> allProducts = repository.findAll();
        List<Product> result = new ArrayList<>();
        for (Product p : allProducts) {
            if (p.getStock() < threshold) {
                result.add(p);
                // Side effect: auto-reorder flag — modifies the list source
                p.setNeedsReorder(true);
                repository.save(p);
            }
        }
        return result;
    }

    public Product adjustStock(Long id, int quantityDelta) {
        Product product = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Product not found: " + id));
        product.setStock(product.getStock() + quantityDelta);
        return repository.save(product);
    }

    // BUG: BigDecimal precision loss — uses doubleValue() for calculation
    public BigDecimal calculateTotalValue() {
        List<Product> products = repository.findAll();
        double total = 0.0;
        for (Product p : products) {
            total += p.getPrice().doubleValue() * p.getStock();
        }
        return BigDecimal.valueOf(total);
    }
}
`,
    },
    {
      path: 'src/main/java/com/inventory/repository/ProductRepository.java',
      isHidden: false,
      content: `package com.inventory.repository;

import com.inventory.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByStockLessThan(int threshold);
    List<Product> findByCategory(String category);
}
`,
    },
    {
      path: 'src/main/java/com/inventory/model/Product.java',
      isHidden: false,
      content: `package com.inventory.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    @Column(nullable = false)
    private int stock;

    @Transient
    private boolean needsReorder;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public int getStock() { return stock; }
    public void setStock(int stock) { this.stock = stock; }
    public boolean isNeedsReorder() { return needsReorder; }
    public void setNeedsReorder(boolean needsReorder) { this.needsReorder = needsReorder; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
`,
    },
    {
      path: 'src/main/java/com/inventory/config/InventoryConfig.java',
      isHidden: false,
      content: `package com.inventory.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class InventoryConfig {

    @Bean
    public int lowStockThreshold() {
        return 10;
    }

    @Bean
    public int maxStockLimit() {
        return 10000;
    }
}
`,
    },
  ];

  for (const file of javaFiles) {
    await prisma.templateFile.create({
      data: { templateId: template3.id, ...file },
    });
  }

  await prisma.plantedBug.createMany({
    data: [
      {
        templateId: template3.id,
        name: 'ConcurrentModificationException in getLowStockProducts',
        description: 'Iterating over products and saving (modifying) during iteration can cause ConcurrentModificationException with certain JPA implementations',
        file: 'src/main/java/com/inventory/service/InventoryService.java',
        lineStart: 30,
        lineEnd: 42,
        severity: 'high',
        hints: JSON.stringify(['What happens when you modify entities during iteration?', 'Look at the side effect inside the loop']),
        solution: 'Separate iteration from modification; collect IDs first, then batch update',
      },
      {
        templateId: template3.id,
        name: 'BigDecimal Precision Loss',
        description: 'Using doubleValue() for BigDecimal arithmetic loses precision for monetary calculations',
        file: 'src/main/java/com/inventory/service/InventoryService.java',
        lineStart: 50,
        lineEnd: 57,
        severity: 'medium',
        hints: JSON.stringify(['What precision does double provide vs BigDecimal?', 'Is there a way to multiply BigDecimal without converting?']),
        solution: 'Use BigDecimal.multiply() and BigDecimal.add() instead of doubleValue()',
      },
    ],
  });

  await prisma.checkpointConfig.createMany({
    data: [
      { templateId: template3.id, checkpointIndex: 1, title: 'Code Understanding', description: 'Understand Spring Boot layers and JPA lifecycle', durationMinutes: 10, instructions: { level1: 'Trace a POST /api/products request', level2: 'Why separate Controller/Service/Repository?', level3: 'What happens to JPA managed entities after save?' }, criteria: '["Identifies Spring layers","Understands JPA lifecycle","Reasons about transactions"]' },
      { templateId: template3.id, checkpointIndex: 2, title: 'Bug Fixing', description: 'Find ConcurrentModification and BigDecimal precision bugs', durationMinutes: 12, instructions: { bug1: 'Guide to iteration-modification issue', bug2: 'Guide to precision loss' }, criteria: '["Identifies CME risk","Proposes separation pattern","Spots doubleValue loss"]' },
      { templateId: template3.id, checkpointIndex: 3, title: 'Feature Extension', description: 'Add batch stock import endpoint with validation', durationMinutes: 15, instructions: { requirement: 'POST /api/products/batch-import accepting CSV or JSON array with validation' }, criteria: '["Clean batch processing","Handles partial failures","Transaction management"]' },
      { templateId: template3.id, checkpointIndex: 4, title: 'Decision Probing', description: 'Voice Q&A on architecture decisions', durationMinutes: 20, instructions: { focus: 'JPA vs JDBC, transaction isolation, caching strategies' }, criteria: '["Trade-off analysis","Depth beyond surface answers"]' },
    ],
  });

  console.log(`Template 3 created: ${template3.id} (Spring Boot Inventory)`);

  // ─── AR-10: Seed initial prompt versions from hardcoded constants ───

  const promptSeeds = [
    { name: 'interviewer_system', content: 'You are an AI technical interviewer conducting a structured coding assessment.' },
    { name: 'assistant_system', content: 'You are an AI coding assistant. Help the candidate with their coding tasks.' },
    { name: 'scoring_v1', content: "Evaluate the candidate's code understanding ability." },
    { name: 'scoring_v2', content: "Evaluate the candidate's ability to verify AI output." },
    { name: 'scoring_v3', content: "Evaluate the candidate's progressive problem solving ability." },
    { name: 'scoring_v4', content: "Evaluate the candidate's engineering judgment." },
    { name: 'scoring_v5', content: "Evaluate the candidate's debugging systematicness." },
  ];

  for (const ps of promptSeeds) {
    await prisma.promptVersion.create({
      data: { name: ps.name, version: 1, content: ps.content, isActive: true },
    });
  }
  console.log(`${promptSeeds.length} initial prompt versions seeded`);

  // ─── AR-4: Golden Set seed data for scoring calibration ───

  await prisma.goldenAnswer.deleteMany();
  await prisma.goldenAnswer.createMany({
    data: [
      // ─── V1: Code Understanding (low / mid / high) ───
      {
        dimension: 'V1',
        context: JSON.stringify({
          scenario: 'Candidate cannot explain what process_order() does, confuses check_stock with deduct_stock, gives no reasoning about concurrency.',
          answers: ['I think it processes orders', 'They do the same thing basically', 'Not sure about concurrency'],
        }),
        expectedScore: 25,
        tolerance: 12,
        metadata: { level: 'junior', band: 'low', template: 'Order Processing Service' },
      },
      {
        dimension: 'V1',
        context: JSON.stringify({
          scenario: 'Candidate correctly identifies pipeline steps in process_order(), explains separation of check_stock/deduct_stock, and reasons about concurrency at scale.',
          answers: ['process_order calls validate→check_stock→deduct_stock→calculate_total→create_payment', 'Separation allows independent retry and testing', 'At 100 rps, race condition in deduct_stock becomes critical'],
        }),
        expectedScore: 85,
        tolerance: 10,
        metadata: { level: 'mid', band: 'high', template: 'Order Processing Service' },
      },
      {
        dimension: 'V1',
        context: JSON.stringify({
          scenario: 'Candidate traces full flow including error paths, identifies implicit coupling via shared DB state, predicts ORM N+1 in list_orders, and suggests event-driven decoupling.',
          answers: ['Full pipeline with rollback paths on payment failure', 'Shared inventory table creates coupling between order and stock modules', 'list_orders triggers N+1 via lazy-loaded items', 'Event sourcing would decouple stock reservation from order creation'],
        }),
        expectedScore: 95,
        tolerance: 5,
        metadata: { level: 'senior', band: 'high', template: 'Order Processing Service' },
      },
      // ─── V2: AI Output Verification (low / mid / high) ───
      {
        dimension: 'V2',
        context: JSON.stringify({
          scenario: 'Candidate finds zero bugs, accepts AI hallucination OrderQueue.flush() without question, copy-pastes AI code verbatim.',
          bugFound: [],
          hallucinationRejected: false,
          aiInteractionQuality: 'low',
        }),
        expectedScore: 15,
        tolerance: 10,
        metadata: { level: 'junior', band: 'low', template: 'Order Processing Service' },
      },
      {
        dimension: 'V2',
        context: JSON.stringify({
          scenario: 'Candidate finds race condition bug but misses float precision. Questions AI suggestion but ultimately accepts a hallucinated method after AI insists.',
          bugFound: ['race_condition'],
          hallucinationRejected: false,
          aiInteractionQuality: 'medium',
        }),
        expectedScore: 50,
        tolerance: 12,
        metadata: { level: 'mid', band: 'mid', template: 'Order Processing Service' },
      },
      {
        dimension: 'V2',
        context: JSON.stringify({
          scenario: 'Candidate identifies both planted bugs (race condition + float precision) and rejects AI hallucination suggesting non-existent OrderQueue.flush() method.',
          bugFound: ['race_condition', 'float_precision'],
          hallucinationRejected: true,
          aiInteractionQuality: 'high',
        }),
        expectedScore: 90,
        tolerance: 8,
        metadata: { level: 'mid', band: 'high', template: 'Order Processing Service' },
      },
      // ─── V3: Progressive Problem Solving (low / mid / high) ───
      {
        dimension: 'V3',
        context: JSON.stringify({
          scenario: 'Candidate starts coupon feature but cannot complete it. Rewrites pricing_service from scratch instead of extending, no edge case handling.',
          completionRate: 0.3,
          diffQuality: 'rewrite',
          styleConsistency: 'low',
          edgeCases: [],
        }),
        expectedScore: 20,
        tolerance: 10,
        metadata: { level: 'junior', band: 'low', template: 'Order Processing Service' },
      },
      {
        dimension: 'V3',
        context: JSON.stringify({
          scenario: 'Candidate implements coupon system extending pricing_service with Decimal handling, validates expiry/usage limits, maintains code style consistency.',
          completionRate: 1.0,
          diffQuality: 'extends_existing',
          styleConsistency: 'high',
          edgeCases: ['expired_coupon', 'usage_limit', 'minimum_amount'],
        }),
        expectedScore: 78,
        tolerance: 12,
        metadata: { level: 'mid', band: 'high', template: 'Order Processing Service' },
      },
      {
        dimension: 'V3',
        context: JSON.stringify({
          scenario: 'Candidate implements coupon with strategy pattern for extensibility, adds comprehensive tests, handles concurrent usage with atomic DB operations, adds migration script.',
          completionRate: 1.0,
          diffQuality: 'extends_with_patterns',
          styleConsistency: 'high',
          edgeCases: ['expired_coupon', 'usage_limit', 'minimum_amount', 'concurrent_usage', 'stacking_rules'],
          testsWritten: 5,
        }),
        expectedScore: 92,
        tolerance: 6,
        metadata: { level: 'senior', band: 'high', template: 'Order Processing Service' },
      },
      // ─── V4: Engineering Judgment (low / mid / high) ───
      {
        dimension: 'V4',
        context: JSON.stringify({
          scenario: 'Candidate cannot articulate trade-offs. Says "I just used what the AI suggested" with no alternative awareness. Cannot discuss scaling.',
          tradeoffDepth: 0,
          alternatives: [],
          scalingInsight: false,
          probingDepthReached: 'L1',
        }),
        expectedScore: 18,
        tolerance: 10,
        metadata: { level: 'junior', band: 'low', template: 'Order Processing Service' },
      },
      {
        dimension: 'V4',
        context: JSON.stringify({
          scenario: 'Candidate articulates threading.Lock vs SELECT FOR UPDATE trade-offs, discusses 10x scaling strategy (read replicas, caching, queue), explains coupon test strategy with property-based testing.',
          tradeoffDepth: 3,
          alternatives: ['threading.Lock', 'atomic SQL', 'SELECT FOR UPDATE'],
          scalingInsight: true,
          probingDepthReached: 'L3',
        }),
        expectedScore: 72,
        tolerance: 10,
        metadata: { level: 'mid', band: 'mid', template: 'Order Processing Service' },
      },
      {
        dimension: 'V4',
        context: JSON.stringify({
          scenario: 'Candidate provides nuanced analysis: Lock vs MVCC vs CAS with latency/throughput/deadlock analysis, proposes CQRS for read scaling, discusses operational trade-offs of distributed transactions, references real-world failure modes.',
          tradeoffDepth: 5,
          alternatives: ['threading.Lock', 'MVCC', 'CAS', 'distributed_lock', 'CQRS'],
          scalingInsight: true,
          probingDepthReached: 'L4',
          operationalAwareness: true,
        }),
        expectedScore: 93,
        tolerance: 5,
        metadata: { level: 'senior', band: 'high', template: 'Order Processing Service' },
      },
      // ─── V5: Debugging Systematicness (low / mid / high) ───
      {
        dimension: 'V5',
        context: JSON.stringify({
          scenario: 'Candidate randomly edits code hoping to fix the bug, no hypothesis formed, no logging added, no reproduction attempt.',
          approach: 'random',
          hypothesisFormed: false,
          verificationSteps: ['random_edit', 'random_edit'],
          regressionCheck: false,
        }),
        expectedScore: 12,
        tolerance: 8,
        metadata: { level: 'junior', band: 'low', template: 'Order Processing Service' },
      },
      {
        dimension: 'V5',
        context: JSON.stringify({
          scenario: 'Candidate uses systematic hypothesis→verify→narrow approach for race condition: reads code, forms concurrency hypothesis, adds print/logging, reproduces with threading test, verifies fix.',
          approach: 'systematic',
          hypothesisFormed: true,
          verificationSteps: ['read_code', 'form_hypothesis', 'add_logging', 'reproduce', 'fix_and_verify'],
          regressionCheck: true,
        }),
        expectedScore: 82,
        tolerance: 10,
        metadata: { level: 'mid', band: 'high', template: 'Order Processing Service' },
      },
      {
        dimension: 'V5',
        context: JSON.stringify({
          scenario: 'Candidate identifies root cause in 3 steps: reads deduct_stock, spots missing lock, explains TOCTOU. Writes targeted concurrent test that reproduces 100% of the time, applies minimal fix, runs full regression suite.',
          approach: 'systematic',
          hypothesisFormed: true,
          verificationSteps: ['read_code', 'identify_toctou', 'write_concurrent_test', 'minimal_fix', 'full_regression'],
          regressionCheck: true,
          stepsToRoot: 3,
        }),
        expectedScore: 95,
        tolerance: 5,
        metadata: { level: 'senior', band: 'high', template: 'Order Processing Service' },
      },
    ],
  });
  console.log('15 golden answers seeded (V1-V5, 3 per dimension: low/mid/high)');

  console.log('Seed complete!');
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
