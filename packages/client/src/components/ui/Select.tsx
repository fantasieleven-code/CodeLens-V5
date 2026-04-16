import React from 'react';
import { colors, spacing, radii, fontSizes } from '../../lib/tokens.js';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  style,
  ...props
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: colors.surface0,
        color: colors.text,
        border: `1px solid ${colors.surface1}`,
        borderRadius: radii.md,
        padding: `${spacing.sm} ${spacing.md}`,
        fontSize: fontSizes.sm,
        outline: 'none',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
