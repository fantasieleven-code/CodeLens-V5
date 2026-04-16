/**
 * Session-related hooks
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../../lib/adminApi.js';
import type { SessionRow, SessionDetail } from '../../types/admin.js';

export function useSessions(statusFilter: string, search: string, page: number, pageSize = 20) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const data = await apiFetch<{ sessions: SessionRow[]; total?: number }>(
        `/sessions?${params}`,
      );
      setSessions(data.sessions);
      setTotal(data.total ?? data.sessions.length);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page, pageSize]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  return { sessions, total, loading, error, refetch: loadSessions };
}

export function useSessionDetail(id: string | null) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<SessionDetail>(`/sessions/${id}`);
      setDetail(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
    else setDetail(null);
  }, [id, load]);

  return { detail, loading, error, refetch: load };
}
