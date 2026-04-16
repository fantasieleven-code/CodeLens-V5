import React, { useState, useEffect, useRef } from 'react';
import { colors, spacing, radii, fontSizes } from '../../lib/tokens.js';
import { Search, X } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounce?: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  debounce = 300,
}) => {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), debounce);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Search
        size={14}
        style={{
          position: 'absolute',
          left: spacing.sm,
          color: colors.overlay0,
          pointerEvents: 'none',
        }}
      />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: colors.surface0,
          color: colors.text,
          border: `1px solid ${colors.surface1}`,
          borderRadius: radii.md,
          padding: `${spacing.sm} ${spacing.md}`,
          paddingLeft: 32,
          paddingRight: local ? 32 : spacing.md,
          fontSize: fontSizes.sm,
          outline: 'none',
          width: 240,
        }}
      />
      {local && (
        <button
          onClick={() => handleChange('')}
          style={{
            position: 'absolute',
            right: spacing.sm,
            background: 'none',
            border: 'none',
            color: colors.overlay0,
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
