/**
 * Runtime configuration constants for client-side MB Cursor-mode behaviors.
 *
 * Centralized here so `frontend-agent-tasks.md` L1001 / Round 2 Part 3 调整 4
 * tunables don't drift into individual components. Pure constants — no
 * React, no socket — so tests can import without setup.
 */

/**
 * Debounce window (ms) between a candidate's last keystroke and the inline
 * completion request firing. Per `回答Claud的30个问题.md` P1 Q17 and
 * `frontend-agent-tasks.md` L1001, 500ms balances latency (too long = typing
 * outruns completion) against request amplification (too short = spam).
 *
 * Monaco's CancellationToken for `provideInlineCompletions` is cancelled
 * automatically when a superseding call arrives, so the debounce doubles
 * as cancellation: if the candidate keeps typing, the awaited sleep wakes
 * to a cancelled token and we return `{items:[]}` without emitting.
 */
export const COMPLETION_DEBOUNCE_MS = 500;
