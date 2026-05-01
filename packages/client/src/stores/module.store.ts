/**
 * module.store — evaluation flow state machine.
 *
 * Tracks which suite the candidate is in, the ordered module list, and the
 * current module pointer. `currentModule` is one of:
 *   - `null` or `'intro'` → pre-start (intro screen)
 *   - a V5ModuleKey → candidate is mid-module
 *   - `'complete'` → all modules finished (show CompletePage)
 *
 * Design principle (submit-is-final): no `goBack`, no `goToModule`, no
 * `skipModule`. The only forward transition is `advance()`.
 *
 * Pause/resume: `isPaused` is a candidate-triggered UI-only flag. It does not
 * notify the backend and does not adjust `session.expiresAt` — pause is a
 * courtesy nudge, not time-bank accounting.
 */

import { create } from 'zustand';
import { SUITES, type SuiteId, type V5ModuleKey } from '@codelens-v5/shared';

export type CurrentModule = V5ModuleKey | 'intro' | 'complete' | null;

export interface ModuleProgress {
  completed: number;
  total: number;
  percentage: number;
  remainingMinutes: number;
}

export interface ModuleStore {
  suiteId: SuiteId | null;
  moduleOrder: V5ModuleKey[];
  currentModule: CurrentModule;
  isComplete: boolean;
  isPaused: boolean;

  advance: () => void;
  setSuite: (suiteId: SuiteId, moduleOrder: V5ModuleKey[]) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;

  getCurrentModuleIndex: () => number;
  getProgress: () => ModuleProgress;
}

export const useModuleStore = create<ModuleStore>((set, get) => ({
  suiteId: null,
  moduleOrder: [],
  currentModule: null,
  isComplete: false,
  isPaused: false,

  advance: () => {
    const { currentModule, moduleOrder } = get();

    if (currentModule === 'complete') return;

    if (currentModule === null || currentModule === 'intro') {
      if (moduleOrder.length === 0) {
        set({ currentModule: 'complete', isComplete: true });
        return;
      }
      set({ currentModule: moduleOrder[0]!, isComplete: false });
      return;
    }

    const idx = moduleOrder.indexOf(currentModule);
    if (idx === -1 || idx >= moduleOrder.length - 1) {
      set({ currentModule: 'complete', isComplete: true });
      return;
    }
    set({ currentModule: moduleOrder[idx + 1]!, isComplete: false });
  },

  setSuite: (suiteId, moduleOrder) => {
    set({
      suiteId,
      moduleOrder: [...moduleOrder],
      currentModule: 'intro',
      isComplete: false,
      isPaused: false,
    });
  },

  pause: () => {
    const { currentModule, isComplete } = get();
    if (isComplete || currentModule === null || currentModule === 'intro' || currentModule === 'complete') {
      return;
    }
    set({ isPaused: true });
  },

  resume: () => {
    set({ isPaused: false });
  },

  reset: () => {
    set({
      suiteId: null,
      moduleOrder: [],
      currentModule: null,
      isComplete: false,
      isPaused: false,
    });
  },

  getCurrentModuleIndex: () => {
    const { currentModule, moduleOrder } = get();
    if (currentModule === null || currentModule === 'intro') return -1;
    if (currentModule === 'complete') return moduleOrder.length;
    return moduleOrder.indexOf(currentModule);
  },

  getProgress: () => {
    const { currentModule, moduleOrder, suiteId } = get();
    const total = moduleOrder.length;

    let completed: number;
    if (currentModule === null || currentModule === 'intro') {
      completed = 0;
    } else if (currentModule === 'complete') {
      completed = total;
    } else {
      const idx = moduleOrder.indexOf(currentModule);
      completed = idx === -1 ? 0 : idx;
    }

    const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
    const estimatedMinutes = suiteId ? SUITES[suiteId].estimatedMinutes : 0;
    const avgMinutes = total === 0 ? 0 : estimatedMinutes / total;
    const remainingMinutes = Math.max(0, Math.round((total - completed) * avgMinutes));

    return { completed, total, percentage, remainingMinutes };
  },
}));
