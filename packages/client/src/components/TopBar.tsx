// TODO V5: Rename export TopBarV4 → TopBar (component name + export)
// TODO V5: Replace tier prop with suiteId if needed
// TODO V5: Update text: "CodeLens V4" → "CodeLens" (remove version indicator)
// TODO V5: Update store imports: useV4ModuleStore → useModuleStore
// TODO V5: Keep unchanged: Logo area, progress indicator, layout/styling
// Original V4 path: packages/client/src/components/v4/TopBarV4.tsx

/**
 * TopBarV4 — simplified module progress indicator for "AI 审判模式".
 *
 * Shows: tier label + linear module dots + current module Chinese label.
 * No timer yet — Week 3 Day 1 scope is pre-timer; timer wiring lands
 * alongside Module A when per-module time budgets become meaningful.
 */

import React from 'react';
import { useV4ModuleStore, type V4ModuleId } from '../../stores/v4-module.store.js';
import { colors, spacing, fontSizes, fontWeights, radii } from '../../lib/tokens.js';

const MODULE_LABELS: Record<V4ModuleId, string> = {
  phase0: '基线诊断',
  moduleA: 'AI 审判',
  mb1: '指挥 AI',
  mb2: '约束设计',
  moduleD: '系统设计',
  selfAssess: '自我评估',
  moduleC: '语音追问',
  complete: '完成',
};

const TIER_LABELS: Record<string, string> = {
  quick: '快筛 · 20 min',
  standard: '标准 · 45 min',
  campus: '校招 · 40 min',
  deep: '深度 · 75 min',
};

export const TopBarV4: React.FC = () => {
  const tier = useV4ModuleStore((s) => s.tier);
  const current = useV4ModuleStore((s) => s.current);
  const order = useV4ModuleStore((s) => s.order);

  const currentIdx = order.indexOf(current);
  // Hide the 'complete' sentinel from the visible progress row.
  const visible = order.filter((m) => m !== 'complete');

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
          CodeLens · AI 审判
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
          {TIER_LABELS[tier] ?? tier}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        {visible.map((id, idx) => {
          const visibleIdx = order.indexOf(id);
          const isActive = id === current;
          const isDone = visibleIdx < currentIdx;
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
              data-testid={`v4-step-${id}`}
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
              {idx < visible.length - 1 && (
                <span style={{ color: colors.surface1, marginLeft: spacing.xs }}>→</span>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
};
