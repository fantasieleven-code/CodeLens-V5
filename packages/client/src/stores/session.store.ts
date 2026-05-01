/**
 * session.store — candidate session state.
 *
 * Holds session identity (sessionId/candidateId/suiteId/examInstanceId),
 * timer snapshot, and per-module submissions. Submissions follow the
 * V5Submissions shape so CompletePage / DecisionSummary can read fields
 * directly without adapters.
 *
 * Runtime submission persistence is owned by each module page via
 * `persistCandidateSubmission`, which emits the typed module submit event and
 * falls back to the matching REST endpoint. This store keeps the local
 * in-browser copy used by CompletePage / DecisionSummary.
 */

import { create } from 'zustand';
import type {
  SuiteId,
  TimerState,
  V5ModuleKey,
  V5Submissions,
} from '@codelens-v5/shared';
import { SUITES } from '@codelens-v5/shared';
import { useModuleStore } from './module.store.js';

interface CandidateSessionResponse {
  id: string;
  candidate: { id: string; name: string; email: string };
  suiteId: string;
  examInstanceId: string;
  status: string;
}

export interface DecisionSummary {
  ma?: { schemeId: string; reasoning: string };
  mb?: { decomposition: string };
  md?: { subModuleCount: number; constraintCount: number };
}

export type SessionLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface SessionStore {
  sessionId: string | null;
  candidateId: string | null;
  suiteId: SuiteId | null;
  examInstanceId: string | null;
  moduleOrder: V5ModuleKey[];
  submissions: Partial<V5Submissions>;
  timer: TimerState | null;
  /**
   * Bearer token issued at session-join / admin-login.
   * V5.0 continues V4's Bearer auth mechanism (Steve-confirmed at Task 6).
   * Consumers (useVoiceRTC, admin API calls) read via `useSessionStore.getState().token`.
   * Wiring the actual setToken call site lives in later tasks (MC backend join,
   * Admin login flow).
   */
  token: string | null;
  /**
   * Reflects the most recent `loadSession` outcome. Pages gate their loading /
   * error UX on this value so a `sessionId` that never resolves (invalid URL
   * token, 404 in Layer 2) surfaces as an explicit error instead of a
   * silently-disabled page.
   */
  loadStatus: SessionLoadStatus;
  loadError: string | null;

  loadSession: (sessionId: string) => Promise<void>;
  setToken: (token: string | null) => void;

  setModuleSubmissionLocal: <K extends keyof V5Submissions>(
    moduleKey: K,
    data: V5Submissions[K],
  ) => void;

  getModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K,
  ) => V5Submissions[K] | undefined;

  getDecisionSummary: () => DecisionSummary;

  reset: () => void;
}

const INITIAL_STATE = {
  sessionId: null,
  candidateId: null,
  suiteId: null,
  examInstanceId: null,
  moduleOrder: [] as V5ModuleKey[],
  submissions: {} as Partial<V5Submissions>,
  timer: null as TimerState | null,
  token: null as string | null,
  loadStatus: 'idle' as SessionLoadStatus,
  loadError: null as string | null,
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...INITIAL_STATE,

  setToken: (token) => set({ token }),

  loadSession: async (sessionId) => {
    // Brief #13 D17 · Layer 2 swap shipped · GET /api/v5/session/:id resolves
    // sessionId from the shareable URL into the real DB record (vite proxy
    // /api → :4000 in dev/CI, same-origin reverse proxy in production).
    set({ loadStatus: 'loading', loadError: null });
    let session: CandidateSessionResponse;
    try {
      const response = await fetch(`/api/v5/session/${sessionId}`);
      if (response.status === 404) {
        set({ loadStatus: 'error', loadError: `未找到会话 ${sessionId}` });
        return;
      }
      if (!response.ok) {
        set({ loadStatus: 'error', loadError: `加载会话失败 (${response.status})` });
        return;
      }
      session = (await response.json()) as CandidateSessionResponse;
    } catch {
      set({ loadStatus: 'error', loadError: '网络错误' });
      return;
    }
    const suite = SUITES[session.suiteId as SuiteId];
    if (!suite) {
      set({ loadStatus: 'error', loadError: `未知套件 ${session.suiteId}` });
      return;
    }
    const moduleOrder = [...suite.modules] as V5ModuleKey[];
    set({
      sessionId: session.id,
      candidateId: session.candidate.id,
      suiteId: session.suiteId as SuiteId,
      examInstanceId: session.examInstanceId,
      moduleOrder,
      loadStatus: 'loaded',
      loadError: null,
    });
    // Prime module.store so ExamRouter renders the intro (currentModule
    // becomes 'intro') and Start button is enabled.
    useModuleStore.getState().setSuite(session.suiteId as SuiteId, moduleOrder);
  },

  setModuleSubmissionLocal: (moduleKey, data) => {
    set((state) => ({
      submissions: { ...state.submissions, [moduleKey]: data },
    }));
  },

  getModuleSubmission: (moduleKey) => {
    return get().submissions[moduleKey] as V5Submissions[typeof moduleKey] | undefined;
  },

  getDecisionSummary: () => {
    const s = get().submissions;
    return {
      ma: s.moduleA
        ? {
            schemeId: s.moduleA.round1.schemeId,
            reasoning: s.moduleA.round1.reasoning,
          }
        : undefined,
      mb: s.mb?.planning
        ? { decomposition: s.mb.planning.decomposition.split('\n')[0] ?? '' }
        : undefined,
      md: s.moduleD
        ? {
            subModuleCount: s.moduleD.subModules.length,
            constraintCount: s.moduleD.constraintsSelected.length,
          }
        : undefined,
    };
  },

  reset: () => {
    set({ ...INITIAL_STATE });
  },
}));
