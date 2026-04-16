/**
 * Candidate-related hooks
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../../lib/adminApi.js';
import type { CandidateRow } from '../../types/admin.js';

export function useCandidates(search?: string) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const query = params.toString();
      const data = await apiFetch<{ candidates: CandidateRow[] }>(
        `/candidates${query ? `?${query}` : ''}`,
      );
      setCandidates(data.candidates);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  return { candidates, loading, error, refetch: loadCandidates };
}

export function useCreateCandidate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (input: { name: string; email: string; templateId?: string }) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<{
          candidate: CandidateRow;
          token?: string;
          inviteUrl?: string;
        }>('/candidates', {
          method: 'POST',
          body: JSON.stringify({ ...input, generateInvite: true }),
        });
        return data;
      } catch (err) {
        setError((err as Error).message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { create, loading, error };
}
