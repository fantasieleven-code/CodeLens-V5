import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());

vi.mock('@e2b/code-interpreter', () => ({
  Sandbox: Object.assign(class FakeSandbox {}, {
    create: createMock,
    list: listMock,
  }),
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    E2B_API_KEY: 'fake-key',
    E2B_SANDBOX_TIMEOUT_MS: 30_000,
  },
}));

describe('E2BSandboxProvider', () => {
  beforeEach(() => {
    createMock.mockReset();
    listMock.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('isAvailable probes Sandbox.list and returns true on success', async () => {
    listMock.mockResolvedValueOnce([]);
    const { E2BSandboxProvider } = await import('../e2b-provider.js');
    const provider = new E2BSandboxProvider();
    expect(await provider.isAvailable()).toBe(true);
    expect(listMock).toHaveBeenCalledOnce();
  });

  it('isAvailable returns false when Sandbox.list rejects', async () => {
    listMock.mockRejectedValueOnce(new Error('network'));
    const { E2BSandboxProvider } = await import('../e2b-provider.js');
    const provider = new E2BSandboxProvider();
    expect(await provider.isAvailable()).toBe(false);
  });

  it('create → execute → destroy roundtrip', async () => {
    const fakeSandbox = {
      sandboxId: 'sbx-abc',
      files: { write: vi.fn().mockResolvedValue(undefined) },
      commands: {
        run: vi.fn().mockResolvedValue({ stdout: 'hi', stderr: '', exitCode: 0 }),
      },
      kill: vi.fn().mockResolvedValue(undefined),
    };
    createMock.mockResolvedValueOnce(fakeSandbox);

    const { E2BSandboxProvider } = await import('../e2b-provider.js');
    const provider = new E2BSandboxProvider();
    const sandbox = await provider.create();
    expect(sandbox.provider).toBe('e2b');
    expect(sandbox.id).toBe('sbx-abc');

    await provider.writeFiles(sandbox, [{ path: 'a.py', content: 'x' }]);
    expect(fakeSandbox.files.write).toHaveBeenCalledWith('a.py', 'x');

    const result = await provider.execute(sandbox, 'echo hi', 5_000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('hi');

    await provider.destroy(sandbox);
    expect(fakeSandbox.kill).toHaveBeenCalledOnce();
  });

  it('execute surfaces timeout from the underlying Sandbox', async () => {
    const fakeSandbox = {
      sandboxId: 'sbx-timeout',
      files: { write: vi.fn() },
      commands: {
        run: vi.fn().mockRejectedValue(new Error('Command timeout after 1000ms')),
      },
      kill: vi.fn().mockResolvedValue(undefined),
    };
    createMock.mockResolvedValueOnce(fakeSandbox);

    const { E2BSandboxProvider } = await import('../e2b-provider.js');
    const provider = new E2BSandboxProvider();
    const sandbox = await provider.create();
    const result = await provider.execute(sandbox, 'sleep 100', 1_000);
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(124);
    await provider.destroy(sandbox);
  });

  it('destroy on unknown sandbox is a no-op', async () => {
    const { E2BSandboxProvider } = await import('../e2b-provider.js');
    const provider = new E2BSandboxProvider();
    await expect(
      provider.destroy({ id: 'never', provider: 'e2b', createdAt: new Date() }),
    ).resolves.toBeUndefined();
  });
});
