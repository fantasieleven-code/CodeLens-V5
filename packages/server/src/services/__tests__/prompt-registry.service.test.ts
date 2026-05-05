import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    promptVersion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

type PromptRow = {
  id: string;
  name: string;
  version: number;
  content: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type PromptFindUniqueArgs = {
  where: { name_version: { name: string; version: number } };
};

type PromptFindFirstArgs = {
  where: { name: string; isActive?: boolean };
};

type PromptCreateArgs = {
  data: Omit<PromptRow, 'id' | 'createdAt' | 'updatedAt'>;
};

vi.mock('../../config/db.js', () => ({ prisma: mockPrisma }));
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  PromptNotFoundError,
  PromptPlaceholderError,
  PromptRegistry,
} from '../prompt-registry.service.js';
import { V5_PROMPT_KEYS } from '../prompt-keys.js';
import {
  LIVE_PRODUCTION_PROMPT_KEYS,
  LIVE_PRODUCTION_PROMPT_VERSION,
  LIVE_PRODUCTION_PROMPTS,
} from '../production-prompts.js';

function resetMocks() {
  for (const fn of Object.values(mockPrisma.promptVersion)) {
    fn.mockReset();
  }
}

describe('V5_PROMPT_KEYS', () => {
  it('contains exactly 18 keys (9 generator + 5 mc.probe + 3 md.llm_whitelist + 1 mb)', () => {
    expect(V5_PROMPT_KEYS).toHaveLength(18);
    expect(V5_PROMPT_KEYS.filter((k) => k.startsWith('generator.'))).toHaveLength(9);
    expect(V5_PROMPT_KEYS.filter((k) => k.startsWith('mc.probe_engine.'))).toHaveLength(5);
    expect(V5_PROMPT_KEYS.filter((k) => k.startsWith('md.llm_whitelist.'))).toHaveLength(3);
    expect(V5_PROMPT_KEYS.filter((k) => k.startsWith('mb.'))).toHaveLength(1);
  });

  it('has no duplicates', () => {
    expect(new Set(V5_PROMPT_KEYS).size).toBe(V5_PROMPT_KEYS.length);
  });
});

describe('LIVE_PRODUCTION_PROMPTS', () => {
  it('covers the 9 current live model-adjacent prompt keys', () => {
    expect(LIVE_PRODUCTION_PROMPT_VERSION).toBe(2);
    expect(LIVE_PRODUCTION_PROMPTS).toHaveLength(9);
    expect(LIVE_PRODUCTION_PROMPT_KEYS).toEqual([
      'mb.chat_generate',
      'mc.probe_engine.baseline',
      'mc.probe_engine.contradiction',
      'mc.probe_engine.weakness',
      'mc.probe_engine.escalation',
      'mc.probe_engine.transfer',
      'md.llm_whitelist.decomposition',
      'md.llm_whitelist.tradeoff',
      'md.llm_whitelist.ai_orch',
    ]);
  });

  it('keeps generator prompt slots fail-closed until the generator pipeline is real', () => {
    const generatorKeys = V5_PROMPT_KEYS.filter((key) => key.startsWith('generator.'));
    expect(generatorKeys).toHaveLength(9);
    expect(LIVE_PRODUCTION_PROMPT_KEYS.filter((key) => key.startsWith('generator.'))).toEqual([]);
  });

  it('only uses registered V5 prompt keys', () => {
    for (const prompt of LIVE_PRODUCTION_PROMPTS) {
      expect(V5_PROMPT_KEYS).toContain(prompt.key);
      expect(prompt.metadata.placeholder).toBe(false);
      expect(prompt.metadata.seededBy).toBe('v5.1-live-prompts');
    }
  });

  it('contains no seed TODO placeholder content', () => {
    for (const prompt of LIVE_PRODUCTION_PROMPTS) {
      expect(prompt.content).not.toContain('TODO: Task 9-10');
      expect(prompt.content.toLowerCase()).not.toContain('placeholder');
      expect(prompt.content.trim().length).toBeGreaterThan(40);
    }
  });

  it('keeps MD LLM prompt variable contracts aligned with signal call sites', () => {
    const byKey = new Map(LIVE_PRODUCTION_PROMPTS.map((p) => [p.key, p.content]));
    expect(byKey.get('md.llm_whitelist.decomposition')).toContain('{{subModules}}');
    expect(byKey.get('md.llm_whitelist.decomposition')).toContain('{{interfaceDefinitions}}');
    expect(byKey.get('md.llm_whitelist.decomposition')).toContain('{{dataFlowDescription}}');
    expect(byKey.get('md.llm_whitelist.tradeoff')).toContain('{{tradeoffText}}');
    expect(byKey.get('md.llm_whitelist.tradeoff')).toContain('{{constraintsSelected}}');
    expect(byKey.get('md.llm_whitelist.ai_orch')).toContain('{{aiOrchestrationPrompts}}');
  });
});

