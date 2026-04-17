import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock('../config/db.js', () => ({
  prisma: {
    session: {
      findUnique,
      update,
    },
  },
}));

import { fileSnapshotService } from './file-snapshot.service.js';

describe('FileSnapshotService', () => {
  beforeEach(() => {
    fileSnapshotService.__resetAllForTests();
    findUnique.mockReset();
    update.mockReset();
  });

  it('setFileContent tracks current + history', () => {
    fileSnapshotService.setFileContent('s1', 'a.ts', 'v1', 'manual_edit');
    fileSnapshotService.setFileContent('s1', 'a.ts', 'v2', 'ai_chat');
    fileSnapshotService.setFileContent('s1', 'a.ts', 'v3', 'ai_completion');

    expect(fileSnapshotService.getSnapshot('s1')).toEqual([{ path: 'a.ts', content: 'v3' }]);
    const history = fileSnapshotService.getFileHistory('s1', 'a.ts');
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.source)).toEqual(['manual_edit', 'ai_chat', 'ai_completion']);
  });

  it('isolates sessions', () => {
    fileSnapshotService.setFileContent('s1', 'a.ts', 'A', 'manual_edit');
    fileSnapshotService.setFileContent('s2', 'a.ts', 'B', 'manual_edit');
    expect(fileSnapshotService.getSnapshot('s1')).toEqual([{ path: 'a.ts', content: 'A' }]);
    expect(fileSnapshotService.getSnapshot('s2')).toEqual([{ path: 'a.ts', content: 'B' }]);
  });

  it('clear drops only the target session', () => {
    fileSnapshotService.setFileContent('s1', 'a.ts', 'A', 'manual_edit');
    fileSnapshotService.setFileContent('s2', 'a.ts', 'B', 'manual_edit');
    fileSnapshotService.clear('s1');
    expect(fileSnapshotService.getSnapshot('s1')).toEqual([]);
    expect(fileSnapshotService.getSnapshot('s2')).toEqual([{ path: 'a.ts', content: 'B' }]);
  });

  it('getFileHistory returns a copy (not the live array)', () => {
    fileSnapshotService.setFileContent('s1', 'a.ts', 'v1', 'manual_edit');
    const h1 = fileSnapshotService.getFileHistory('s1', 'a.ts');
    h1.push({ content: 'tampered', source: 'manual_edit', timestamp: 'x' });
    const h2 = fileSnapshotService.getFileHistory('s1', 'a.ts');
    expect(h2).toHaveLength(1);
  });

  it('persistToMetadata merges into existing Session.metadata', async () => {
    fileSnapshotService.setFileContent('s1', 'a.ts', 'v1', 'manual_edit');
    findUnique.mockResolvedValueOnce({ metadata: { existingKey: 'keep' } });
    update.mockResolvedValueOnce({});

    await fileSnapshotService.persistToMetadata('s1');
    expect(update).toHaveBeenCalledOnce();
    const call = update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 's1' });
    expect(call.data.metadata.existingKey).toBe('keep');
    expect(call.data.metadata.fileSnapshot['a.ts'].current).toBe('v1');
  });

  it('persistToMetadata is a no-op when session has no tracked files', async () => {
    await fileSnapshotService.persistToMetadata('never-edited');
    expect(findUnique).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('restoreFromMetadata rehydrates snapshot without hitting Prisma', () => {
    fileSnapshotService.restoreFromMetadata('s1', {
      fileSnapshot: {
        'b.ts': {
          current: 'hello',
          history: [{ content: 'hello', source: 'manual_edit', timestamp: '2026-01-01' }],
        },
      },
    });
    expect(fileSnapshotService.getSnapshot('s1')).toEqual([{ path: 'b.ts', content: 'hello' }]);
  });

  it('restoreFromMetadata tolerates missing fileSnapshot key', () => {
    fileSnapshotService.restoreFromMetadata('s1', { someOther: 'value' });
    expect(fileSnapshotService.getSnapshot('s1')).toEqual([]);
  });

  afterEach(() => {
    fileSnapshotService.__resetAllForTests();
  });
});
