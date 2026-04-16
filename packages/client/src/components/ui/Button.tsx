import React, { useState } from 'react';
import { colors, spacing, radii, fontSizes, fontWeights } from '../../lib/tokens';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, { base: React.CSSProperties; hover: React.CSSProperties }> = {
  primary: {
    base: {
      backgroundColor: colors.blue,
      color: colors.crust,
      border: 'none',
    },
    hover: {
      backgroundColor: colors.sapphire,
    },
  },
  secondary: {
    base: {
      backgroundColor: colors.surface0,
      color: colors.text,
      border: `1px solid ${colors.surface1}`,
    },
    hover: {
      backgroundColor: colors.surface1,
    },
  },
  danger: {
    base: {
      backgroundColor: colors.red,
      color: colors.crust,
      border: 'none',
    },
    hover: {
      backgroundColor: colors.maroon,
    },
  },
  ghost: {
    base: {
      backgroundColor: 'transparent',
      color: colors.text,
      border: 'none',
    },
    hover: {
      backgroundColor: colors.surface0,
    },
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: `${spacing.xs} ${spacing.sm}`, fontSize: fontSizes.sm },
  md: { padding: `${spacing.sm} ${spacing.lg}`, fontSize: fontSizes.md },
  lg: { padding: `${spacing.md} ${spacing.xl}`, fontSize: fontSizes.lg },
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  ...props
}) => {
  const [hovered, setHovered] = useState(false);
  const vStyle = variantStyles[variant];

  return (
    <button
      style={{
        borderRadius: radii.md,
        fontWeight: fontWeights.medium,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 0.15s, opacity 0.15s',
        ...vStyle.base,
        ...(hovered && !disabled ? vStyle.hover : {}),
        ...sizeStyles[size],
        ...style,
      }}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    />
  );
};
