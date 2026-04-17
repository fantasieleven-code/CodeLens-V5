/**
 * InlineCompletionProvider — headless component that registers a Monaco
 * inline-completions provider for MB Cursor-mode and bridges it to the
 * v5:mb:completion_request / v5:mb:completion_response socket events.
 *
 * Task 7.3 (frontend-agent-tasks.md L625-663) + Round 2 Part 3 调整 4
 * (v5-design-clarifications.md L607-642 TypeScript example).
 *
 * Why a headless component (returns null):
 *   Monaco's provider API is side-effecty — the registration point isn't
 *   a ReactNode. Keeping this component headless lets Task 7.6 ModuleBPage
 *   mount it alongside MultiFileEditor without worrying about layout.
 *
 * Debounce:
 *   Monaco passes a CancellationToken into provideInlineCompletions that
 *   gets cancelled as soon as a superseding call fires (i.e., the next
 *   keystroke). We `await sleep(COMPLETION_DEBOUNCE_MS)` inside the
 *   provider and check the token on both sides — typing faster than
 *   500ms naturally short-circuits the request without ever hitting the
 *   socket. The AbortController layered on top cancels the pending
 *   socket-response listener so the stale response is discarded.
 *
 * Accept / reject detection (Round 2 调整 4):
 *   Monaco 0.55 provides `handleEndOfLifetime(completions, item, reason)`
 *   which fires with an explicit `InlineCompletionEndOfLifeReasonKind`:
 *   Accepted (0) / Rejected (1) / Ignored (2). Accepted = Tab. Rejected =
 *   explicit dismissal (Esc). Ignored = user typed something that didn't
 *   match (includes `userTypingDisagreed: true`). We fold Ignored into
 *   "rejected" for V5.0 since the candidate-facing contract is just
 *   "accepted vs not", and sDecisionLatencyQuality doesn't distinguish.
 *
 * Visibility:
 *   Reuses `startVisibilityTracker` from chat-visibility-tracker.ts
 *   directly. That util's exports are already generic (the file is named
 *   for its first consumer; the docstring anticipates this reuse), so no
 *   rename / new factory is needed — aligns with Steve's "不改原接口向后
 *   兼容" guidance.
 *
 * Not in scope:
 *   - MultiFileEditor integration (Task 7.6)
 *   - Streaming completions (V5.1)
 *   - Partial-accept tracking (Monaco fires handlePartialAccept but V5.0
 *     only tracks binary accept/reject for sDecisionLatencyQuality)
 */

import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import type {
  V5MBCompletionRequestPayload,
  V5MBCompletionResponsePayload,
} from '@codelens-v5/shared';
import { getSocket } from '../../lib/socket.js';
import { COMPLETION_DEBOUNCE_MS } from '../../lib/runtime.js';
import {
  startVisibilityTracker,
  type VisibilityTrackerHandle,
  type VisibilityTrackerOptions,
} from '../../utils/chat-visibility-tracker.js';
import type { UseBehaviorTrackerReturn } from '../../hooks/useBehaviorTracker.js';

