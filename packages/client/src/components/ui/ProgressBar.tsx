import React from 'react';
import { colors, radii } from '../../lib/tokens.js';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  showLabel?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  color,
  height = 6,
  showLabel = false,
}) => {
  const pct = Math.min(100, (value / max) * 100);
  const barColor = color || (pct >= 70 ? colors.green : pct >= 50 ? colors.yellow : colors.red);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          background: colors.surface1,
          borderRadius: radii.sm,
          height,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: barColor,
            borderRadius: radii.sm,
            height: '100%',
            width: `${pct}%`,
            transition: 'width 0.6s ease-out',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ color: colors.subtext0, fontSize: 12, minWidth: 36, textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
};
