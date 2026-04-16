/**
 * Report-related hooks
 */

import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../../lib/adminApi.js';
import type { HRReport, ConversationMessage } from '../../types/admin.js';

export function useReport(sessionId: string | null) {
  const [report, setReport] = useState<HRReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    apiFetch<HRReport>(`/sessions/${sessionId}/report`)
      .then((data) => setReport(data))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { report, loading, error };
}

export interface MicroVerification {
  id: string;
  question: string;
  candidateAnswer: string | null;
  confidenceScore: number | null;
  isCorrect: boolean | null;
  createdAt: string;
}

export function useMicroVerifications(sessionId: string | null) {
  const [data, setData] = useState<MicroVerification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) { setData([]); return; }
    setLoading(true);
    apiFetch<{ microVerifications: MicroVerification[] }>(`/sessions/${sessionId}/micro-verifications`)
      .then((res) => setData(res.microVerifications || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { microVerifications: data, loading };
}

export interface ModuleCRound {
  round: number;
  question: string;
  answer: string;
  source?: string; // 'voice' | 'text'
}

export interface ModuleCInsights {
  insightSummary: string;
  highlights: string[];
  concerns: string[];
  scores: {
    boundaryAwareness: number;
    communicationClarity: number;
    responseStructure: number;
    verbalConsistency: number;
    followUpImprovement: number;
    technicalVocabulary: number;
  };
}

export function useModuleCQA(sessionId: string | null) {
  const empty = { rounds: [] as ModuleCRound[], boundaryAwareness: null as number | null, communicationClarity: null as number | null, moduleCInsights: null as ModuleCInsights | null, totalRawRounds: 0, filteredCount: 0, probeHistory: [] as Array<{ round: number; targetDimension: string; probeType: string; reason: string }> };
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) { setData(empty); return; }
    setLoading(true);
    apiFetch<typeof data>(`/sessions/${sessionId}/module-c-qa`)
      .then(setData)
      .catch(() => setData(empty))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { ...data, loading };
}

export function useConversation(sessionId: string | null, moduleFilter?: string) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (moduleFilter) params.set('module', moduleFilter);
      const query = params.toString();
      const data = await apiFetch<{ messages: ConversationMessage[] }>(
        `/sessions/${sessionId}/conversation${query ? `?${query}` : ''}`,
      );
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [sessionId, moduleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return { messages, loading, refetch: load };
}
