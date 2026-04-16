/**
 * Generic admin API hooks — useApiQuery + useApiMutation
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../lib/adminApi.js';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApiQuery<T>(path: string | null) {
  const [state, setState] = useState<QueryState<T>>({
    data: null,
    loading: !!path,
    error: null,
  });
  const pathRef = useRef(path);
  pathRef.current = path;

  const fetchData = useCallback(async () => {
    const currentPath = pathRef.current;
    if (!currentPath) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await apiFetch<T>(currentPath);
      if (pathRef.current === currentPath) {
        setState({ data, loading: false, error: null });
      }
    } catch (err) {
      if (pathRef.current === currentPath) {
        setState((s) => ({ ...s, loading: false, error: (err as Error).message }));
      }
    }
  }, []);

  useEffect(() => {
    if (path) fetchData();
    else setState({ data: null, loading: false, error: null });
  }, [path, fetchData]);

  return { ...state, refetch: fetchData };
}

interface MutationState<O> {
  data: O | null;
  loading: boolean;
  error: string | null;
}

export function useApiMutation<I, O>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE' = 'POST',
) {
  const [state, setState] = useState<MutationState<O>>({
    data: null,
    loading: false,
    error: null,
  });

  const mutate = useCallback(
    async (input?: I) => {
      setState({ data: null, loading: true, error: null });
      try {
        const data = await apiFetch<O>(path, {
          method,
          ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
        });
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        const error = (err as Error).message;
        setState({ data: null, loading: false, error });
        throw err;
      }
    },
    [path, method],
  );

  return { ...state, mutate };
}
