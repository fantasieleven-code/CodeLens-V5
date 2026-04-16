import React from 'react';
import { colors, spacing, radii, fontSizes, fontWeights } from '../../lib/tokens';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: colors.surface1, text: colors.text },
  success: { bg: colors.green, text: colors.crust },
  warning: { bg: colors.yellow, text: colors.crust },
  danger: { bg: colors.red, text: colors.crust },
  info: { bg: colors.blue, text: colors.crust },
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  style,
  ...props
}) => {
  const vc = variantColors[variant];
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: vc.bg,
        color: vc.text,
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: radii.full,
        fontSize: fontSizes.xs,
        fontWeight: fontWeights.semibold,
        lineHeight: 1,
        ...style,
      }}
      {...props}
    />
  );
};
