import React from 'react';
import { colors, spacing, radii, shadows } from '../../lib/tokens';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
}

const paddingMap = { sm: spacing.sm, md: spacing.lg, lg: spacing.xl };

export const Card: React.FC<CardProps> = ({
  padding = 'md',
  style,
  ...props
}) => {
  return (
    <div
      style={{
        backgroundColor: colors.surface0,
        borderRadius: radii.lg,
        padding: paddingMap[padding],
        boxShadow: shadows.sm,
        ...style,
      }}
      {...props}
    />
  );
};
