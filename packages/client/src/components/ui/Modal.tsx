import React, { useEffect, useCallback } from 'react';
import { colors, spacing, radii, shadows } from '../../lib/tokens.js';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: number;
}

export const Modal: React.FC<ModalProps> = ({ open, onClose, title, children, width = 520 }) => {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.mantle,
          borderRadius: radii.lg,
          boxShadow: shadows.lg,
          width,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflow: 'auto',
          animation: 'slideUp 0.2s ease-out',
        }}
      >
        {title && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: `${spacing.lg} ${spacing.xl}`,
              borderBottom: `1px solid ${colors.surface0}`,
            }}
          >
            <h3 style={{ color: colors.text, margin: 0, fontSize: 16 }}>{title}</h3>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: colors.overlay1,
                cursor: 'pointer',
                padding: spacing.xs,
                borderRadius: radii.sm,
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div style={{ padding: spacing.xl }}>{children}</div>
      </div>
    </div>
  );
};
