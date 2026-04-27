/** Brief #15 · useModuleContent · 3 cases (loaded / 404 / network exception). */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModuleContent } from './useModuleContent.js';

const FAKE_VIEW = {
  featureRequirement: { description: 'd', acceptanceCriteria: ['a'] },
  scaffold: { files: [], dependencyOrder: [] },
  violationExamples: [],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useModuleContent', () => {
  it('transitions loading → loaded on 200', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => FAKE_VIEW,
    });
    const { result } = renderHook(() => useModuleContent('e-1', 'mb'));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    if (result.current.status === 'loaded') {
      expect(result.current.data).toEqual(FAKE_VIEW);
    }
  });

  it('transitions loading → error on 404', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 404,
    });
    const { result } = renderHook(() => useModuleContent('missing', 'mb'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status === 'error') {
      expect(result.current.message).toContain('未找到');
    }
  });

  it('transitions loading → error on network exception', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    const { result } = renderHook(() => useModuleContent('e-1', 'mb'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('网络错误');
    }
  });
});
