import React from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { colors, spacing, fontSizes } from '../../lib/tokens.js';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  loading = false,
}) => {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <p style={{ color: colors.subtext1, fontSize: fontSizes.md, margin: 0, marginBottom: spacing.xl }}>
        {message}
      </p>
      <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant={variant === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={loading}>
          {loading ? 'Processing...' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
};
