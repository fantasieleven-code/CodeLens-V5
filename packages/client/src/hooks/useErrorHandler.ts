import { useEffect } from 'react';
import { useSessionStore } from '../stores/session.store.js';
import { useAIStore } from '../stores/ai.store.js';
import { parseErrorMessage } from '../components/ErrorBoundary.js';

/**
 * AR-6: Hook that monitors WS/AI errors and surfaces them as toast notifications.
 * Should be called once at the top-level layout.
 */
export function useErrorHandler() {
  const setWarning = useSessionStore((s) => s.setWarning);

  useEffect(() => {
    let prevError: string | null = null;

    const unsubscribe = useAIStore.subscribe((state) => {
      if (state.error && state.error !== prevError) {
        setWarning(parseErrorMessage(state.error));
      }
      prevError = state.error;
    });

    return unsubscribe;
  }, [setWarning]);
}
