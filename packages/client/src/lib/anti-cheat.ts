/**
 * Anti-cheat baseline — browser-level signal collection.
 *
 * Collects proctoring events via the existing behavior store pipeline.
 * Does NOT block any action — only records signals for S_proctor_integrity.
 *
 * Covers:
 *  1. Fullscreen exit detection (requestFullscreen + fullscreenchange)
 *  2. Window blur detection (focus leaving the assessment tab)
 *  3. External paste detection (>50 chars pasted outside AI chat)
 *  4. DevTools shortcut interception (Ctrl+Shift+I)
 *
 * Not covered (deferred):
 *  - Webcam / ProctorPiP (M2)
 *  - Face detection via Volcano CV (M2)
 *  - Network interception (sandbox NetworkMode=none handles this)
 */

import { useBehaviorStore } from '../stores/behavior.store.js';

const record = (type: string, payload: Record<string, unknown> = {}) =>
  useBehaviorStore.getState().record(type, payload);

let blurStart = 0;
let cleanupFns: Array<() => void> = [];

/**
 * Request fullscreen (best-effort, non-blocking).
 * Safari uses webkitRequestFullscreen.
 */
function requestFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen().catch(() => {});
    }
  } catch {
    // Fullscreen not supported — degrade silently
  }
}

/**
 * Initialize all anti-cheat listeners.
 * Call once when the IDE loads (before Phase 0).
 * Returns a cleanup function.
 */
export function initAntiCheat(): () => void {
  // Prevent double-init
  if (cleanupFns.length > 0) return () => destroyAntiCheat();

  // 1. Fullscreen — enter + monitor exits
  requestFullscreen();

  const onFullscreenChange = () => {
    if (!document.fullscreenElement) {
      record('proctor_fullscreen_exit');
    }
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  cleanupFns.push(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

  // 2. Window blur — track when focus leaves the tab
  const onBlur = () => {
    blurStart = Date.now();
    record('proctor_window_blur', { direction: 'out' });
  };
  const onFocus = () => {
    if (blurStart > 0) {
      const durationMs = Date.now() - blurStart;
      record('proctor_window_blur', { direction: 'in', durationMs });
      blurStart = 0;
    }
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  cleanupFns.push(
    () => window.removeEventListener('blur', onBlur),
    () => window.removeEventListener('focus', onFocus),
  );

  // 3. External paste detection (>50 chars outside AI chat panel)
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text') || '';
    if (text.length <= 50) return;

    // Allow paste inside AI chat input (not suspicious)
    const target = e.target as HTMLElement;
    if (target?.closest?.('[data-testid="ai-chat-input"]')) return;

    record('proctor_external_paste', {
      length: text.length,
      preview: text.substring(0, 100),
      targetTag: target?.tagName || 'unknown',
    });
  };
  document.addEventListener('paste', onPaste, true); // capture phase
  cleanupFns.push(() => document.removeEventListener('paste', onPaste, true));

  // 4. DevTools shortcut interception
  const onKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+I or Cmd+Option+I (Mac)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
      e.preventDefault();
      record('proctor_devtools_attempt');
    }
    // F12
    if (e.key === 'F12') {
      e.preventDefault();
      record('proctor_devtools_attempt');
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  cleanupFns.push(() => document.removeEventListener('keydown', onKeyDown, true));

  return () => destroyAntiCheat();
}

function destroyAntiCheat() {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
}
