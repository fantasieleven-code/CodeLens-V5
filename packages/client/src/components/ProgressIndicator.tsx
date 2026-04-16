/**
 * ProgressIndicator — linear dot-trail of module progress.
 *
 * Subscribes to moduleStore directly (no props for data). Renders one dot
 * per module with three visual states: done (✓), active (● highlighted),
 * pending (hollow). Below the trail shows "已完成 N/M 模块" and an optional
 * "剩余约 X 分钟" (derived from suite.estimatedMinutes and completed count).
 */

import React from 'react';
import type { V5ModuleKey } from '@codelens-v5/shared';
import { useModuleStore } from '../stores/module.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

const MODULE_SHORT_LABELS: Record<V5ModuleKey, string> = {
  phase0: 'P0',
  moduleA: 'MA',
  mb: 'MB',
  moduleD: 'MD',
  selfAssess: 'SE',
  moduleC: 'MC',
};

export interface ProgressIndicatorProps {
  compact?: boolean;
  showMinutes?: boolean;
}

type DotState = 'done' | 'active' | 'pending';

function dotStateFor(
  id: V5ModuleKey,
  currentModule: ReturnType<typeof useModuleStore.getState>['currentModule'],
  moduleOrder: V5ModuleKey[],
): DotState {
  if (currentModule === 'complete') return 'done';
  if (currentModule === id) return 'active';
  const currentIdx =
    currentModule === null || currentModule === 'intro'
      ? -1
      : moduleOrder.indexOf(currentModule);
  const thisIdx = moduleOrder.indexOf(id);
  return thisIdx < currentIdx ? 'done' : 'pending';
}

export const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  compact = false,
  showMinutes = true,
}) => {
  const currentModule = useModuleStore((s) => s.currentModule);
  const moduleOrder = useModuleStore((s) => s.moduleOrder);
  const getProgress = useModuleStore((s) => s.getProgress);
  const progress = getProgress();

  if (moduleOrder.length === 0) return null;

  const dotSize = compact ? 10 : 14;
  const gap = compact ? spacing.sm : spacing.md;

  return (
    <div
      data-testid="progress-indicator-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? spacing.xs : spacing.sm,
        padding: compact ? spacing.sm : spacing.md,
        backgroundColor: colors.mantle,
        borderRadius: radii.md,
        border: `1px solid ${colors.surface0}`,
      }}
    >
      {!compact && (
        <div
          style={{
            fontSize: fontSizes.sm,
            fontWeight: fontWeights.semibold,
            color: colors.subtext1,
          }}
        >
          评估进度
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap,
        }}
      >
        {moduleOrder.map((id, idx) => {
          const state = dotStateFor(id, currentModule, moduleOrder);
          const bg =
            state === 'done'
              ? colors.green
              : state === 'active'
                ? colors.blue
                : 'transparent';
          const border =
            state === 'pending' ? `2px solid ${colors.surface2}` : 'none';
          return (
            <React.Fragment key={id}>
              <div
                data-testid={`progress-module-${id}`}
                data-state={state}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <div
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: '50%',
                    backgroundColor: bg,
                    border,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: colors.base,
                    fontSize: 9,
                    fontWeight: fontWeights.bold,
                    transition: 'background-color 0.2s',
                  }}
                >
                  {state === 'done' ? '✓' : ''}
                </div>
                {!compact && (
                  <span
                    style={{
                      fontSize: fontSizes.xs,
                      color:
                        state === 'active' ? colors.text : colors.overlay1,
                      fontWeight:
                        state === 'active'
                          ? fontWeights.semibold
                          : fontWeights.normal,
                    }}
                  >
                    {MODULE_SHORT_LABELS[id]}
                  </span>
                )}
              </div>
              {idx < moduleOrder.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor:
                      state === 'done' ? colors.green : colors.surface1,
                    minWidth: 12,
                    maxWidth: 40,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          fontSize: fontSizes.xs,
          color: colors.subtext0,
        }}
      >
        <span data-testid="progress-completed-count">
          已完成 {progress.completed}/{progress.total} 模块
        </span>
        {showMinutes && (
          <>
            <span style={{ color: colors.overlay0 }}>·</span>
            <span data-testid="progress-remaining-minutes">
              剩余约 {progress.remainingMinutes} 分钟
            </span>
          </>
        )}
      </div>
    </div>
  );
};
