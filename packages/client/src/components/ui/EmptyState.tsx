import React from 'react';
import { colors, spacing, fontSizes } from '../../lib/tokens.js';
import { Button } from './Button.js';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${spacing.xxl} ${spacing.xl}`,
        textAlign: 'center',
        minHeight: 200,
      }}
    >
      {icon && <div style={{ color: colors.overlay0, marginBottom: spacing.lg }}>{icon}</div>}
      <h3 style={{ color: colors.text, margin: 0, fontSize: fontSizes.lg }}>{title}</h3>
      {description && (
        <p style={{ color: colors.overlay1, fontSize: fontSizes.sm, marginTop: spacing.sm }}>
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} style={{ marginTop: spacing.lg }}>
          {action.label}
        </Button>
      )}
    </div>
  );
};
