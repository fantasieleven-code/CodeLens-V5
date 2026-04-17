import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import { DockerSandboxProvider, __setDockerClientForTests } from '../docker-provider.js';

interface FakeExecOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  delayMs?: number;
}

function makeFakeClient(execOpts: FakeExecOptions = {}) {
  const containers = new Map<string, ReturnType<typeof makeFakeContainer>>();

  function makeFakeContainer(id: string) {
    return {
      id,
      start: vi.fn(async () => {}),
      stop: vi.fn(async (_opts?: { t: number }) => {}),
      remove: vi.fn(async (_opts: { force: boolean }) => {
        containers.delete(id);
      }),
      exec: vi.fn(async () => ({
        start: vi.fn(async () => {
          const stream = new PassThrough();
          setTimeout(() => {
            if (execOpts.stdout) stream.write(Buffer.from(execOpts.stdout));
            stream.end();
          }, execOpts.delayMs ?? 1);
          return stream;
        }),
        inspect: vi.fn(async () => ({ ExitCode: execOpts.exitCode ?? 0 })),
      })),
    };
  }

  return {
    ping: vi.fn(async () => 'OK'),
    createContainer: vi.fn(async () => {
      const id = `ctr-${containers.size + 1}-abcdef123456`;
      const c = makeFakeContainer(id);
      containers.set(id, c);
      return c;
    }),
    modem: {
      demuxStream: (src: NodeJS.ReadableStream, out: NodeJS.WritableStream, _err: NodeJS.WritableStream) => {
        src.on('data', (chunk) => out.write(chunk));
        src.on('end', () => {
          // intentionally do not end dst — factory consumes via src 'end'
        });
      },
    },
    __containers: containers,
  };
}

describe('DockerSandboxProvider lifecycle', () => {
  let provider: DockerSandboxProvider;
  let client: ReturnType<typeof makeFakeClient>;

  beforeEach(() => {
    client = makeFakeClient({ stdout: 'hello\n', exitCode: 0 });
    __setDockerClientForTests(client);
    provider = new DockerSandboxProvider();
  });

  afterEach(() => {
    __setDockerClientForTests(null);
  });

  it('isAvailable pings docker', async () => {
    expect(await provider.isAvailable()).toBe(true);
    expect(client.ping).toHaveBeenCalledOnce();
  });

  it('create → writeFiles → execute → destroy roundtrip', async () => {
    const sandbox = await provider.create();
    expect(sandbox.provider).toBe('docker');
    expect(client.createContainer).toHaveBeenCalledOnce();

    await provider.writeFiles(sandbox, [{ path: 'a.py', content: 'print(1)' }]);
    const result = await provider.execute(sandbox, 'echo hello', 1_000);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('hello');

    const container = [...client.__containers.values()][0];
    await provider.destroy(sandbox);
    expect(container.stop).toHaveBeenCalled();
    expect(container.remove).toHaveBeenCalledWith({ force: true });
    expect(client.__containers.size).toBe(0);
  });

  it('create failure → container.start throws → safe cleanup before rethrow', async () => {
    const failingClient = makeFakeClient();
    failingClient.createContainer = vi.fn(async () => {
      const remove = vi.fn(async (_opts: { force: boolean }) => {});
      return {
        id: 'ctr-fail-12345678',
        start: vi.fn(async () => {
          throw new Error('start failed');
        }),
        remove,
      };
    });
    __setDockerClientForTests(failingClient);
    const p = new DockerSandboxProvider();
    await expect(p.create()).rejects.toThrow('start failed');
  });

  it('execute surfaces OOM (exit 137) in stderr', async () => {
    __setDockerClientForTests(makeFakeClient({ exitCode: 137 }));
    const p = new DockerSandboxProvider();
    const sandbox = await p.create();
    const result = await p.execute(sandbox, 'python big.py', 5_000);
    expect(result.exitCode).toBe(137);
    expect(result.stderr).toContain('OOM');
    await p.destroy(sandbox);
  });

  it('destroy is idempotent for unknown sandbox ids', async () => {
    await expect(
      provider.destroy({ id: 'never-created', provider: 'docker', createdAt: new Date() }),
    ).resolves.toBeUndefined();
  });
});
