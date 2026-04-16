import React from 'react';
import { colors, spacing, radii, fontSizes } from '../../lib/tokens';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  fullWidth?: boolean;
}

export const Input: React.FC<InputProps> = ({
  fullWidth = false,
  style,
  ...props
}) => {
  return (
    <input
      style={{
        backgroundColor: colors.base,
        color: colors.text,
        border: `1px solid ${colors.surface1}`,
        borderRadius: radii.md,
        padding: `${spacing.sm} ${spacing.md}`,
        fontSize: fontSizes.md,
        outline: 'none',
        width: fullWidth ? '100%' : undefined,
        ...style,
      }}
      {...props}
    />
  );
};
