/**
 * RadarChart — extracted from AdminDashboard L178-222
 * Enhanced with tokens colors, size prop, overlay mode, draw animation
 */

import React from 'react';
import { colors } from '../../lib/tokens.js';
import { DIMENSION_LABELS } from '../../lib/adminConstants.js';

interface RadarDataset {
  data: Record<string, number>;
  color?: string;
  label?: string;
}

interface RadarChartProps {
  data?: Record<string, number>;
  datasets?: RadarDataset[];
  size?: number;
}

const V1_DIMS = ['V1', 'V2', 'V3', 'V4', 'V5'];
const DEFAULT_COLORS = [colors.blue, colors.green, colors.peach, colors.mauve];

export const RadarChart: React.FC<RadarChartProps> = ({ data, datasets, size = 260 }) => {
  const allDatasets: RadarDataset[] = datasets || (data ? [{ data, color: colors.blue }] : []);
  // Derive dimension keys from data — support both V1 ('V1'..'V5') and V3 (Chinese labels)
  const firstData = allDatasets[0]?.data || {};
  const DIMS = Object.keys(firstData).length > 0 ? Object.keys(firstData) : V1_DIMS;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.35;

  const getPoint = (dimIndex: number, value: number) => {
    const angle = (Math.PI * 2 * dimIndex) / DIMS.length - Math.PI / 2;
    const v = Math.min(1, Math.max(0, value / 100));
    return {
      x: cx + r * v * Math.cos(angle),
      y: cy + r * v * Math.sin(angle),
    };
  };

  const gridLines = [0.25, 0.5, 0.75, 1.0].map((level) => {
    const pts = DIMS.map((_, i) => {
      const angle = (Math.PI * 2 * i) / DIMS.length - Math.PI / 2;
      return `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`;
    });
    return pts.join(' ');
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <style>{`
        @keyframes radarDraw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
        .radar-poly { stroke-dasharray: 1000; animation: radarDraw 0.8s ease-out forwards; }
      `}</style>

      {/* Grid */}
      {gridLines.map((pts, i) => (
        <polygon
          key={i}
          points={pts}
          fill="none"
          stroke={colors.surface1}
          strokeWidth="0.5"
        />
      ))}

      {/* Axis lines */}
      {DIMS.map((_, i) => {
        const angle = (Math.PI * 2 * i) / DIMS.length - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + r * Math.cos(angle)}
            y2={cy + r * Math.sin(angle)}
            stroke={colors.surface2}
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygons */}
      {allDatasets.map((ds, dsIdx) => {
        const dsColor = ds.color || DEFAULT_COLORS[dsIdx % DEFAULT_COLORS.length];
        const points = DIMS.map((dim, i) => {
          const p = getPoint(i, ds.data[dim] || 0);
          return `${p.x},${p.y}`;
        }).join(' ');

        return (
          <React.Fragment key={dsIdx}>
            <polygon
              className="radar-poly"
              points={points}
              fill={`${dsColor}33`}
              stroke={dsColor}
              strokeWidth="2"
            />
            {DIMS.map((dim, i) => {
              const p = getPoint(i, ds.data[dim] || 0);
              return <circle key={i} cx={p.x} cy={p.y} r="3.5" fill={dsColor} />;
            })}
          </React.Fragment>
        );
      })}

      {/* Labels */}
      {DIMS.map((dim, i) => {
        const angle = (Math.PI * 2 * i) / DIMS.length - Math.PI / 2;
        const lx = cx + (r + 22) * Math.cos(angle);
        const ly = cy + (r + 22) * Math.sin(angle);
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={colors.subtext0}
            fontSize="11"
          >
            {DIMENSION_LABELS[dim] ?? dim}
          </text>
        );
      })}
    </svg>
  );
};
