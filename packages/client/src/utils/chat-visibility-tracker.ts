/**
 * ChatVisibilityTracker — MB Cursor-mode visibility ms accounting.
 *
 * Round 2 Part 3 调整 4 (v5-design-clarifications.md L550-588) requires
 * every AI-diff and inline-completion decision to carry a documentVisibleMs
 * field so sDecisionLatencyQuality can distinguish "candidate thought about
 * the suggestion" from "candidate tabbed away." This module provides a
 * reusable timer that:
 *
 *  1. starts on `shown()` with the current wall-clock + visibility state,
 *  2. listens for visibilitychange to accumulate only foreground ms, and
 *  3. on `responded()` returns the final `{shownAt, respondedAt, documentVisibleMs}`.
 *
 * Task 7.3 InlineCompletionProvider will reuse this verbatim for per-
 * completion tracking; Task 7.6 integration wires the top-level
 * documentVisibilityEvents[] stream separately.
 *
 * jsdom-friendly: all browser hooks go through the injected `now` and
 * `isHidden` getters so tests can drive time and visibility without
 * touching the real `document` or `Date`.
 */

export interface VisibilityTrackingResult {
  shownAt: number;
  respondedAt: number;
  documentVisibleMs: number;
}

export interface VisibilityTrackerOptions {
  now?: () => number;
  isHidden?: () => boolean;
  /** Subscribe to visibilitychange; return an unsubscribe. Defaults to document.addEventListener. */
  onVisibilityChange?: (handler: () => void) => () => void;
}

export interface VisibilityTrackerHandle {
  shownAt: number;
  responded: () => VisibilityTrackingResult;
  cancel: () => void;
}

export function startVisibilityTracker(
  options: VisibilityTrackerOptions = {},
): VisibilityTrackerHandle {
  const now = options.now ?? (() => Date.now());
  const isHidden = options.isHidden ?? (() => defaultIsHidden());
  const onVisibilityChange = options.onVisibilityChange ?? defaultOnVisibilityChange;

  const shownAt = now();
  let visibleMs = 0;
  let segmentStart = isHidden() ? null : shownAt;

  const unsubscribe = onVisibilityChange(() => {
    const t = now();
    if (isHidden()) {
      if (segmentStart !== null) {
        visibleMs += t - segmentStart;
        segmentStart = null;
      }
    } else if (segmentStart === null) {
      segmentStart = t;
    }
  });

  let responded = false;

  return {
    shownAt,
    responded(): VisibilityTrackingResult {
      if (responded) {
        throw new Error('responded() called twice on the same tracker');
      }
      responded = true;
      const respondedAt = now();
      if (segmentStart !== null) {
        visibleMs += respondedAt - segmentStart;
        segmentStart = null;
      }
      unsubscribe();
      return { shownAt, respondedAt, documentVisibleMs: visibleMs };
    },
    cancel(): void {
      if (responded) return;
      responded = true;
      unsubscribe();
    },
  };
}

function defaultIsHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function defaultOnVisibilityChange(handler: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}
