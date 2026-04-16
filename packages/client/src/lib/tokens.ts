/**
 * Design Tokens (AR-14) — Catppuccin Mocha palette
 *
 * Single source of truth for colors, spacing, typography, and radii.
 */

export const colors = {
  // Catppuccin Mocha base
  base: '#1e1e2e',
  mantle: '#181825',
  crust: '#11111b',
  surface0: '#313244',
  surface1: '#45475a',
  surface2: '#585b70',
  overlay0: '#6c7086',  // Low contrast — use for decorative/non-essential text only
  overlay1: '#7f849c',  // WCAG AA on crust/mantle backgrounds
  overlay2: '#9399b2',  // Safe for all dark backgrounds
  subtext0: '#a6adc8',
  subtext1: '#bac2de',
  text: '#cdd6f4',

  // Accent colors
  rosewater: '#f5e0dc',
  flamingo: '#f2cdcd',
  pink: '#f5c2e7',
  mauve: '#cba6f7',
  red: '#f38ba8',
  maroon: '#eba0ac',
  peach: '#fab387',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  teal: '#94e2d5',
  sky: '#89dceb',
  sapphire: '#74c7ec',
  blue: '#89b4fa',
  lavender: '#b4befe',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
} as const;

export const radii = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '9999px',
} as const;

export const fontSizes = {
  xs: '11px',
  sm: '12px',
  md: '14px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
} as const;

export const fontWeights = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.3)',
  md: '0 2px 8px rgba(0,0,0,0.4)',
  lg: '0 4px 16px rgba(0,0,0,0.5)',
} as const;
