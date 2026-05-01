/**
 * ModuleShell — shared chrome for in-flight module pages.
 *
 * Wraps each module page with:
 *   - TopBar (suite label + linear module trail)
 *   - ProgressIndicator (detailed progress with minute estimate)
 *   - Pause banner overlay when isPaused
 *   - Pause / Resume control in the header strip
 *
 * Keeps the pause flag local-only: the store flips isPaused, and a callback
 * hook (onPauseChange) lets tests or embedding shells observe the UI state
 * transition without implying backend time-bank semantics.
 */

import React from 'react';
import { useModuleStore } from '../stores/module.store.js';
import { TopBar } from './TopBar.js';
import { ProgressIndicator } from './ProgressIndicator.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

export interface ModuleShellProps {
  children: React.ReactNode;
  /**
   * Fires after pause state flips. This is observation-only; ModuleShell does
   * not emit pause/resume socket events in V5.0.
   */
  onPauseChange?: (paused: boolean) => void;
}

export const ModuleShell: React.FC<ModuleShellProps> = ({
  children,
  onPauseChange,
}) => {
  const isPaused = useModuleStore((s) => s.isPaused);
  const pause = useModuleStore((s) => s.pause);
  const resume = useModuleStore((s) => s.resume);
  const currentModule = useModuleStore((s) => s.currentModule);

  const canPause =
    currentModule !== null &&
    currentModule !== 'intro' &&
    currentModule !== 'complete';

  const handleTogglePause = () => {
    if (isPaused) {
      resume();
      onPauseChange?.(false);
    } else {
      pause();
      onPauseChange?.(true);
    }
  };

  return (
    <div style={styles.shell} data-testid="module-shell">
      <TopBar />

      <div style={styles.controlStrip}>
        <ProgressIndicator compact />
        <button
          type="button"
          data-testid="module-shell-pause-toggle"
          onClick={handleTogglePause}
          disabled={!canPause}
          style={{
            ...styles.pauseBtn,
            ...(canPause ? {} : styles.pauseBtnDisabled),
          }}
        >
          {isPaused ? '继续评估' : '暂停评估'}
        </button>
      </div>

      <main style={styles.body}>{children}</main>

      {isPaused && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="module-shell-pause-overlay"
          style={styles.overlay}
        >
          <div style={styles.overlayCard}>
            <h2 style={styles.overlayTitle}>评估已暂停</h2>
            <p style={styles.overlayBody}>
              你可以随时继续。暂停不会延长会话时限 —— 剩余时间仍在流逝。
            </p>
            <button
              type="button"
              data-testid="module-shell-overlay-resume"
              onClick={handleTogglePause}
              style={styles.overlayBtn}
            >
              继续评估
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    backgroundColor: colors.base,
  },
  controlStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: spacing.md,
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.base,
    borderBottom: `1px solid ${colors.surface0}`,
  },
  pauseBtn: {
    padding: `${spacing.xs} ${spacing.md}`,
    backgroundColor: colors.surface0,
    border: `1px solid ${colors.surface1}`,
    borderRadius: radii.sm,
    color: colors.subtext1,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginLeft: 'auto',
    transition: 'background-color 0.15s',
  },
  pauseBtnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: `${spacing.xl} ${spacing.lg}`,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
    boxSizing: 'border-box' as const,
  },
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(17, 17, 27, 0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  overlayCard: {
    maxWidth: 400,
    padding: spacing.xxl,
    backgroundColor: colors.mantle,
    borderRadius: radii.lg,
    border: `1px solid ${colors.surface1}`,
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    textAlign: 'center' as const,
  },
  overlayTitle: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.bold,
    color: colors.text,
    margin: 0,
  },
  overlayBody: {
    fontSize: fontSizes.sm,
    color: colors.subtext0,
    lineHeight: 1.6,
    margin: 0,
  },
  overlayBtn: {
    padding: `${spacing.sm} ${spacing.xl}`,
    backgroundColor: colors.mauve,
    border: 'none',
    borderRadius: radii.md,
    color: colors.base,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.semibold,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: spacing.sm,
  },
};
