import React from 'react';
import { colors, spacing, radii, fontSizes } from '../../lib/tokens.js';

interface ScoreBarProps {
  score: number;
  maxScore: number;
  label?: string;
  color?: string;
  showValue?: boolean;
}

export const ScoreBar: React.FC<ScoreBarProps> = ({
  score,
  maxScore,
  label,
  color,
  showValue = true,
}) => {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const barColor =
    color || (pct >= 70 ? colors.green : pct >= 50 ? colors.yellow : colors.red);

  return (
    <div style={{ marginBottom: spacing.sm }}>
      {(label || showValue) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: fontSizes.sm,
            color: colors.subtext1,
            marginBottom: spacing.xs,
          }}
        >
          {label && <span>{label}</span>}
          {showValue && (
            <span>
              {score.toFixed(1)}/{maxScore}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          background: colors.surface1,
          borderRadius: radii.sm,
          height: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            background: barColor,
            borderRadius: radii.sm,
            height: '100%',
            width: `${Math.min(100, pct)}%`,
            transition: 'width 0.6s ease-out',
          }}
        />
      </div>
    </div>
  );
};
