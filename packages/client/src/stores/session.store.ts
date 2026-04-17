/**
 * session.store — candidate session state.
 *
 * Holds session identity (sessionId/candidateId/suiteId/examInstanceId),
 * timer snapshot, and per-module submissions. Submissions follow the
 * V5Submissions shape so CompletePage / DecisionSummary can read fields
 * directly without adapters.
 *
 * Task 1 batch 3 scope (skeleton per review):
 *   - `setModuleSubmissionLocal` updates local state only.
 *   - `setModuleSubmission` is a TODO until shared/ws.ts gains the
 *     `v5:{module}:submit` events (filed per Backend module tasks).
 *   - `loadSession` is a TODO pending a REST endpoint.
 *   - `getDecisionSummary` is fully implemented (P0-8).
 */

import { create } from 'zustand';
import type {
  SuiteId,
  TimerState,
  V5ModuleKey,
  V5Submissions,
} from '@codelens-v5/shared';

export interface DecisionSummary {
  ma?: { schemeId: string; reasoning: string };
  mb?: { decomposition: string };
  md?: { subModuleCount: number; constraintCount: number };
}

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

  loadSession: (sessionId: string) => Promise<void>;
  setToken: (token: string | null) => void;

  setModuleSubmissionLocal: <K extends keyof V5Submissions>(
    moduleKey: K,
    data: V5Submissions[K],
  ) => void;

  setModuleSubmission: <K extends keyof V5Submissions>(
    moduleKey: K,
    data: V5Submissions[K],
  ) => Promise<void>;

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
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  ...INITIAL_STATE,

  setToken: (token) => set({ token }),

  loadSession: async (_sessionId) => {
    // TODO(Task 1 batch 4+): wire to `/api/v5/session/:id` REST endpoint
    // once Backend session bootstrap ships. Expected hydration:
    //   sessionId, candidateId, suiteId, examInstanceId, moduleOrder,
    //   submissions (resume-in-progress), timer snapshot.
    console.warn(
      '[session.store] loadSession is a skeleton — Backend endpoint pending.',
    );
  },

  setModuleSubmissionLocal: (moduleKey, data) => {
    set((state) => ({
      submissions: { ...state.submissions, [moduleKey]: data },
    }));
  },

  setModuleSubmission: async (moduleKey, data) => {
    // Local update is always safe.
    get().setModuleSubmissionLocal(moduleKey, data);
    // TODO(shared/ws.ts): wire `v5:{moduleKey}:submit` socket emit + ack
    // once the typed event exists (Backend adds one per module: Task 3 P0,
    // Task 4 MA, Task 5 MB, Task 6 MD). For now we keep local-only so
    // CompletePage/DecisionSummary still render during dev.
    console.warn(
      `[session.store] setModuleSubmission(${String(moduleKey)}) is local-only — socket emit pending shared/ws.ts contract.`,
    );
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
