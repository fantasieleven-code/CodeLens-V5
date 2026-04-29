/**
 * Brief #15 · candidate-facing module-content fetch hook.
 *
 * 4-state machine matches `session.store.loadSession` (D17): idle → loading
 * → loaded | error. Uses relative URL via vite proxy (Brief #13 C5 pattern).
 */

import { useEffect, useState } from 'react';
import type { CandidateModuleViewByType } from '@codelens-v5/shared';

export type CandidateModuleType = 'p0' | 'ma' | 'mb' | 'mc' | 'md' | 'se';

type CandidateViewFor<T extends CandidateModuleType> = T extends 'p0'
  ? CandidateModuleViewByType['P0']
  : T extends 'ma'
    ? CandidateModuleViewByType['MA']
    : T extends 'mb'
      ? CandidateModuleViewByType['MB']
      : T extends 'mc'
        ? CandidateModuleViewByType['MC']
        : T extends 'md'
          ? CandidateModuleViewByType['MD']
          : CandidateModuleViewByType['SE'];

export type ModuleContentState<T extends CandidateModuleType = CandidateModuleType> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: CandidateViewFor<T> }
  | { status: 'error'; message: string };

/**
 * Fetch the candidate-safe module-content view for the given exam + module.
 */
export function useModuleContent<T extends CandidateModuleType>(
  examInstanceId: string | null,
  moduleType: T,
): ModuleContentState<T> {
  const [state, setState] = useState<ModuleContentState<T>>({ status: 'idle' });

  useEffect(() => {
    if (!examInstanceId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    (async () => {
      try {
        const url = `/api/v5/exam/${examInstanceId}/module/${moduleType}`;
        const response = await fetch(url);
        if (cancelled) return;
        if (response.status === 404) {
          setState({ status: 'error', message: '未找到模块内容' });
          return;
        }
        if (!response.ok) {
          setState({ status: 'error', message: `加载失败 (${response.status})` });
          return;
        }
        const data = (await response.json()) as CandidateViewFor<T>;
        if (cancelled) return;
        setState({ status: 'loaded', data });
      } catch {
        if (cancelled) return;
        setState({ status: 'error', message: '网络错误' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examInstanceId, moduleType]);

  return state;
}
