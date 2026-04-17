import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../config/env.js', () => ({
  env: {
    E2B_API_KEY: 'fake',
    E2B_SANDBOX_TIMEOUT_MS: 30_000,
  },
}));

import { SandboxFactory } from '../sandbox-factory.js';
import type {
  ExecutionResult,
  FileEntry,
  Sandbox,
  SandboxProvider,
} from '../sandbox-provider.js';

function makeStub(kind: 'e2b' | 'docker' | 'static', available: boolean): SandboxProvider {
  return {
    kind,
    isAvailable: vi.fn(async () => available),
    create: vi.fn(async () => ({ id: `${kind}-sandbox`, provider: kind, createdAt: new Date() })),
    writeFiles: vi.fn(async (_s: Sandbox, _f: readonly FileEntry[]) => {}),
    execute: vi.fn(async (): Promise<ExecutionResult> => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      durationMs: 1,
    })),
    destroy: vi.fn(async () => {}),
  };
}

describe('SandboxFactory 3-tier fallback', () => {
  it('returns E2B when E2B is healthy', async () => {
    const e2b = makeStub('e2b', true);
    const docker = makeStub('docker', true);
    const staticP = makeStub('static', true);
    const f = new SandboxFactory([e2b, docker, staticP]);
    const p = await f.getProvider();
    expect(p.kind).toBe('e2b');
    expect(e2b.isAvailable).toHaveBeenCalledOnce();
    expect(docker.isAvailable).not.toHaveBeenCalled();
  });

  it('falls through to Docker when E2B is down', async () => {
    const f = new SandboxFactory([
      makeStub('e2b', false),
      makeStub('docker', true),
      makeStub('static', true),
    ]);
    const p = await f.getProvider();
    expect(p.kind).toBe('docker');
  });

  it('falls through to Static when E2B + Docker are both down', async () => {
    const f = new SandboxFactory([
      makeStub('e2b', false),
      makeStub('docker', false),
      makeStub('static', true),
    ]);
    const p = await f.getProvider();
    expect(p.kind).toBe('static');
  });

  it('isDegraded reflects fallback tier', async () => {
    const f = new SandboxFactory([
      makeStub('e2b', false),
      makeStub('docker', true),
      makeStub('static', true),
    ]);
    expect(await f.isDegraded()).toBe(true);
  });

  it('setE2bHealthy(false) skips E2B even if isAvailable would pass', async () => {
    const e2b = makeStub('e2b', true);
    const docker = makeStub('docker', true);
    const f = new SandboxFactory([e2b, docker, makeStub('static', true)]);
    f.setE2bHealthy(false);
    const p = await f.getProvider();
    expect(p.kind).toBe('docker');
    expect(e2b.isAvailable).not.toHaveBeenCalled();
  });

  it('throws when isAvailable rejects and treats as unavailable', async () => {
    const e2b: SandboxProvider = {
      ...makeStub('e2b', true),
      isAvailable: vi.fn(async () => {
        throw new Error('network');
      }),
    };
    const f = new SandboxFactory([e2b, makeStub('docker', true), makeStub('static', true)]);
    const p = await f.getProvider();
    expect(p.kind).toBe('docker');
  });
});

describe('SandboxFactory 5-minute health cache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('caches health probe for 5 minutes then re-probes', async () => {
    const e2b = makeStub('e2b', true);
    const f = new SandboxFactory([e2b, makeStub('docker', true), makeStub('static', true)]);

    await f.getProvider();
    await f.getProvider();
    await f.getProvider();
    expect(e2b.isAvailable).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4 * 60 * 1000);
    await f.getProvider();
    expect(e2b.isAvailable).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(61 * 1000);
    await f.getProvider();
    expect(e2b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('resetCache() forces an immediate re-probe', async () => {
    const e2b = makeStub('e2b', true);
    const f = new SandboxFactory([e2b, makeStub('docker', true), makeStub('static', true)]);
    await f.getProvider();
    f.resetCache();
    await f.getProvider();
    expect(e2b.isAvailable).toHaveBeenCalledTimes(2);
  });

  it('getHealthReport exposes cached entries with age', async () => {
    const f = new SandboxFactory([
      makeStub('e2b', true),
      makeStub('docker', true),
      makeStub('static', true),
    ]);
    await f.getProvider();
    vi.advanceTimersByTime(30_000);
    const report = f.getHealthReport();
    expect(report.e2b).toMatchObject({ ok: true });
    expect((report.e2b as { ageMs: number }).ageMs).toBeGreaterThanOrEqual(30_000);
    // docker + static never probed because e2b was healthy.
    expect(report.docker).toBe('unknown');
  });
});
