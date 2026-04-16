import React from 'react';
import { colors, spacing, radii, fontSizes, fontWeights } from '../../lib/tokens.js';

interface FilterChip {
  value: string;
  label: string;
}

interface FilterChipsProps {
  chips: FilterChip[];
  selected: string;
  onChange: (value: string) => void;
}

export const FilterChips: React.FC<FilterChipsProps> = ({ chips, selected, onChange }) => {
  return (
    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
      {chips.map((chip) => (
        <button
          key={chip.value}
          onClick={() => onChange(chip.value)}
          style={{
            padding: `${spacing.xs} ${spacing.md}`,
            background: selected === chip.value ? colors.blue : colors.surface0,
            color: selected === chip.value ? colors.crust : colors.subtext1,
            border: 'none',
            borderRadius: radii.full,
            cursor: 'pointer',
            fontSize: fontSizes.sm,
            fontWeight: selected === chip.value ? fontWeights.semibold : fontWeights.normal,
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};
