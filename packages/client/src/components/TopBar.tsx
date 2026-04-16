/**
 * TopBar — simplified module progress indicator.
 *
 * Shows: suite label + linear module dots + current module Chinese label.
 * No timer yet — per-module time budgets wire in alongside Module A.
 */

import React from 'react';
import type { V5ModuleKey, SuiteId } from '@codelens-v5/shared';
import { useModuleStore } from '../stores/module.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../lib/tokens.js';

const MODULE_LABELS: Record<V5ModuleKey, string> = {
  phase0: '基线诊断',
  moduleA: 'AI 审判',
  mb: 'Cursor 协作',
  moduleD: '系统设计',
  selfAssess: '自我评估',
  moduleC: '语音追问',
};

const SUITE_LABELS: Record<SuiteId, string> = {
  full_stack: '全栈',
  architect: '架构师',
  ai_engineer: 'AI 工程师',
  quick_screen: '快筛',
  deep_dive: '深度',
};

export const TopBar: React.FC = () => {
  const suiteId = useModuleStore((s) => s.suiteId);
  const currentModule = useModuleStore((s) => s.currentModule);
  const moduleOrder = useModuleStore((s) => s.moduleOrder);

  // 'complete' / null → all dots done; 'intro' → none done; ModuleKey → indexOf
  const currentIdx =
    currentModule === 'complete' || currentModule === null
      ? moduleOrder.length
      : currentModule === 'intro'
        ? -1
        : moduleOrder.indexOf(currentModule);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${spacing.md} ${spacing.xl}`,
        backgroundColor: colors.mantle,
        borderBottom: `1px solid ${colors.surface0}`,
        minHeight: 56,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.lg }}>
        <span
          style={{
            fontSize: fontSizes.md,
            fontWeight: fontWeights.semibold,
            color: colors.mauve,
            letterSpacing: '0.5px',
          }}
        >
          CodeLens
        </span>
        <span
          style={{
            fontSize: fontSizes.sm,
            color: colors.subtext0,
            padding: `2px ${spacing.sm}`,
            borderRadius: radii.sm,
            backgroundColor: colors.surface0,
          }}
        >
          {suiteId ? (SUITE_LABELS[suiteId] ?? suiteId) : ''}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        {moduleOrder.map((id, idx) => {
          const isActive = id === currentModule;
          const isDone = idx < currentIdx;
          const color = isDone ? colors.green : isActive ? colors.blue : colors.surface2;
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                fontSize: fontSizes.xs,
                color: isActive ? colors.text : colors.overlay1,
                fontWeight: isActive ? fontWeights.semibold : fontWeights.normal,
              }}
              data-testid={`step-${id}`}
              data-active={isActive || undefined}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: color,
                  transition: 'background-color 0.2s',
                }}
              />
              <span>{MODULE_LABELS[id]}</span>
              {idx < moduleOrder.length - 1 && (
                <span style={{ color: colors.surface1, marginLeft: spacing.xs }}>→</span>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
};
