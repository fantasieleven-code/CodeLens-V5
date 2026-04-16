import React from 'react';
import { colors, spacing, fontSizes, fontWeights } from '../../lib/tokens.js';

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, active, onChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        borderBottom: `1px solid ${colors.surface1}`,
        marginBottom: spacing.xl,
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: `${spacing.sm} ${spacing.lg}`,
            background: 'transparent',
            color: active === tab.id ? colors.blue : colors.overlay1,
            border: 'none',
            borderBottom: `2px solid ${active === tab.id ? colors.blue : 'transparent'}`,
            cursor: 'pointer',
            fontSize: fontSizes.md,
            fontWeight: active === tab.id ? fontWeights.semibold : fontWeights.normal,
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
