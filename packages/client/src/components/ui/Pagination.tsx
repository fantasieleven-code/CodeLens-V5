import React from 'react';
import { colors, spacing, radii, fontSizes } from '../../lib/tokens.js';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, total, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const btnStyle: React.CSSProperties = {
    padding: `${spacing.xs} ${spacing.sm}`,
    background: colors.surface0,
    color: colors.text,
    border: 'none',
    borderRadius: radii.sm,
    cursor: 'pointer',
    fontSize: fontSizes.sm,
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: `${spacing.lg} 0`,
      }}
    >
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={{ ...btnStyle, opacity: page <= 1 ? 0.4 : 1 }}
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ color: colors.subtext0, fontSize: fontSizes.sm }}>
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        style={{ ...btnStyle, opacity: page >= totalPages ? 0.4 : 1 }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};