describe('PromptRegistry.get', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    resetMocks();
    registry = new PromptRegistry();
  });

  it('returns the active version content when no version specified', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'row-1',
      name: 'generator.step0_scenario',
      version: 3,
      content: 'active body',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const content = await registry.get('generator.step0_scenario');

    expect(content).toBe('active body');
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledWith({
      where: { name: 'generator.step0_scenario', isActive: true },
      orderBy: { version: 'desc' },
    });
  });

  it('returns a pinned version when specified', async () => {
    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce({
      id: 'row-2',
      name: 'mc.probe_engine.baseline',
      version: 2,
      content: 'pinned body',
      isActive: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const content = await registry.get('mc.probe_engine.baseline', 2);

    expect(content).toBe('pinned body');
    expect(mockPrisma.promptVersion.findUnique).toHaveBeenCalledWith({
      where: { name_version: { name: 'mc.probe_engine.baseline', version: 2 } },
    });
  });

  it('throws PromptNotFoundError when nothing matches', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce(null);
    await expect(registry.get('missing.key')).rejects.toBeInstanceOf(PromptNotFoundError);

    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce(null);
    await expect(registry.get('missing.key', 5)).rejects.toBeInstanceOf(PromptNotFoundError);
  });

  it('rejects seeded placeholder rows instead of returning TODO prompt text', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'row-placeholder',
      name: 'mc.probe_engine.baseline',
      version: 1,
      content: 'TODO: Task 9-10 填充',
      isActive: true,
      metadata: { placeholder: true, seededBy: 'task-7' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(registry.get('mc.probe_engine.baseline')).rejects.toBeInstanceOf(
      PromptPlaceholderError,
    );
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(1);
  });

  it('rejects TODO seed content even when placeholder metadata is missing', async () => {
    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce({
      id: 'row-placeholder',
      name: 'md.llm_whitelist.tradeoff',
      version: 1,
      content: 'TODO: Task 9-10 填充',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(registry.get('md.llm_whitelist.tradeoff', 1)).rejects.toBeInstanceOf(
      PromptPlaceholderError,
    );
    expect(mockPrisma.promptVersion.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caches active reads within TTL (second call hits the cache, not Prisma)', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'row-1',
      name: 'generator.step1_p0',
      version: 1,
      content: 'cached body',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const a = await registry.get('generator.step1_p0');
    const b = await registry.get('generator.step1_p0');

    expect(a).toBe('cached body');
    expect(b).toBe('cached body');
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(1);
  });

  it('expires cache after TTL elapses', async () => {
    const shortTtl = new PromptRegistry({ ttlMs: 50 });
    mockPrisma.promptVersion.findFirst
      .mockResolvedValueOnce({
        id: 'r1',
        name: 'k',
        version: 1,
        content: 'first',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .mockResolvedValueOnce({
        id: 'r1',
        name: 'k',
        version: 2,
        content: 'second',
        isActive: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    vi.useFakeTimers();
    try {
      expect(await shortTtl.get('k')).toBe('first');
      vi.advanceTimersByTime(100);
      expect(await shortTtl.get('k')).toBe('second');
    } finally {
      vi.useRealTimers();
    }
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(2);
  });

  it('caches pinned-version reads independently from active reads', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'a',
      name: 'k',
      version: 3,
      content: 'active-body',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce({
      id: 'b',
      name: 'k',
      version: 1,
      content: 'v1-body',
      isActive: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(await registry.get('k')).toBe('active-body');
    expect(await registry.get('k', 1)).toBe('v1-body');
    expect(await registry.get('k')).toBe('active-body');
    expect(await registry.get('k', 1)).toBe('v1-body');

    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.promptVersion.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('PromptRegistry.register', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    resetMocks();
    registry = new PromptRegistry();
  });

  it('auto-increments the version number from the latest row', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({ version: 4 });
    mockPrisma.promptVersion.create.mockResolvedValueOnce({
      id: 'new',
      name: 'generator.step2_schemes',
      version: 5,
      isActive: false,
      content: 'body',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await registry.register('generator.step2_schemes', 'body');

    expect(summary.version).toBe(5);
    expect(summary.isActive).toBe(false);
    expect(mockPrisma.promptVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'generator.step2_schemes',
          version: 5,
          isActive: false,
        }),
      }),
    );
    expect(mockPrisma.promptVersion.updateMany).not.toHaveBeenCalled();
  });

  it('starts at v1 when the key is new', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce(null);
    mockPrisma.promptVersion.create.mockResolvedValueOnce({
      id: 'new',
      name: 'fresh.key',
      version: 1,
      isActive: false,
      content: 'x',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await registry.register('fresh.key', 'x');
    expect(summary.version).toBe(1);
  });

  it('deactivates prior versions when activate=true', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({ version: 1 });
    mockPrisma.promptVersion.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.promptVersion.create.mockResolvedValueOnce({
      id: 'new',
      name: 'k',
      version: 2,
      isActive: true,
      content: 'v2',
      metadata: { foo: 'bar' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const summary = await registry.register('k', 'v2', {
      activate: true,
      metadata: { foo: 'bar' },
    });

    expect(summary.isActive).toBe(true);
    expect(summary.metadata).toEqual({ foo: 'bar' });
    expect(mockPrisma.promptVersion.updateMany).toHaveBeenCalledWith({
      where: { name: 'k', isActive: true },
      data: { isActive: false },
    });
  });

  it('invalidates the cache for the key after registering with activate=true', async () => {
    // Prime cache
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'r',
      name: 'k',
      version: 1,
      content: 'old',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await registry.get('k');
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(1);

    // Register new active version
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({ version: 1 });
    mockPrisma.promptVersion.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.promptVersion.create.mockResolvedValueOnce({
      id: 'new',
      name: 'k',
      version: 2,
      isActive: true,
      content: 'new',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await registry.register('k', 'new', { activate: true });

    // Next get should re-query
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'r2',
      name: 'k',
      version: 2,
      content: 'new',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await registry.get('k')).toBe('new');
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(3); // initial get + register lookup + post-register get
  });
});

describe('PromptRegistry.list', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    resetMocks();
    registry = new PromptRegistry();
  });

  it('returns summaries newest-first', async () => {
    mockPrisma.promptVersion.findMany.mockResolvedValueOnce([
      {
        id: 'a',
        name: 'k',
        version: 3,
        content: '',
        isActive: true,
        metadata: { m: 1 },
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date(),
      },
      {
        id: 'b',
        name: 'k',
        version: 2,
        content: '',
        isActive: false,
        metadata: {},
        createdAt: new Date('2025-12-01'),
        updatedAt: new Date(),
      },
    ]);

    const rows = await registry.list('k');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ version: 3, isActive: true, metadata: { m: 1 } });
    expect(rows[1]).toMatchObject({ version: 2, isActive: false });
    expect(mockPrisma.promptVersion.findMany).toHaveBeenCalledWith({
      where: { name: 'k' },
      orderBy: { version: 'desc' },
    });
  });
});

describe('PromptRegistry.setActive', () => {
  let registry: PromptRegistry;

  beforeEach(() => {
    resetMocks();
    registry = new PromptRegistry();
  });

  it('throws PromptNotFoundError when the version is missing', async () => {
    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce(null);
    await expect(registry.setActive('k', 9)).rejects.toBeInstanceOf(PromptNotFoundError);
    expect(mockPrisma.promptVersion.updateMany).not.toHaveBeenCalled();
  });

  it('deactivates others and activates the target version', async () => {
    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce({ id: 'existing' });
    mockPrisma.promptVersion.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.promptVersion.update.mockResolvedValueOnce({});

    await registry.setActive('k', 3);

    expect(mockPrisma.promptVersion.updateMany).toHaveBeenCalledWith({
      where: { name: 'k', isActive: true },
      data: { isActive: false },
    });
    expect(mockPrisma.promptVersion.update).toHaveBeenCalledWith({
      where: { name_version: { name: 'k', version: 3 } },
      data: { isActive: true },
    });
  });

  it('invalidates the cache for the key', async () => {
    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'r',
      name: 'k',
      version: 1,
      content: 'old',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await registry.get('k'); // prime cache

    mockPrisma.promptVersion.findUnique.mockResolvedValueOnce({ id: 'target' });
    mockPrisma.promptVersion.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.promptVersion.update.mockResolvedValueOnce({});
    await registry.setActive('k', 2);

    mockPrisma.promptVersion.findFirst.mockResolvedValueOnce({
      id: 'r2',
      name: 'k',
      version: 2,
      content: 'new',
      isActive: true,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(await registry.get('k')).toBe('new');
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('Integration flow: seeded key → get fails closed until real prompt activation', () => {
  it('seeds all 18 keys as v1 active but rejects them as usable prompt content', async () => {
    resetMocks();

    // In-memory table. Single active row per key (after seed).
    const table = new Map<string, PromptRow>();
    const rowKey = (name: string, version: number) => `${name}::${version}`;

    mockPrisma.promptVersion.findUnique.mockImplementation(
      async ({ where }: PromptFindUniqueArgs) => {
        const { name, version } = where.name_version;
        return table.get(rowKey(name, version)) ?? null;
      },
    );
    mockPrisma.promptVersion.findFirst.mockImplementation(
      async ({ where }: PromptFindFirstArgs) => {
        const rows = Array.from(table.values())
          .filter(
            (r) =>
              r.name === where.name &&
              (where.isActive === undefined || r.isActive === where.isActive),
          )
          .sort((a, b) => b.version - a.version);
        return rows[0] ?? null;
      },
    );
    mockPrisma.promptVersion.create.mockImplementation(async ({ data }: PromptCreateArgs) => {
      const row = {
        id: `id-${data.name}-${data.version}`,
        name: data.name,
        version: data.version,
        content: data.content,
        isActive: data.isActive,
        metadata: data.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      table.set(rowKey(row.name, row.version), row);
      return row;
    });

    // Simulate the seed: register each key as v1 active.
    for (const key of V5_PROMPT_KEYS) {
      await mockPrisma.promptVersion.create({
        data: {
          name: key,
          version: 1,
          content: 'TODO: Task 9-10 填充',
          isActive: true,
          metadata: { placeholder: true, seededBy: 'task-7' },
        },
      });
    }

    const registry = new PromptRegistry();

    for (const key of V5_PROMPT_KEYS) {
      await expect(registry.get(key)).rejects.toBeInstanceOf(PromptPlaceholderError);
    }

    // Placeholder failures are intentionally not cached, so a real prompt can
    // become usable immediately after activation.
    expect(mockPrisma.promptVersion.findFirst).toHaveBeenCalledTimes(V5_PROMPT_KEYS.length);
  });

  it('resolves a real active version even when an older seed placeholder exists', async () => {
    resetMocks();

    const table = new Map<string, PromptRow>();
    const rowKey = (name: string, version: number) => `${name}::${version}`;

    mockPrisma.promptVersion.findFirst.mockImplementation(
      async ({ where }: PromptFindFirstArgs) => {
        const rows = Array.from(table.values())
          .filter(
            (r) =>
              r.name === where.name &&
              (where.isActive === undefined || r.isActive === where.isActive),
          )
          .sort((a, b) => b.version - a.version);
        return rows[0] ?? null;
      },
    );

    table.set(rowKey('mc.probe_engine.baseline', 1), {
      id: 'seed',
      name: 'mc.probe_engine.baseline',
      version: 1,
      content: 'TODO: Task 9-10 填充',
      isActive: false,
      metadata: { placeholder: true, seededBy: 'task-7' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    table.set(rowKey('mc.probe_engine.baseline', 2), {
      id: 'real',
      name: 'mc.probe_engine.baseline',
      version: 2,
      content: 'real baseline prompt',
      isActive: true,
      metadata: { seededBy: 'task-11' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const registry = new PromptRegistry();
    await expect(registry.get('mc.probe_engine.baseline')).resolves.toBe('real baseline prompt');
  });
});