export interface InlineCompletionProviderProps {
  sessionId: string;
  monacoInstance: typeof Monaco;
  languageIds: string[];
  getCurrentFilePath: () => string;
  /** When false, the provider isn't registered. Parent flips this off while a diff is pending. */
  enabled?: boolean;
  /** Debounce ms; defaults to COMPLETION_DEBOUNCE_MS. Exposed for tests. */
  debounceMs?: number;
  behaviorTracker?: Pick<UseBehaviorTrackerReturn, 'track'>;
  /** Injectable for tests (defaults to `getSocket()`). */
  socket?: ReturnType<typeof getSocket>;
  /** Injectable visibility options forwarded to startVisibilityTracker. */
  visibilityOptions?: VisibilityTrackerOptions;
  /** Injectable debounce sleep for tests; defaults to AbortSignal-aware setTimeout. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

interface ActiveCompletion {
  tracker: VisibilityTrackerHandle;
  lineNumber: number;
  completionLength: number;
  completion: string;
  filePath: string;
}

export function InlineCompletionProvider(props: InlineCompletionProviderProps): null {
  const {
    sessionId,
    monacoInstance,
    languageIds,
    getCurrentFilePath,
    enabled = true,
    debounceMs = COMPLETION_DEBOUNCE_MS,
    behaviorTracker,
    socket: injectedSocket,
    visibilityOptions,
    sleep = defaultSleep,
  } = props;

  // activeByItem maps each InlineCompletion item reference to its ActiveCompletion
  // record. Monaco guarantees the same object reference across provide → handleEndOfLifetime
  // → disposeInlineCompletions, so we key on the item itself.
  const activeByItemRef = useRef<WeakMap<object, ActiveCompletion>>(new WeakMap());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || languageIds.length === 0) return;

    const socket = injectedSocket ?? getSocket();
    const activeByItem = activeByItemRef.current;

    const providerDisposables = languageIds.map((lang) =>
      monacoInstance.languages.registerInlineCompletionsProvider(lang, {
        provideInlineCompletions: async (model, position, _context, token) => {
          if (token.isCancellationRequested) return { items: [] };

          // Abort any in-flight previous request — its socket listener
          // unsubscribes and its promise resolves null.
          abortRef.current?.abort();
          const abortController = new AbortController();
          abortRef.current = abortController;

          // Debounce: if the candidate keeps typing, the Monaco token
          // and/or our AbortController cancel during this sleep, and we
          // short-circuit without emitting.
          try {
            await sleep(debounceMs, abortController.signal);
          } catch {
            return { items: [] };
          }
          if (token.isCancellationRequested || abortController.signal.aborted) {
            return { items: [] };
          }

          const filePath = getCurrentFilePath();
          const payload: V5MBCompletionRequestPayload = {
            sessionId,
            filePath,
            content: model.getValue(),
            line: position.lineNumber,
            column: position.column,
          };

          const response = await requestCompletion(socket, payload, abortController.signal);

          if (!response || response.completion.length === 0) return { items: [] };
          if (token.isCancellationRequested || abortController.signal.aborted) {
            return { items: [] };
          }

          const tracker = startVisibilityTracker(visibilityOptions);
          const item = {
            insertText: response.completion,
          };
          activeByItem.set(item, {
            tracker,
            lineNumber: position.lineNumber,
            completionLength: response.completion.length,
            completion: response.completion,
            filePath,
          });

          behaviorTracker?.track('ai_completion_shown', {
            filePath,
            line: position.lineNumber,
            completionLength: response.completion.length,
          });

          return { items: [item] };
        },
        handleEndOfLifetime: (_completions, item, reason) => {
          const active = activeByItem.get(item);
          if (!active) return;
          activeByItem.delete(item);
          const accepted =
            reason.kind === monacoInstance.languages.InlineCompletionEndOfLifeReasonKind.Accepted;
          finalizeCompletion(active, accepted, behaviorTracker);
        },
        disposeInlineCompletions: (completions) => {
          // Safety net: if handleEndOfLifetime wasn't called (e.g., the
          // completion was shown then the provider torn down before a
          // reason was determined), cancel trackers here to avoid leaks.
          // We don't emit responded — the candidate didn't respond.
          for (const item of completions.items) {
            const active = activeByItem.get(item);
            if (!active) continue;
            activeByItem.delete(item);
            active.tracker.cancel();
          }
        },
      }),
    );

    return () => {
      providerDisposables.forEach((d) => d.dispose());
      abortRef.current?.abort();
      abortRef.current = null;
      // activeByItemRef itself is a WeakMap — its entries die with the
      // corresponding Monaco item objects. disposeInlineCompletions
      // already cancels any active trackers.
    };
  }, [
    enabled,
    languageIds,
    sessionId,
    monacoInstance,
    getCurrentFilePath,
    debounceMs,
    behaviorTracker,
    injectedSocket,
    visibilityOptions,
    sleep,
  ]);

  return null;
}

function finalizeCompletion(
  active: ActiveCompletion,
  accepted: boolean,
  behaviorTracker: Pick<UseBehaviorTrackerReturn, 'track'> | undefined,
): void {
  const result = active.tracker.responded();
  const eventType = accepted ? 'ai_completion_accepted' : 'ai_completion_rejected';
  behaviorTracker?.track(eventType, {
    filePath: active.filePath,
    line: active.lineNumber,
    completionLength: active.completionLength,
    accepted,
  });
  behaviorTracker?.track('ai_completion_responded', {
    filePath: active.filePath,
    line: active.lineNumber,
    completionLength: active.completionLength,
    accepted,
    shown: true,
    rejected: !accepted,
    shownAt: result.shownAt,
    respondedAt: result.respondedAt,
    documentVisibleMs: result.documentVisibleMs,
  });
}

function requestCompletion(
  socket: ReturnType<typeof getSocket>,
  payload: V5MBCompletionRequestPayload,
  signal: AbortSignal,
): Promise<V5MBCompletionResponsePayload | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }
    const onResponse = (data: V5MBCompletionResponsePayload) => {
      cleanup();
      resolve(data);
    };
    const onAbort = () => {
      cleanup();
      resolve(null);
    };
    const cleanup = () => {
      socket.off('v5:mb:completion_response', onResponse);
      signal.removeEventListener('abort', onAbort);
    };
    socket.once('v5:mb:completion_response', onResponse);
    signal.addEventListener('abort', onAbort);
    socket.emit('v5:mb:completion_request', payload);
  });
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort);
  });
}
